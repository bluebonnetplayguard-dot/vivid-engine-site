// npm run check:names — fails if a retired name or number comes back anywhere in the repo, or if the
// legal entity name is typed outside the legal line, policy pages, Partner Agreement and receipts.
// Also runs before every `vite build` (package.json "prebuild").
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RETIRED, LEGAL_NAME, LEGAL_NAME_ALLOWED } from '../src/config/retired-names.ts';

const site = fileURLToPath(new URL('..', import.meta.url));
// Scan the whole repo when we're inside it (site/..), otherwise just the site (e.g. the Docker build stage).
const repo = existsSync(join(site, '..', 'backend')) ? join(site, '..') : site;
const prefix = repo === site ? 'site/' : '';
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.seo-build', 'base44-backup', '_backup-2026-10-23', '__pycache__', 'backups']);
const TEXT = /\.(?:jsx?|mjs|cjs|tsx?|css|html?|json|txt|xml|md|webmanifest|ya?ml|conf|template|sh|py|sql|example)$/i;
const SELF = new Set(['site/src/config/retired-names.ts', 'site/scripts/check-retired-names.mjs']);

function* files(path) {
  const st = statSync(path);
  if (st.isFile()) { if (TEXT.test(path) && !/package-lock\.json$/.test(path)) yield path; return; }
  for (const name of readdirSync(path)) if (!SKIP_DIRS.has(name)) yield* files(join(path, name));
}

const problems = [];
for (const file of files(repo)) {
  const rel = prefix + relative(repo, file).split(sep).join('/');
  if (SELF.has(rel)) continue;
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    for (const { text, why } of RETIRED) if (line.includes(text)) problems.push(`${rel}:${i + 1}  "${text}" is retired (${why})`);
    if (line.includes(LEGAL_NAME) && !LEGAL_NAME_ALLOWED.includes(rel))
      problems.push(`${rel}:${i + 1}  "${LEGAL_NAME}" may only appear in the legal line, policy pages, Partner Agreement and receipts. Use BUSINESS.brandName here.`);
  });
}
if (problems.length) {
  console.error(`\nRetired-names check failed (${problems.length}):\n  ${[...new Set(problems)].join('\n  ')}\n`);
  process.exit(1);
}
console.log(`Retired-names check passed (${repo === site ? 'site' : 'whole repo'}).`);
