// Takeoff engine: the spec's calculators, the full sample-house takeoff, material swaps and provenance.
// Expected numbers are worked out by hand from the studio's sample house.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const dist = process.env.VE_DIST || new URL('../dist/', import.meta.url).pathname;
const { BuildingModel } = require(dist + 'building-model/index.js');
const { GeometryReader } = require(dist + 'geometry-reader/index.js');
const T = require(dist + 'takeoff/index.js');
const core = new URL('../../site/src/modules/gc-3d-design-studio/core/', import.meta.url);
const { sampleHouse } = await import(new URL('sampleHouse.js', core));
const { applyAll, applyModelCommand } = await import(new URL('commands.js', core));
const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

const model = data => BuildingModel.parse(data);
const g = GeometryReader.read(model(sampleHouse()));
const line = (t, key) => t.lines.find(l => l.key === key);
const base = T.buildTakeoff(model(sampleHouse()));

test('calculators return { value, verified, source } as the spec requires', () => {
  const wall = g.walls.find(w => w.id === 'w1-front');
  const a = T.calculateWallArea(wall);
  assert.deepEqual(Object.keys(a).sort(), ['from', 'source', 'value', 'verified']);
  near(a.value, 45360 / 144);
  near(T.calculateWallArea(wall, 'exterior').value, (486.5 * 120 - 12240) / 144);
  near(T.calculateFloorArea(g.rooms.find(r => r.id === 'r-kitchen')).value, 350);
  near(T.calculateRoofArea(g.roofs[0]).value, 2 * 512 * 196 * Math.sqrt(1.25) / 144, 0.01);
  near(T.calculateConcreteVolume(g.components.find(c => c.id === 'c-slab')).value, 486.5 * 366.5 * 8 / 46656, 1e-6);
  assert.equal(T.calculateDrywallSheets({ value: 100, verified: true, source: 'blueprint', from: [] }, { drywallSheetSqFt: 48 }).value, 3);
  assert.equal(T.calculatePaintGallons({ value: 700, verified: false, source: 'sample', from: [] }, 2, 350).value, 4);
});

test('lumber counts for a 40\' exterior wall with four openings', () => {
  const wall = g.walls.find(w => w.id === 'w1-front');
  const ops = [{ width: 60, sill: 30, kind: 'window' }, { width: 36, sill: 0, kind: 'door' }, { width: 48, sill: 30, kind: 'window' }, { width: 48, sill: 30, kind: 'window' }];
  const lc = T.calculateLumberCounts(wall, ops, { studSpacingIn: 16, plateStockFt: 16 }, 108);
  // 31 layout studs − displaced (floor(w/16) − 1: 2, 1, 2, 2) + 4 × (2 king + 2 jack) + 2 corners
  assert.equal(lc.studs.value, 31 - (2 + 1 + 2 + 2) + 16 + 2);
  assert.equal(lc.plates.value, Math.ceil(40 * 3 / 16));
  near(lc.headerLf.value, ((63 + 39 + 51 + 51) / 12) * 2);
  assert.equal(lc.cripples.value, (Math.ceil(60 / 16) + 1) * 2 + (Math.ceil(36 / 16) + 1) + (Math.ceil(48 / 16) + 1) * 2 * 2);   // 10 + 4 + 16
  assert.equal(lc.size, '2x6');
  assert.equal(lc.studLengthFt, 8.63);
});

