// Geometry reader: every expected number below was worked out by hand from the studio's sample house
// (40' x 30', 10' first floor with 9' ceilings, 8' second floor, 6:12 gable with 16" overhangs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const dist = process.env.VE_DIST || new URL('../dist/', import.meta.url).pathname;
const { BuildingModel } = require(dist + 'building-model/index.js');
const { GeometryReader, chainLoop, toSqFt, toCuYd } = require(dist + 'geometry-reader/index.js');
const core = new URL('../../site/src/modules/gc-3d-design-studio/core/', import.meta.url);
const { sampleHouse } = await import(new URL('sampleHouse.js', core));
const { applyModelCommand } = await import(new URL('commands.js', core));
const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

const read = data => GeometryReader.read(BuildingModel.parse(data));
const g = read(sampleHouse());
const by = (list, id) => list.find(x => x.id === id);

test('front wall: lengths, gross, openings and net areas', () => {
  const w = by(g.walls, 'w1-front');
  assert.equal(w.length.value, 480);
  assert.equal(w.outsideLength.value, 486.5);                     // corners: centerline + 6 1/2"
  assert.equal(w.grossArea.value, 57600);                         // 480 x 120
  assert.equal(w.openingArea.value, 60 * 60 + 36 * 80 + 2 * 48 * 60);
  assert.equal(w.netArea.value, 57600 - 12240);
  assert.equal(w.exteriorFaceArea.value, 486.5 * 120 - 12240);
  assert.equal(w.interiorFaceArea.value, (480 - 6.5) * 108 - 12240);   // inside face, 9' ceiling
  assert.deepEqual(w.rooms.sort(), ['r-dining', 'r-living']);
  assert.deepEqual(w.direction, [1, 0]);
  assert.equal(w.length.verified, false); assert.equal(w.length.source, 'sample');
});

test('kitchen: area, perimeter and wall surface net of its four openings', () => {
  const k = by(g.rooms, 'r-kitchen');
  assert.equal(k.area.value, 240 * 210);
  near(toSqFt(k.area.value), 350);
  assert.equal(k.perimeter.value, 900);
  assert.equal(k.ceilingHeight.value, 108);
  assert.deepEqual(k.openings.sort(), ['o-f1-right-2', 'o-i1-b', 'o-i3-a', 'o-kitchen-sink']);
  assert.equal(k.openingArea.value, 48 * 42 + 36 * 60 + 36 * 84 + 72 * 84);
  assert.equal(k.wallSurfaceNet.value, 900 * 108 - 13248);
  assert.deepEqual(k.walls.sort(), ['w1-back', 'w1-i1', 'w1-i3', 'w1-right']);
});

test('roof: 6:12 gable with 16" overhangs', () => {
  const r = by(g.roofs, 'roof-main');
  assert.equal(r.run.value, 180); assert.equal(r.rise.value, 90);
  near(r.pitchFactor.value, Math.sqrt(1.25), 1e-4);
  near(r.angle.value, 26.5651, 1e-3);
  assert.equal(r.ridgeLength.value, 512);
  near(r.rafterLength.value, 196 * Math.sqrt(1.25));
  near(r.surfaceArea.value, 2 * 512 * 196 * Math.sqrt(1.25), 0.05);
  near(r.squares.value, 2 * 512 * 196 * Math.sqrt(1.25) / 14400, 1e-3);
  assert.equal(r.planArea.value, 512 * 392);
  assert.equal(r.ridgeHeight.value, 216 + 90 + 6);
  assert.equal(r.eaveLength.value, 1024);
});

test('openings: head height, trim and world position', () => {
  const o = by(g.openings, 'o-f1-front-1');
  assert.equal(o.head.value, 90);
  assert.equal(o.trimPerimeter.value, 2 * (60 + 60));
  assert.deepEqual(o.center, [70, 0, 60]);
  const d = by(g.openings, 'o-front-door');
  assert.equal(d.trimPerimeter.value, 2 * 80 + 36);
  const up = by(g.openings, 'o-f2-left-2');                      // 2nd floor, left wall runs y 360 -> 0
  assert.deepEqual(up.center, [0, 90, 120 + 30 + 27]);
});

test('components, floors and building totals', () => {
  const slab = by(g.components, 'c-slab');
  near(toCuYd(slab.volume.value), 486.5 * 366.5 * 8 / 46656, 1e-6);
  assert.equal(by(g.components, 'c-base-cab').frontLength.value, 180);
  const f1 = by(g.floors, 'f1');
  assert.equal(f1.footprintArea.value, 480 * 360);
  assert.equal(f1.exteriorPerimeter.value, 1680);
  assert.equal(f1.ceilingHeight.value, 108);
  assert.equal(f1.interiorWallLength.value, 360 + 240 + 240);
  assert.equal(g.building.totalRoomArea.value, 2 * 480 * 360);
  assert.equal(g.building.height.value, 312);
  assert.equal(g.building.windowCount.value, 19);
  assert.equal(g.building.doorCount.value, 5);                    // cased openings have no door
  assert.equal(g.unverified.length, 14 + 28 + 8 + 1 + 9);
  assert.deepEqual(g.warnings, []);
});

test('provenance: verified only when every input is; weakest source wins', () => {
  const data = sampleHouse();
  const ref = { sheet: 'A-101', page: 1, title: 'First floor plan' };
  for (const w of data.walls.filter(w => w.floor === 'f1' && w.exterior)) w.dims = { status: 'verified', source: 'blueprint', ref };
  const r = read(data);
  const front = by(r.walls, 'w1-front');
  assert.equal(front.length.verified, true); assert.equal(front.length.source, 'blueprint'); assert.deepEqual(front.length.ref, ref);
  assert.equal(front.netArea.verified, false, 'the windows are still sample sizes');
  assert.equal(front.netArea.source, 'sample');
  assert.equal(by(r.floors, 'f1').footprintArea.verified, true);
  data.openings.find(o => o.id === 'o-f1-front-1').dims = { status: 'conceptual', source: 'ai-inferred' };
  assert.equal(by(read(data).walls, 'w1-front').netArea.source, 'sample');   // other windows still sample
});

test('edits flow through: moved window, added patio, open outline warning', () => {
  let data = applyModelCommand(sampleHouse(), { type: 'ADD_COMPONENT', component: 'covered-patio', side: 'back' }).model;
  const r = read(data);
  const roof = r.components.find(c => c.kind === 'patio-roof');
  assert.ok(roof.topArea.value > 192 * 120);
  data = sampleHouse();
  data.walls = data.walls.filter(w => w.id !== 'w2-left');
  assert.ok(read(data).warnings.some(w => /don't close/.test(w)));
  assert.equal(chainLoop([{ start: [0, 0], end: [10, 0] }, { start: [10, 0], end: [10, 10] }]), null);
});
