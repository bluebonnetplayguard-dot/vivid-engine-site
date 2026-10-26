// Proposal generator: numbers from the estimate only, phase prices that add up, AI wording guard,
// alternates, verified-vs-inferred note, escaping of entered text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const dist = process.env.VE_DIST || new URL('../dist/', import.meta.url).pathname;
const { BuildingModel } = require(dist + 'building-model/index.js');
const { buildTakeoff } = require(dist + 'takeoff/index.js');
const E = require(dist + 'estimating/index.js');
const P = require(dist + 'proposal/index.js');
const core = new URL('../../site/src/modules/gc-3d-design-studio/core/', import.meta.url);
const { sampleHouse } = await import(new URL('sampleHouse.js', core));
const { applyAll } = await import(new URL('commands.js', core));

const est = (data, id = 'd1', title = 'Base design') => E.buildEstimate({ takeoff: buildTakeoff(BuildingModel.parse(data)), takeoffHash: 'h', design: { id, title, version: 1 }, costTable: E.STARTER_COST_TABLE, settings: E.DEFAULT_ESTIMATE_SETTINGS });
const base = est(sampleHouse());
base.alternates.push(E.compareAlternate(base, est(applyAll(sampleHouse(), [{ type: 'UPDATE_MATERIAL', target: { kind: 'exterior-walls' }, material: 'brick' }], {}).model, 'd2', 'Brick version')));
const options = { company: { name: 'Example Builders LLC', phone: '(555) 010-0000' }, customer: { name: 'Jordan Smith' }, validDays: 30, includeAlternates: true, showLineItems: true, tone: 'friendly' };
const now = new Date('2026-10-26T15:00:00Z');
const make = (extra = {}) => P.buildProposal({ estimate: base, estimateVersion: 3, projectName: 'Smith residence', options, now, ...extra });

test('phase prices add up to the estimate total exactly', () => {
  const p = make();
  assert.equal(p.total, Math.round(base.totals.price));
  assert.equal(p.phases.reduce((s, x) => s + x.price, 0), p.total);
  assert.deepEqual(p.phases.map(x => x.id), ['site', 'structure', 'envelope', 'interior']);
  assert.ok(p.phases.every(x => x.price > 0));
  assert.equal(p.validUntil, '2026-11-25');
  assert.equal(p.wording, 'template');
});

test('scope bullets list work, never prices', () => {
  const p = make();
  const env = p.phases.find(x => x.id === 'envelope').scope;
  assert.ok(env.some(s => /Vinyl lap siding: about 24\.2 squares/.test(s)), env.join('\n'));
  assert.ok(env.some(s => /^Window 4'×5' \(vinyl frame\): 4$/.test(s)));
  assert.ok(p.phases.every(ph => ph.scope.every(s => !/\$/.test(s))));
  assert.ok(!env.some(s => /drip edge|underlayment/i.test(s)), 'accessories are folded into the main item');
  assert.deepEqual(make({ options: { ...options, showLineItems: false } }).phases[0].scope, []);
});

test('alternates show the price change in words and numbers from the estimate', () => {
  const p = make();
  assert.equal(p.alternates[0].title, 'Brick version');
  assert.equal(p.alternates[0].delta, Math.round(base.alternates[0].delta));
  assert.match(p.markdown, /\*\*Brick version\*\*: add \$[\d,]+ \(total \$[\d,]+\)/);
  assert.equal(make({ options: { ...options, includeAlternates: false } }).alternates.length, 0);
});

test('AI wording with numbers, prices, claims or links is rejected and replaced', () => {
  for (const bad of ['We will finish in 6 weeks.', 'Only $5,000 down.', 'We are fully licensed and insured.', 'Backed by our lifetime warranty.', 'See https://example.com', 'Meets all codes.']) {
    assert.equal(P.checkWording(bad).ok, false, bad);
  }
  assert.equal(P.checkWording('We look forward to building your new home with you.').ok, true);
  const p = make({ wording: { intro: 'Thanks! This costs $212,000.', phases: { site: 'We pour the slab carefully and cure it properly.', envelope: 'Fully insured crews install everything.' }, closing: 'Call us anytime with questions.' }, wordingEngine: 'claude' });
  assert.equal(p.wording, 'claude');
  assert.match(p.phases.find(x => x.id === 'site').description, /pour the slab carefully/);
  assert.match(p.phases.find(x => x.id === 'envelope').description, /^Weather-tight exterior/);   // template fallback
  assert.match(p.intro, /^Hi Jordan Smith,/);                                                       // template fallback
  assert.equal(p.closing, 'Call us anytime with questions.');
  assert.ok(p.notices.some(n => /introduction.*contains numbers/.test(n)));
  assert.ok(p.notices.some(n => /makes a claim/.test(n)));
  const allBad = make({ wording: { intro: '1', phases: {}, closing: '2' }, wordingEngine: 'claude' });
  assert.equal(allBad.wording, 'template');
});

test('quantities note and contractor notices', () => {
  const p = make();
  assert.match(p.quantitiesNote, /have not yet been verified/);
  assert.ok(p.notices[0].includes('starter placeholder prices'));
  assert.ok(!p.markdown.includes('starter'), 'internal notices stay out of the customer document');
  const verified = { ...base, lines: base.lines.map(l => ({ ...l, verified: true })) };
  assert.match(P.buildProposal({ estimate: verified, estimateVersion: 1, projectName: 'x', options, now }).quantitiesNote, /^All quantities/);
});

test('entered text is escaped in the Markdown; company details are only what was entered', () => {
  const p = make({ options: { ...options, customer: { name: 'Pat <script>alert(1)</script> [x](javascript:y)' }, terms: '50 % deposit | balance on completion' } });
  assert.ok(!p.markdown.includes('<script>'));
  assert.ok(!/(^|[^\\])\]\(/m.test(p.markdown), 'no unescaped link syntax from entered text');
  assert.equal(p.phases.find(x => x.id === 'structure').scope.filter(b => /^Wall framing/.test(b)).length, 1);
  assert.match(p.markdown, /50 % deposit \\\| balance on completion/);
  assert.match(p.markdown, /\*\*Example Builders LLC\*\*/);
  assert.ok(!/licen[cs]ed|insured|warrant/i.test(p.markdown), 'no claims unless the contractor entered them');
  assert.match(p.markdown, /## Total: \$[\d,]+ \(about \$\d+ per sq ft/);
  assert.match(p.markdown, /## Not included/);
});
