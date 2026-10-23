// Loads ingested JSONL passages into PostgreSQL. Every row is re-checked against the allowlist first.
// Usage: DATABASE_URL=postgres://... node --experimental-strip-types src/store/load-postgres.ts data/index/cap
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assertIngestible, type Passage } from '../allowlist.ts';

async function main() {
  const dir = process.argv[2] || join(process.cwd(), 'data', 'index');
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL first.');
  // `pg` is a dependency of this package (npm install in legal-research/).
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let rows = 0;
  try {
    for (const name of (await readdir(dir)).filter(f => f.endsWith('.jsonl'))) {
      const lines = (await readFile(join(dir, name), 'utf8')).split('\n').filter(Boolean);
      await client.query('BEGIN');
      for (const line of lines) {
        const p = JSON.parse(line) as Passage;
        assertIngestible(p);
        await client.query(
          `INSERT INTO legal_passages (id, source, license, url, retrieved_at, jurisdiction, court, decided_on, citation, doc_type, title, section, body, content_hash)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           ON CONFLICT (id) DO UPDATE SET body = EXCLUDED.body, content_hash = EXCLUDED.content_hash, retrieved_at = EXCLUDED.retrieved_at
           WHERE legal_passages.content_hash <> EXCLUDED.content_hash`,
          [p.id, p.source, p.license, p.url, p.retrieved_at, p.jurisdiction, p.court ?? null, /^\d{4}-\d{2}-\d{2}$/.test(p.date || '') ? p.date : null,
            p.citation ?? null, p.doc_type, p.title, p.section ?? null, p.text, p.content_hash],
        );
        rows++;
      }
      await client.query('COMMIT');
      console.log(`${name}: loaded`);
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
  console.log(`Loaded ${rows} passages.`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
