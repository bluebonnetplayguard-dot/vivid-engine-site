// Estimating engine: cost matching, line pricing, totals (margin and markup), alternates, overrides,
// regional factors, settings validation and contractor cost tables.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const dist = process.env.VE_DIST || new URL('../dist/', import.meta.url).pathname;
const { BuildingModel } = require(dist + 'building-model/index.js');
const { buildTakeoff } = require(dist + 'takeoff/index.js');
const E = require(dist + 'estimating/index.js');
const core = new URL('../../site/src/modules/gc-3d-design-studio/core/', import.meta.url);
const { sampleHouse } = await import(new URL('sampleHouse.js', core));
const { applyAll } = await import(new URL('commands.js', core));
const near = (a, b, tol = 0.011) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

const takeoff = data => buildTakeoff(BuildingModel.parse(data));
const estimate = (t, settings = E.DEFAULT_ESTIMATE_SETTINGS, table = E.STARTER_COST_TABLE, id = 'd1', title = 'Base design') =>
  E.buildEstimate({ takeoff: t, takeoffHash: 'h', design: { id, title, version: 1 }, costTable: table, settings });
const base = takeoff(sampleHouse());
const est = estimate(base);
const line = (e, key) => e.lines.find(l => l.key === key);

test('the starter table prices every line of the sample takeoff in the right unit', () => {
  const unpriced = est.lines.filter(l => !l.priced).map(l => l.key);
  assert.deepEqual(unpriced, []);
  for (const l of base.lines) assert.equal(E.matchCostItem(E.STARTER_COST_TABLE, l).unitMismatch, false, l.key);
  assert.equal(est.lines.length, base.lines.length);
});

test('matching: exact beats pattern, fewer wildcards and longer literals win, unit must fit', () => {
  const table = { ...E.STARTER_COST_TABLE, items: [
    { match: 'cabinets.*', unit: 'lf', material: { unitCost: 1, source: 'starter' } },
    { match: 'cabinets.base.*', unit: 'lf', material: { unitCost: 2, source: 'starter' } },
    { match: 'cabinets.*.walnut-cabinet', unit: 'lf', material: { unitCost: 3, source: 'starter' } },
    { match: 'cabinets.base.walnut-cabinet', unit: 'lf', material: { unitCost: 4, source: 'starter' } },
    { match: 'flooring.oak-floor', unit: 'sq yd', material: { unitCost: 9, source: 'starter' } },
  ] };
  const m = key => E.matchCostItem(table, { key, unit: 'lf' }).item?.material.unitCost;
  assert.equal(m('cabinets.base.walnut-cabinet'), 4);
  assert.equal(m('cabinets.upper.walnut-cabinet'), 3);
  assert.equal(m('cabinets.base.shaker-white'), 2);
  assert.equal(m('cabinets.island.shaker-white'), 1);
  assert.deepEqual(E.matchCostItem(table, { key: 'flooring.oak-floor', unit: 'sq ft' }), { item: null, unitMismatch: true });
  assert.deepEqual(E.matchCostItem(table, { key: 'nothing.here', unit: 'ea' }), { item: null, unitMismatch: false });
  assert.equal(E.matchCostItem(table, { key: 'cabinetsXbase', unit: 'lf' }).item, null, 'dots are literal');
});

test('line pricing: material on order qty, labor and sub on net qty', () => {
  const slab = line(est, 'concrete.slab');
  const tl = base.lines.find(l => l.key === 'concrete.slab');
  near(slab.materialCost, 165 * tl.order);
  near(slab.subCost, 120 * tl.quantity);
  assert.equal(slab.laborCost, 0);
  const studs = line(est, base.lines.find(l => l.key.startsWith('framing.studs-2x6')).key);
  near(studs.materialCost, 9.5 * studs.orderQuantity);
  near(studs.laborHours, Math.round(0.15 * studs.quantity * 100) / 100);
  near(studs.laborCost, studs.laborHours * 55);
  assert.equal(slab.priceSource, 'starter');
});

test('totals: direct, overhead, contingency and margin pricing by hand', () => {
  const t = est.totals;
  const sumOf = k => est.lines.reduce((s, l) => s + l[k], 0);
  near(t.material, sumOf('materialCost'), 0.05);
  near(t.direct, t.material + t.labor + t.sub, 0.05);
  near(t.overhead, t.direct * 0.10, 0.05);
  near(t.contingency, t.direct * 0.05, 0.05);
  near(t.cost, t.direct * 1.15, 0.05);
  near(t.price, t.cost / 0.8, 0.05);                  // 20 % gross margin
  near(t.profit / t.price, 0.2, 1e-4);
  near(t.pricePerSqFt, t.price / 2400, 0.01);
  near(t.byCategory.reduce((s, c) => s + c.total, 0), t.material + t.labor + t.sub, 0.1);
  const markup = estimate(base, { ...E.DEFAULT_ESTIMATE_SETTINGS, pricing: 'markup', profitPct: 20, salesTaxPct: 8.25 });
  near(markup.totals.salesTax, markup.totals.material * 0.0825, 0.05);
  near(markup.totals.price, markup.totals.cost * 1.2, 0.05);
  assert.ok(est.flags.some(f => /starter placeholder prices/.test(f.message)));
  assert.ok(est.flags.some(f => /sample model/.test(f.message)));
});

