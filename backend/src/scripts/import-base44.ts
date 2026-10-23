// Imports the data exported from the Base44 dashboard.
//
//   node dist/scripts/import-base44.js /import            (folder of exports)
//   node dist/scripts/import-base44.js /import --dry-run  (check without writing)
//
// One file per collection, named after it: User.csv, Project.csv, Lead.json ...
// Record IDs are kept as they were in Base44, so links between records
// (clientUserId, project_id, managedDomainLeaseId, ...) keep working.
// Safe to re-run: records whose ID already exists are skipped.
// Users are created without passwords; they sign in with Google or use
// "Forgot password" once, which also verifies their email.

import { readFileSync, readdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { adminEmails } from '../config';
import { pool, runMigrations } from '../db';
import { entities, validate } from '../entities/definitions';

const ID = /^[a-f0-9]{24}$/i;

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [header, ...body] = rows.filter(r => r.some(c => c.trim()));
  if (!header) return [];
  return body.map(r => Object.fromEntries(header.map((h, i) => [h.trim().replace(/^﻿/, ''), r[i] ?? ''])));
}

// CSV cells hold JSON for arrays/objects and text for everything else.
function revive(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const v = value.trim();
  if (v === '') return null;
  if ((v.startsWith('[') && v.endsWith(']')) || (v.startsWith('{') && v.endsWith('}'))) {
    try { return JSON.parse(v); } catch { return value; }
  }
  return value;
}

function load(file: string): Record<string, any>[] {
  const text = readFileSync(file, 'utf8');
  if (extname(file).toLowerCase() === '.json') {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : parsed.items ?? parsed.records ?? [];
  }
  return parseCsv(text).map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, revive(v)])));
}

const toDate = (v: unknown) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);

async function main() {
  const [dir, flag] = process.argv.slice(2);
  if (!dir) throw new Error('Usage: import-base44 <folder> [--dry-run]');
  const dryRun = flag === '--dry-run';
  await runMigrations();

  const files = new Map(readdirSync(dir).filter(f => /\.(json|csv)$/i.test(f)).map(f => [basename(f, extname(f)), join(dir, f)]));
  const skipped = [...files.keys()].filter(k => k !== 'User' && k !== 'RateLimit' && !entities[k]);
  if (skipped.length) console.warn(`No matching collection for: ${skipped.join(', ')}`);

  // Users first so created_by / clientUserId references resolve.
  const userFile = files.get('User');
  if (userFile) {
    let imported = 0, existing = 0;
    for (const raw of load(userFile)) {
      const email = String(raw.email ?? '').trim().toLowerCase();
      if (!email) continue;
      const role = raw.role === 'admin' || adminEmails.has(email) ? 'admin' : 'user';
      if (dryRun) { imported++; continue; }
      const res = await pool.query(
        `INSERT INTO users(id, email, full_name, role, created_date)
         VALUES (COALESCE($1, new_id()), $2, $3, $4, COALESCE($5::timestamptz, now())) ON CONFLICT DO NOTHING RETURNING id`,
        [ID.test(String(raw.id)) ? String(raw.id).toLowerCase() : null, email, raw.full_name ?? null, role, toDate(raw.created_date)],
      );
      if (res.rowCount) imported++; else existing++;
    }
    console.log(`User: ${imported} ${dryRun ? 'valid' : 'imported'}, ${existing} already present`);
  }

  for (const [name, def] of Object.entries(entities)) {
    const file = files.get(name);
    if (!file) continue;
    let imported = 0, existing = 0;
    const problems: string[] = [];
    for (const raw of load(file)) {
      const { id, created_date, updated_date, created_by, created_by_id, is_sample, ...fields } = raw;
      let data: Record<string, unknown>;
      try {
        data = validate(def, fields, 'create');
      } catch (e) {
        problems.push(`${id || '(no id)'}: ${(e as Error).message.replace(/\s+/g, ' ').slice(0, 160)}`);
        continue;
      }
      if (dryRun) { imported++; continue; }
      const res = await pool.query(
        `INSERT INTO records(id, entity, data, created_by, created_date, updated_date)
         VALUES (COALESCE($1, new_id()), $2, $3, $4, COALESCE($5::timestamptz, now()), COALESCE($6::timestamptz, $5::timestamptz, now()))
         ON CONFLICT (id) DO NOTHING RETURNING id`,
        [ID.test(String(id)) ? String(id).toLowerCase() : null, name, JSON.stringify(data),
          ID.test(String(created_by_id)) ? String(created_by_id).toLowerCase() : null, toDate(created_date), toDate(updated_date)],
      );
      if (res.rowCount) imported++; else existing++;
    }
    console.log(`${name}: ${imported} ${dryRun ? 'valid' : 'imported'}, ${existing} already present, ${problems.length} rejected`);
    problems.slice(0, 20).forEach(p => console.log(`   - ${p}`));
  }
}

main()
  .catch(e => { console.error(e.message); process.exitCode = 1; })
  .finally(() => pool.end());
