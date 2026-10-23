import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow } from 'pg';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config';

// Local Docker Postgres needs no TLS. DigitalOcean Managed PostgreSQL requires it and
// signs with its own CA: pass that CA in DATABASE_CA_CERT (App Platform: ${db.CA_CERT}).
// sslmode is removed from the URL so it can't override the verified TLS settings.
function poolConfig() {
  if (!config.DATABASE_CA_CERT) return { connectionString: config.DATABASE_URL, max: 10 };
  const url = new URL(config.DATABASE_URL);
  url.searchParams.delete('sslmode');
  return { connectionString: url.toString(), max: 10, ssl: { ca: config.DATABASE_CA_CERT, rejectUnauthorized: true } };
}

export const pool = new Pool(poolConfig());
// An idle connection dropped by the server (restart, maintenance, failover) must not crash the API;
// the pool discards it and opens a new one on the next query.
pool.on('error', err => console.error(`[Db] idle connection error: ${err.message}`));

// Applies every .sql file in ./migrations that has not run yet, in name order.
export async function runMigrations(log: (msg: string) => void = console.log) {
  const dir = join(__dirname, 'migrations');
  const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(424242)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map(r => r.name));
    for (const file of files) {
      if (done.has(file)) continue;
      await client.query('BEGIN');
      try {
        await client.query(readFileSync(join(dir, file), 'utf8'));
        await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        log(`Applied migration ${file}`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(424242)').catch(() => {});
    client.release();
  }
}

@Injectable()
export class Db implements OnModuleDestroy {
  private readonly log = new Logger('Db');

  async query<T extends QueryResultRow = any>(text: string, params: unknown[] = []): Promise<T[]> {
    const result = await pool.query<T>(text, params as any[]);
    return result.rows;
  }

  async one<T extends QueryResultRow = any>(text: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.query<T>(text, params);
    return rows[0] ?? null;
  }

  async tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    this.log.log('Closing database pool');
    await pool.end();
  }
}
