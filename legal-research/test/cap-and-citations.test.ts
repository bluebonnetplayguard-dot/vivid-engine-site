import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { passagesFromCase } from '../src/cap/ingest-cap.ts';
import { findCitations, texasStatuteUrl } from '../src/citations.ts';
import { splitIntoPassages } from '../src/passages.ts';

const caseJson = JSON.parse(await readFile(new URL('./fixtures/cap-case.json', import.meta.url), 'utf8'));
const URL_ = 'https://static.case.law/sw-3d/300/cases/0100-01.json';

test('CAP case becomes passages with source, license, url and retrieved_at', () => {
  const ps = passagesFromCase(caseJson, URL_, '2026-10-23T20:00:00Z', 'Tex.');
  assert.ok(ps.length >= 1);
  for (const p of ps) {
    assert.equal(p.source, 'cap');
    assert.equal(p.license, 'CC0-1.0');
    assert.equal(p.url, URL_);
    assert.equal(p.jurisdiction, 'TX');
    assert.equal(p.citation, '300 S.W.3d 100');
    assert.equal(p.date, '2010-05-20');
    assert.match(p.content_hash, /^[0-9a-f]{64}$/);
  }
});

test('head_matter (possible publisher headnotes) is never ingested', () => {
  const text = passagesFromCase(caseJson, URL_, '2026-10-23T20:00:00Z', 'Tex.').map(p => p.text).join(' ');
  assert.doesNotMatch(text, /HEADNOTE|Syllabus by the publisher/);
  assert.match(text, /First paragraph of the opinion/);
});

test('passage splitter keeps passages near the target size', () => {
  const long = Array.from({ length: 40 }, (_, i) => `Paragraph ${i}. ${'Words here. '.repeat(20)}`).join('\n\n');
  const parts = splitIntoPassages(long);
  assert.ok(parts.length > 3);
  assert.ok(parts.every(p => p.length <= 2400));
});

test('Texas statute citations link to the official statutes site', () => {
  const [c] = findCitations('See Tex. Prop. Code § 24.005 for the notice to vacate.');
  assert.equal(c.kind, 'tx-statute');
  assert.equal(c.normalized, 'Tex. Property Code § 24.005');
  assert.equal(c.url, 'https://statutes.capitol.texas.gov/Docs/PR/htm/PR.24.htm#24.005');
  assert.equal(texasStatuteUrl('CP', '16.003'), 'https://statutes.capitol.texas.gov/Docs/CP/htm/CP.16.htm#16.003');
});

test('other citation types are recognized and kept by jurisdiction', () => {
  const found = findCitations('Tex. R. Civ. P. 510.4; La. R.S. 9:3251; La. Civ. Code art. 2683; 15 U.S.C. § 1692; 24 C.F.R. § 982.310; 123 S.W.3d 456; 45 So. 3d 12');
  const kinds = found.map(c => `${c.kind}:${c.jurisdiction}`);
  assert.ok(kinds.includes('tx-rule:TX'));
  assert.ok(kinds.includes('la-statute:LA'));
  assert.ok(kinds.includes('la-civil-code:LA'));
  assert.ok(kinds.includes('us-code:US'));
  assert.ok(kinds.includes('cfr:US'));
  assert.ok(kinds.includes('case:TX'));
  assert.ok(kinds.includes('case:LA'));
});
