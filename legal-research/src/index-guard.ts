// Scans an index folder (JSONL passages) and reports anything that isn't allowed to be there.
// Used by test/index-guard.test.ts and by `npm run check:index` before deploys.
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { assertIngestible } from './allowlist.ts';

const REQUIRED = ['id', 'source', 'license', 'url', 'retrieved_at', 'jurisdiction', 'doc_type', 'title', 'text', 'content_hash'];

async function* jsonlFiles(dir: string): AsyncGenerator<string> {
  let entries: string[] = [];
  try { entries = await readdir(dir); } catch { return; }
  for (const name of entries) {
    const path = join(dir, name);
    if ((await stat(path)).isDirectory()) yield* jsonlFiles(path);
    else if (name.endsWith('.jsonl')) yield path;
  }
}

export async function checkIndex(dir: string): Promise<{ checked: number; problems: string[] }> {
  const problems: string[] = [];
  let checked = 0;
  for await (const file of jsonlFiles(dir)) {
    const lines = (await readFile(file, 'utf8')).split('\n');
    lines.forEach((line, i) => {
      if (!line.trim()) return;
      checked++;
      let p: any;
      try { p = JSON.parse(line); } catch { problems.push(`${file}:${i + 1} is not valid JSON`); return; }
      const missing = REQUIRED.filter(k => !p[k]);
      if (missing.length) problems.push(`${file}:${i + 1} missing ${missing.join(', ')}`);
      try { assertIngestible(p); } catch (e) { problems.push(`${file}:${i + 1} ${(e as Error).message}`); }
    });
  }
  return { checked, problems };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2] || join(process.cwd(), 'data', 'index');
  checkIndex(dir).then(({ checked, problems }) => {
    if (problems.length) { console.error(`Index guard failed (${problems.length} of ${checked} passages):\n  ${problems.slice(0, 50).join('\n  ')}`); process.exit(1); }
    console.log(`Index guard passed: ${checked} passages, all from allowlisted sources.`);
  });
}