test('regional factors and per-line overrides', () => {
  const r = estimate(base, { ...E.DEFAULT_ESTIMATE_SETTINGS, region: { region: 'Test', material: 1.1, labor: 0.9 }, overrides: { 'concrete.slab': { materialUnitCost: 200 } } });
  const slab = line(r, 'concrete.slab'), tl = base.lines.find(l => l.key === 'concrete.slab');
  near(slab.materialCost, 200 * tl.order * 1.1);
  near(slab.subCost, 120 * tl.quantity * 0.9);
  assert.equal(slab.priceSource, 'starter', 'sub price is still a starter price');
  const both = estimate(base, { ...E.DEFAULT_ESTIMATE_SETTINGS, overrides: { 'concrete.slab': { materialUnitCost: 200, subUnitCost: 100 } } });
  assert.equal(line(both, 'concrete.slab').priceSource, 'override');
  const ex = estimate(base, { ...E.DEFAULT_ESTIMATE_SETTINGS, exclude: ['concrete.slab'] });
  assert.equal(line(ex, 'concrete.slab'), undefined);
  assert.ok(ex.totals.price < est.totals.price);
});

test('alternates: brick and metal roof vs the base design', () => {
  const alt = takeoff(applyAll(sampleHouse(), [
    { type: 'UPDATE_MATERIAL', target: { kind: 'exterior-walls' }, material: 'brick' },
    { type: 'UPDATE_MATERIAL', target: { kind: 'roof' }, material: 'standing-seam' },
  ], {}).model);
  const altEst = estimate(alt, undefined, undefined, 'd2', 'Brick + metal');
  const cmp = E.compareAlternate(est, altEst);
  near(cmp.delta, altEst.totals.price - est.totals.price);
  assert.ok(cmp.delta > 0, 'brick and metal cost more than vinyl and shingles');
  const keys = cmp.changes.map(c => c.key);
  for (const k of ['exterior.siding.brick', 'exterior.siding.vinyl-lap', 'roofing.standing-seam', 'roofing.asphalt-shingle']) assert.ok(keys.includes(k), k);
  assert.deepEqual(cmp.byCategory.map(c => c.category).sort(), ['exterior', 'roofing']);
  assert.ok(Math.abs(cmp.changes[0].delta) >= Math.abs(cmp.changes.at(-1).delta));
});

test('settings validation rejects bad input with a readable reason', () => {
  assert.deepEqual(E.cleanEstimateSettings(undefined), E.DEFAULT_ESTIMATE_SETTINGS);
  assert.equal(E.cleanEstimateSettings({ profitPct: 25, pricing: 'markup' }).profitPct, 25);
  assert.throws(() => E.cleanEstimateSettings({ profitPct: 95 }), /profitPct/);
  assert.throws(() => E.cleanEstimateSettings({ hack: true }), /Estimate settings/);
  assert.throws(() => E.cleanEstimateSettings({ region: { region: 'x', material: 9, labor: 1 } }), /region/);
});

test('contractor cost table: own prices win, starter prices fill the gaps', () => {
  const input = E.CostTableInput.parse({ name: 'Bluebonnet 2026', laborRatePerHour: 62, items: [
    { match: 'exterior.siding.vinyl-lap', unit: 'squares', material: { unitCost: 150, source: 'supplier' }, sub: { unitCost: 200, trade: 'Siding' } },
  ] });
  const table = E.contractorTable('t1', input, E.STARTER_COST_TABLE, '2026-10-26');
  const r = estimate(base, { ...E.DEFAULT_ESTIMATE_SETTINGS, costTableId: 't1' }, table);
  const siding = line(r, 'exterior.siding.vinyl-lap');
  assert.equal(siding.materialUnitCost, 150);
  assert.equal(siding.priceSource, 'contractor');                         // weakest of supplier + contractor
  assert.equal(line(r, 'concrete.slab').priceSource, 'starter');
  assert.ok(r.flags.some(f => /lines use starter placeholder prices/.test(f.message)));
  assert.throws(() => E.CostTableInput.parse({ name: 'x', laborRatePerHour: 50, items: [{ match: 'a b', unit: 'ea', material: { unitCost: 1 } }] }));
  assert.throws(() => E.CostTableInput.parse({ name: 'x', laborRatePerHour: 50, items: [{ match: 'a', unit: 'ea' }] }));
});
