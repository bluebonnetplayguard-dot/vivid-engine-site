// Caselaw Access Project ingestion (CC0). Downloads opinions from static.case.law for one jurisdiction,
// splits them into passages, checks every passage against the allowlist, and writes JSONL that
// src/store/load-postgres.ts loads into PostgreSQL + pgvector.
//
// Usage:
//   node --experimental-strip-types src/cap/ingest-cap.ts --jurisdiction Tex. --dry-run
//   node --experimental-strip-types src/cap/ingest-cap.ts --jurisdiction Tex. --limit-volumes 5
//   node --experimental-strip-types src/cap/ingest-cap.ts --jurisdiction Tex. --reporters tex,sw-3d
//
// Run --dry-run first: it lists the matching reporters and prints the field names of the first case,
// so you can confirm the bulk layout before a long run.
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { assertIngestible, sha256, type Passage } from '../allowlist.ts';
import { splitIntoPassages } from '../passages.ts';
import { sourceById } from '../allowlist.ts';

const BASE = 'https://static.case.law';
const SOURCE = sourceById('cap')!;
const JURISDICTION_CODE: Record<string, string> = { 'Tex.': 'TX', 'La.': 'LA', 'U.S.': 'US' };

type Args = { jurisdiction: string; reporters?: string[]; limitVolumes?: number; out: string; dryRun: boolean; delayMs: number };
function parseArgs(argv: string[]): Args {
  const get = (flag: string) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  return {
    jurisdiction: get('--jurisdiction') || 'Tex.',
    reporters: get('--reporters')?.split(',').map(s => s.trim()).filter(Boolean),
    limitVolumes: get('--limit-volumes') ? Number(get('--limit-volumes')) : undefined,
    out: get('--out') || join(process.cwd(), 'data', 'index', 'cap'),
    dryRun: argv.includes('--dry-run'),
    delayMs: Number(get('--delay-ms') || 250), // be polite to the static host
  };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function getJson(url: string, tries = 4): Promise<any> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'VividEngineLegalResearch/1.0 (+https://vividenginesolutions.com)' } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (attempt >= tries) throw new Error(`GET ${url} failed: ${(e as Error).message}`);
      await sleep(1000 * attempt * attempt);
    }
  }
}

const listOf = (x: any): any[] => (Array.isArray(x) ? x : Array.isArray(x?.results) ? x.results : []);
const jurisdictionNames = (rep: any): string[] => listOf(rep.jurisdictions).map((j: any) => j?.name || j?.name_abbreviation || j).filter(Boolean);
const caseJurisdiction = (c: any): string => c?.jurisdiction?.name || c?.jurisdiction?.name_abbreviation || '';

// Opinion text only. head_matter is skipped on purpose: it can hold publisher syllabi or headnotes.
function opinionsOf(c: any): Array<{ label: string; text: string }> {
  const ops = listOf(c?.casebody?.opinions ?? c?.casebody?.data?.opinions);
  return ops.map((o: any, i: number) => ({ label: [o.type || 'opinion', o.author].filter(Boolean).join(' · ') || `opinion ${i + 1}`, text: String(o.text || '') }))
    .filter(o => o.text.trim());
}

function preferredCitation(c: any): string | undefined {
  const cites = listOf(c?.citations);
  return (cites.find((x: any) => x.type === 'official') || cites[0])?.cite;
}

export function passagesFromCase(c: any, url: string, retrievedAt: string, jurisdictionName: string): Passage[] {
  const out: Passage[] = [];
  const jurisdiction = JURISDICTION_CODE[jurisdictionName] || jurisdictionName;
  const docId = `cap:${c.id ?? sha256(url).slice(0, 16)}`;
  let n = 0;
  for (const op of opinionsOf(c)) {
    for (const text of splitIntoPassages(op.text)) {
      const p: Passage = {
        id: `${docId}:${n++}`,
        source: SOURCE.id,
        license: SOURCE.license,
        url,
        retrieved_at: retrievedAt,
        jurisdiction,
        court: c?.court?.name || c?.court?.name_abbreviation,
        date: c?.decision_date,
        citation: preferredCitation(c),
        doc_type: 'case',
        title: c?.name_abbreviation || c?.name || 'Untitled case',
        section: op.label,
        text,
        content_hash: sha256(text),
      };
      assertIngestible(p);
      out.push(p);
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const reporters = listOf(await getJson(`${BASE}/ReportersMetadata.json`));
  if (!reporters.length) throw new Error('ReportersMetadata.json was empty or missing. Check the static.case.law layout.');
  const picked = reporters.filter((r: any) => {
    const slug = r.slug || r.reporter_slug;
    if (args.reporters) return args.reporters.includes(slug);
    return jurisdictionNames(r).includes(args.jurisdiction);
  });
  console.log(`Reporters for ${args.jurisdiction}: ${picked.map((r: any) => `${r.slug} (${r.short_name || r.full_name})`).join(', ') || 'none'}`);

  await mkdir(args.out, { recursive: true });
  const manifestPath = join(args.out, 'manifest.json');
  const done: Record<string, string> = existsSync(manifestPath) ? JSON.parse(await readFile(manifestPath, 'utf8')) : {};
  let cases = 0, passages = 0, skippedOtherJurisdiction = 0;

  for (const rep of picked) {
    const slug = rep.slug || rep.reporter_slug;
    const volumes = listOf(await getJson(`${BASE}/${slug}/VolumesMetadata.json`));
    const vols = volumes.map((v: any) => String(v.volume_number ?? v.volume_folder ?? v.id)).filter(Boolean);
    for (const vol of vols.slice(0, args.limitVolumes ?? vols.length)) {
      const key = `${slug}/${vol}`;
      if (done[key] && !args.dryRun) continue;
      const listing = listOf(await getJson(`${BASE}/${slug}/${vol}/CasesMetadata.json`));
      const outFile = join(args.out, `${slug}-${vol}.jsonl`);
      if (!args.dryRun) await writeFile(outFile, '');
      for (const entry of listing) {
        const file = entry.file_name || (entry.first_page && entry.ordinal ? `${String(entry.first_page).padStart(4, '0')}-${String(entry.ordinal).padStart(2, '0')}` : null);
        if (!file) continue;
        const url = `${BASE}/${slug}/${vol}/cases/${file}.json`;
        const c = await getJson(url);
        await sleep(args.delayMs);
        if (!c) continue;
        if (args.dryRun) {
          console.log(`\nFirst case: ${url}\nTop-level fields: ${Object.keys(c).join(', ')}\ncasebody fields: ${Object.keys(c.casebody || {}).join(', ')}\njurisdiction: ${caseJurisdiction(c)}  court: ${c?.court?.name}  date: ${c.decision_date}  cite: ${preferredCitation(c)}\nopinions: ${opinionsOf(c).length}`);
          return;
        }
        if (caseJurisdiction(c) !== args.jurisdiction) { skippedOtherJurisdiction++; continue; } // regional reporters mix states
        const ps = passagesFromCase(c, url, new Date().toISOString(), args.jurisdiction);
        if (ps.length) await appendFile(outFile, ps.map(p => JSON.stringify(p)).join('\n') + '\n');
        cases++; passages += ps.length;
      }
      done[key] = new Date().toISOString();
      await writeFile(manifestPath, JSON.stringify(done, null, 2));
      console.log(`${key}: done (${cases} cases, ${passages} passages so far)`);
    }
  }
  console.log(`\nFinished. ${cases} ${args.jurisdiction} cases, ${passages} passages. Skipped ${skippedOtherJurisdiction} cases from other states.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e.message); process.exit(1); });
