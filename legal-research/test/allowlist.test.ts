import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assertIngestible, isBlockedUrl, sourceForUrl, SourceRejected } from '../src/allowlist.ts';
import { LEGAL_SOURCES } from '../config/legal-sources.ts';

const base = { license: 'CC0-1.0', retrieved_at: '2026-10-23T20:00:00Z', text: 'Opinion text.' };

test('every source records a license, a terms link and at least one domain', () => {
  for (const s of LEGAL_SOURCES) {
    assert.ok(s.license, `${s.id} license`);
    assert.match(s.termsUrl, /^https:\/\//, `${s.id} termsUrl`);
    assert.ok(s.domains.length > 0, `${s.id} domains`);
    if (s.access === 'full' && s.id !== 'courtlistener') assert.ok(s.termsReviewed, `${s.id} is full access but terms are not recorded`);
  }
});

test('CAP passages are accepted', () => {
  assert.equal(assertIngestible({ ...base, source: 'cap', url: 'https://static.case.law/tex/1/cases/0001-01.json' }).id, 'cap');
});

test('licensed research services are rejected by domain and by name', () => {
  for (const url of ['https://next.westlaw.com/Document/I1', 'https://cocounsel.com/x', 'https://app.harvey.ai/x', 'https://advance.lexis.com/x', 'https://www.bloomberglaw.com/x', 'https://casetext.com/case/x']) {
    assert.ok(isBlockedUrl(url), url);
    assert.equal(sourceForUrl(url), null, url);
    assert.throws(() => assertIngestible({ ...base, source: 'cap', url }), SourceRejected, url);
  }
  assert.throws(() => assertIngestible({ ...base, source: 'westlaw', url: 'https://static.case.law/tex/1/cases/0001-01.json' }), SourceRejected);
  assert.throws(() => assertIngestible({ ...base, source: 'Harvey', url: 'https://static.case.law/tex/1/cases/0001-01.json' }), SourceRejected);
});

test('unknown domains and mismatched sources are rejected', () => {
  assert.throws(() => assertIngestible({ ...base, source: 'cap', url: 'https://www.example.com/opinion' }), SourceRejected);
  assert.throws(() => assertIngestible({ ...base, source: 'cap', url: 'https://www.ecfr.gov/current/title-24' }), SourceRejected);
});

test('link-only sources cannot be stored until their terms are reviewed', () => {
  assert.throws(() => assertIngestible({ ...base, source: 'tx-statutes', license: 'Official government text', url: 'https://statutes.capitol.texas.gov/Docs/PR/htm/PR.24.htm' }), /link-only/);
});

test('license, timestamp and text are required', () => {
  const url = 'https://static.case.law/tex/1/cases/0001-01.json';
  assert.throws(() => assertIngestible({ ...base, source: 'cap', url, license: 'All rights reserved' }), /License mismatch/);
  assert.throws(() => assertIngestible({ ...base, source: 'cap', url, retrieved_at: '' }), /retrieved_at/);
  assert.throws(() => assertIngestible({ ...base, source: 'cap', url, text: '  ' }), /Empty text/);
});

test('CourtListener is blocked in production until COURTLISTENER_COMMERCIAL=true', () => {
  const prevEnv = process.env.NODE_ENV, prevFlag = process.env.COURTLISTENER_COMMERCIAL;
  const cl = LEGAL_SOURCES.find(s => s.id === 'courtlistener')!;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.COURTLISTENER_COMMERCIAL;
    assert.equal(cl.productionAllowed(), false);
    process.env.COURTLISTENER_COMMERCIAL = 'true';
    assert.equal(cl.productionAllowed(), true);
  } finally {
    process.env.NODE_ENV = prevEnv;
    if (prevFlag === undefined) delete process.env.COURTLISTENER_COMMERCIAL; else process.env.COURTLISTENER_COMMERCIAL = prevFlag;
  }
});

test('no code in this package calls a licensed research connector', async () => {
  const offenders: string[] = [];
  const walk = async (dir: string) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p);
      else if (/\.(ts|js|mjs)$/.test(e.name) && /mcp__|Ask Harvey|cocounsel_chat|ask_cocounsel|westlaw\.com\/api/i.test(await readFile(p, 'utf8'))) offenders.push(p);
    }
  };
  await walk(new URL('../src', import.meta.url).pathname);
  assert.deepEqual(offenders, []);
});
