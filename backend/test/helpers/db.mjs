// Test database helper. Set TEST_DATABASE_URL to an EMPTY scratch database, for example
//   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/vivid_test npm test
// (never a real one: setup drops the public schema). Without it, database tests are skipped.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const dbUrl = process.env.TEST_DATABASE_URL || '';
export const skipDb = dbUrl ? false : 'set TEST_DATABASE_URL to run the database tests';

export async function openTestDb({ migrate = true } = {}) {
  let Pool;
  try { ({ Pool } = await import('pg')); } catch { ({ Pool } = await import('./pg-wire.mjs')); }
  const pool = new Pool({ connectionString: dbUrl });
  if (migrate) {
    await pool.query('DROP SCHEMA public CASCADE');
    await pool.query('CREATE SCHEMA public');
    const dir = join(here, '..', '..', 'src', 'migrations');
    for (const f of readdirSync(dir).filter(n => n.endsWith('.sql')).sort()) await pool.query(readFileSync(join(dir, f), 'utf8'));
  }
  const query = async (text, params = []) => (await pool.query(text, params)).rows;
  const db = {
    query,
    one: async (text, params = []) => (await query(text, params))[0] ?? null,
    tx: async fn => {
      const client = await pool.connect();
      try { await client.query('BEGIN'); const r = await fn({ query: async (t, p = []) => (await client.query(t, p)).rows }); await client.query('COMMIT'); return r; }
      catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; }
      finally { client.release(); }
    },
    close: () => pool.end(),
  };
  return db;
}

export async function makeUser(db, email = `u${Math.random().toString(36).slice(2, 8)}@example.com`) {
  return (await db.one(`INSERT INTO users(email, full_name) VALUES ($1, 'Test Person') RETURNING id, email`, [email]));
}
