// Fails the build if a retired name or number comes back, or if the legal entity name is typed
// outside the legal pages. Runs before `vite build` (see package.json "prebuild").
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RETIRED, LEGAL_NAME, LEGAL_NAME_ALLOWED } from '../src/config/retired-names.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const SCAN = ['src', 'public', 'scripts', 'index.html'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.seo-build']);
const TEXT = /\.(?:jsx?|mjs|cjs|tsx?|css|html?|json|txt|xml|md|webmanifest)$/i;
const SELF = new Set(['src/config/retired-names.js', 'scripts/check-retired-names.mjs']);

function* files(path) {
  const st = statSync(path);
  if (st.isFile()) { if (TEXT.test(path)) yield path; return; }
  for (const name of readdirSync(path)) {
    if (SKIP_DIRS.has(name)) continue;
    yield* files(join(path, name));
  }
}

const problems = [];
for (const entry of SCAN) {
  let start;
  try { start = join(root, entry); statSync(start); } catch { continue; }
  for (const file of files(start)) {
    const rel = relative(root, file).split(sep).join('/');
    if (SELF.has(rel)) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const { text, why } of RETIRED) {
        if (line.includes(text)) problems.push(`${rel}:${i + 1}  "${text}" is retired (${why})`);
      }
      if (line.includes(LEGAL_NAME) && !LEGAL_NAME_ALLOWED.includes(rel)) {
        problems.push(`${rel}:${i + 1}  "${LEGAL_NAME}" may only appear where the legal name is required. Use BUSINESS.brandName here, or BUSINESS.legalName inside legal text.`);
      }
    });
  }
}

if (problems.length) {
  console.error(`\nRetired-names check failed (${problems.length}):\n  ${[...new Set(problems)].join('\n  ')}\n`);
  process.exit(1);
}
console.log('Retired-names check passed.');
