// Structured building model: schema, relationships, provenance and validation.
// Uses the 3D Studio's own sample house and command layer (site/src/modules/gc-3d-design-studio/core),
// so the server schema can't drift from what the browser produces.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const dist = process.env.VE_DIST || new URL('../dist/', import.meta.url).pathname;
const { BuildingModel, ModelParseError, validateBuilding, errorsOnly, buildingModelJsonSchema, segmentsOverlap } = require(dist + 'building-model/index.js');
const core = new URL('../../site/src/modules/gc-3d-design-studio/core/', import.meta.url);
const { sampleHouse } = await import(new URL('sampleHouse.js', core));
const { applyModelCommand, STYLE_PRESETS, applyAll } = await import(new URL('commands.js', core));

test('the studio sample house parses and has no errors', () => {
  const m = BuildingModel.parse(sampleHouse());
  assert.equal(m.walls.length, 14);
  assert.equal(m.windows.length, 19);
  assert.equal(m.doors.length, 9);
  assert.deepEqual(errorsOnly(validateBuilding(m)), []);
});

test('models the studio produces after edits still parse (patio, moves, styles)', () => {
  let data = sampleHouse();
  data = applyModelCommand(data, { type: 'ADD_COMPONENT', component: 'covered-patio', side: 'back' }).model;
  data = applyModelCommand(data, { type: 'MOVE_OBJECT', target: { id: 'o-f1-front-2' }, along: -24 }).model;
  data = applyAll(data, STYLE_PRESETS['modern farmhouse'], {}).model;
  const m = BuildingModel.parse(data);
  assert.ok(m.components.some(c => c.kind === 'patio-roof' && c.box.r));
  assert.deepEqual(errorsOnly(validateBuilding(m)), []);
});

test('relationships: rooms and walls, openings and walls', () => {
  const m = BuildingModel.parse(sampleHouse());
  const kitchen = m.wallsOfRoom('r-kitchen').map(w => w.id).sort();
  assert.deepEqual(kitchen, ['w1-back', 'w1-i1', 'w1-i3', 'w1-right']);
  assert.deepEqual(m.roomsOfWall('w1-i1').map(r => r.id).sort(), ['r-dining', 'r-family', 'r-kitchen', 'r-living']);
  assert.deepEqual(m.roomsOfWall('w1-front').map(r => r.id).sort(), ['r-dining', 'r-living']);
  assert.deepEqual(m.openingsInWall('w1-front').map(o => o.id), ['o-f1-front-1', 'o-front-door', 'o-f1-front-2', 'o-f1-front-3']);
  assert.equal(m.wallOf(m.find('o-kitchen-sink').el).face, 'back');
  assert.deepEqual(m.componentsInRoom('r-kitchen').length, 6);
  assert.equal(m.kindOf('roof-main'), 'roof');
  assert.ok(segmentsOverlap([0, 0], [10, 0], [5, 0], [20, 0]));
  assert.ok(!segmentsOverlap([0, 0], [10, 0], [10, 0], [20, 0]), 'touching end to end is not overlap');
  assert.ok(!segmentsOverlap([0, 0], [10, 0], [0, 1], [10, 1]), 'parallel offset is not overlap');
});

test('provenance: sample sizes are not verified; verified needs a reason', () => {
  const data = sampleHouse();
  const m = BuildingModel.parse(data);
  assert.deepEqual(m.provenance('w1-front'), { verified: false, source: 'sample', ref: undefined });
  data.walls[0].dims = { status: 'verified', source: 'ai-inferred' };
  data.walls[1].dims = { status: 'verified', source: 'blueprint' };
  data.walls[2].dims = { status: 'verified', source: 'blueprint', ref: { sheet: 'A-101', page: 2, title: 'First floor plan' } };
  data.walls[3].dims = { status: 'verified', source: 'contractor', verifiedBy: 'Field measure' };
  const codes = errorsOnly(validateBuilding(BuildingModel.parse(data))).map(f => `${f.element}:${f.code}`);
  assert.deepEqual(codes, ['w1-front:dims.verified-source', 'w1-right:dims.verified-ref']);
  assert.equal(BuildingModel.parse(data).provenance('w1-back').verified, true);
});

test('schema rejects malformed and unsafe input with readable paths', () => {
  const bad = sampleHouse();
  bad.walls[0].height = -5;
  bad.openings[0].kind = 'skylight';
  bad.extra = '<script>';
  assert.throws(() => BuildingModel.parse(bad), e => e instanceof ModelParseError && e.issues.some(i => i.path === 'walls.0.height') && /walls\.0\.height/.test(e.message));
  assert.throws(() => BuildingModel.parse({ schema: 'gc-building/2' }), ModelParseError);
  assert.equal(BuildingModel.tryParse(null).model, null);
});

test('validation catches what the studio would refuse', () => {
  const data = sampleHouse();
  data.openings.find(o => o.id === 'o-f1-front-2').offset = 200;          // into the front door
  data.walls.push({ ...data.walls[0], id: 'w1-front' });                  // duplicate id
  data.rooms[0].floor = 'f9';
  const codes = errorsOnly(validateBuilding(BuildingModel.parse(data))).map(f => f.code);
  for (const c of ['id.duplicate', 'floor.missing', 'opening.overlap']) assert.ok(codes.includes(c), `${c} in ${codes}`);
});

test('JSON Schema export describes the model', () => {
  const js = buildingModelJsonSchema();
  assert.equal(js.type, 'object');
  for (const k of ['schema', 'floors', 'walls', 'openings', 'rooms', 'roofs', 'components']) assert.ok(js.properties[k], k);
});