test('sample house takeoff: key lines match hand calculations', () => {
  near(line(base, 'concrete.slab').quantity, 30.57);
  assert.equal(line(base, 'concrete.slab').order, 32.25);                    // +5 % rounded up to ¼ yd
  const gable = 2 * 0.5 * 366.5 * 90 / 144;
  near(line(base, 'exterior.siding.vinyl-lap').quantity, (2192.0 + gable) / 100, 0.02);
  near(line(base, 'roofing.asphalt-shingle').quantity, 3 * 2 * 512 * 196 * Math.sqrt(1.25) / 14400, 0.02);
  assert.equal(line(base, 'flooring.oak-floor').quantity, 1225);
  assert.equal(line(base, 'flooring.tile-floor').quantity, 575);
  assert.equal(line(base, 'flooring.tile-floor').wastePct, 15);
  near(line(base, 'flooring.carpet').quantity, 600 / 9);
  assert.equal(line(base, 'drywall.ceilings').quantity, 50);                    // 2,400 sq ft ÷ 48
  assert.equal(line(base, 'cabinets.base.shaker-white').quantity, 15);
  assert.equal(line(base, 'cabinets.upper.shaker-white').quantity, 10);
  near(line(base, 'countertops.quartz-white').quantity, (181 * 25.5 + 104 * 46) / 144);
  assert.equal(base.lines.filter(l => l.category === 'openings' && l.key.startsWith('openings.window')).reduce((s, l) => s + l.quantity, 0), 19);
  assert.equal(base.summary.floorArea, 2400);
  assert.equal(base.summary.verifiedLines, 0);
  assert.match(base.flags[0].message, /sample model/);
  const cats = base.lines.map(l => l.category);
  assert.deepEqual(cats, [...cats].sort((a, b) => ['concrete', 'framing', 'sheathing', 'insulation', 'exterior', 'roofing', 'openings', 'drywall', 'paint', 'trim', 'flooring', 'cabinets', 'countertops'].indexOf(a) - ['concrete', 'framing', 'sheathing', 'insulation', 'exterior', 'roofing', 'openings', 'drywall', 'paint', 'trim', 'flooring', 'cabinets', 'countertops'].indexOf(b)));
  for (const l of base.lines) assert.ok(l.order >= l.quantity - 1e-9, `${l.key}: order ${l.order} < ${l.quantity}`);
});

test('material swaps change the takeoff: brick + metal roof + farmhouse', () => {
  const data = applyAll(sampleHouse(), [
    { type: 'UPDATE_MATERIAL', target: { kind: 'exterior-walls' }, material: 'brick' },
    { type: 'UPDATE_MATERIAL', target: { kind: 'roof' }, material: 'standing-seam' },
  ], {}).model;
  const t = T.buildTakeoff(model(data));
  assert.equal(line(t, 'exterior.siding.vinyl-lap'), undefined);
  near(line(t, 'exterior.siding.brick').quantity, line(base, 'exterior.siding.vinyl-lap').quantity * 100 * 6.75, 2);
  assert.equal(line(t, 'roofing.asphalt-shingle'), undefined);
  near(line(t, 'roofing.standing-seam').quantity, base.summary.roofArea, 0.01);
  const farm = T.buildTakeoff(model(applyAll(sampleHouse(), [{ type: 'UPDATE_MATERIAL', target: { kind: 'exterior-walls' }, material: 'board-batten' }], {}).model));
  assert.ok(line(farm, 'paint.exterior').quantity > 0, 'painted siding adds exterior paint');
});

test('a covered patio adds concrete-free cover, posts and metal roofing', () => {
  const data = applyModelCommand(sampleHouse(), { type: 'ADD_COMPONENT', component: 'covered-patio', side: 'back' }).model;
  const t = T.buildTakeoff(model(data));
  assert.ok(line(t, 'roofing.patio.standing-seam').quantity > 160);
  assert.equal(line(t, 'framing.patio-posts').quantity, 2);
  assert.equal(line(t, 'concrete.patio').quantity, line(base, 'concrete.patio').quantity, 'reuses the existing slab');
});

test('provenance: verified lines need verified sizes', () => {
  const data = sampleHouse();
  data.meta.source = 'blueprint';
  for (const r of data.rooms) r.dims = { status: 'verified', source: 'blueprint', ref: { sheet: 'A-101' } };
  const t = T.buildTakeoff(model(data));
  assert.equal(line(t, 'flooring.oak-floor').verified, true);
  assert.equal(line(t, 'flooring.oak-floor').source, 'blueprint');
  assert.equal(line(t, 'drywall.ceilings').verified, true);
  assert.equal(line(t, 'exterior.siding.vinyl-lap').verified, false);
  assert.equal(line(t, 'exterior.siding.vinyl-lap').source, 'ai-inferred');      // blueprint model, unverified walls
  assert.match(t.flags[0].message, /aren't verified/);
});

test('settings are clamped and change results', () => {
  const s = T.cleanSettings({ drywallSheetSqFt: 32, paintCoats: 99, waste: { flooring: 200, framing: -3 }, evil: '<x>' });
  assert.equal(s.drywallSheetSqFt, 32); assert.equal(s.paintCoats, 4); assert.equal(s.waste.flooring, 50); assert.equal(s.waste.framing, 0);
  assert.ok(!('evil' in s));
  const t = T.buildTakeoff(model(sampleHouse()), s);
  assert.equal(line(t, 'drywall.ceilings').quantity, 75);                      // 2,400 ÷ 32
  assert.deepEqual(T.cleanSettings(null), T.DEFAULT_SETTINGS);
});
