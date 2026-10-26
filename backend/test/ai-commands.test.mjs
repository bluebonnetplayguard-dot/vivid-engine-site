// AI command schema + validators: shape rules, registry, confirmation rules, studio format conversion,
// JSON Schema for Claude, and semantic validation against the sample house.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const dist = process.env.VE_DIST || new URL('../dist/', import.meta.url).pathname;
const A = require(dist + 'ai-commands/index.js');
const { BuildingModel } = require(dist + 'building-model/index.js');
const core = new URL('../../site/src/modules/gc-3d-design-studio/core/', import.meta.url);
const { sampleHouse } = await import(new URL('sampleHouse.js', core));
const { STYLE_PRESETS } = await import(new URL('commands.js', core));
const { quickParse } = await import(new URL('quickparse.js', core));

const ok = c => { const v = A.validateAICommand(c); assert.equal(v.ok, true, JSON.stringify(v.error)); return v; };
const bad = (c, code) => { const v = A.validateAICommand(c); assert.equal(v.ok, false, JSON.stringify(c)); if (code) assert.equal(v.error.code, code); return v.error; };

test('every command type has a registry entry with a payload schema', () => {
  assert.equal(A.AI_COMMAND_TYPES.length, 24);
  for (const t of A.AI_COMMAND_TYPES) { const s = A.COMMAND_REGISTRY[t]; assert.ok(s && s.payload && s.risk && s.summary, t); }
  assert.deepEqual(A.AI_COMMAND_TYPES.filter(t => !A.COMMAND_REGISTRY[t].supported).sort(), ['CHECK_COMPLIANCE', 'CREATE_CHANGE_ORDER', 'CREATE_SCHEDULE', 'EXPORT_DRAWINGS', 'LOAD_BLUEPRINT']);
});

test('valid commands across the three families', () => {
  ok({ type: 'UPDATE_MATERIAL', payload: { target: { kind: 'roof' }, material: 'standing-seam' } });
  ok({ type: 'UPDATE_COLOR', payload: { target: { id: 'roof-main' }, color: '#1d1f22' } });
  ok({ type: 'CHANGE_CAMERA', payload: { preset: 'rotate', degrees: 45 } });
  ok({ type: 'CALCULATE_MATERIALS', payload: {} });
  ok({ type: 'GENERATE_ESTIMATE', payload: { alternateNames: ['Brick version'] } });
  ok({ type: 'PRODUCE_PROPOSAL', payload: { tone: 'formal' } });
  ok({ type: 'SAVE_DESIGN', payload: { note: 'after the call' } });
  ok({ type: 'LOAD_MODEL', payload: { designName: 'Brick version' } });
  ok({ type: 'CREATE_DESIGN_VARIATION', payload: { name: 'Brick', commands: [{ type: 'UPDATE_MATERIAL', payload: { target: { kind: 'exterior-walls' }, material: 'brick' } }] } });
});

test('unsafe or malformed commands are rejected with a code and a reason', () => {
  bad(null, 'NOT_AN_OBJECT');
  bad({ type: 'EXECUTE_JS', payload: { code: 'alert(1)' } }, 'UNKNOWN_TYPE');
  bad({ type: 'UPDATE_MATERIAL', payload: { target: { kind: 'roof' }, material: 'unobtanium' } }, 'BAD_PAYLOAD');
  bad({ type: 'UPDATE_COLOR', payload: { target: { kind: 'roof' }, color: 'url(javascript:x)' } }, 'BAD_PAYLOAD');
  bad({ type: 'MOVE_OBJECT', payload: { target: { kind: 'selected' } } }, 'BAD_PAYLOAD');
  bad({ type: 'MOVE_OBJECT', payload: { target: { kind: 'selected' }, along: 99999 } }, 'BAD_PAYLOAD');
  bad({ type: 'CHANGE_CAMERA', payload: { preset: 'room' } }, 'BAD_PAYLOAD');
  bad({ type: 'UPDATE_MATERIAL', payload: { target: { id: '../../etc' }, material: 'brick' } }, 'BAD_PAYLOAD');
  bad({ type: 'SAVE_DESIGN', payload: {}, extra: 1 }, 'BAD_PAYLOAD');
  bad({ type: 'CREATE_DESIGN_VARIATION', payload: { name: 'x', commands: [{ type: 'MOVE_OBJECT', payload: { target: { kind: 'selected' }, along: 2 } }] } }, 'BAD_PAYLOAD');
  const e = bad({ type: 'CHECK_COMPLIANCE', payload: {} }, 'UNSUPPORTED');
  assert.match(e.message, /never gives code-compliance determinations/);
  const batch = A.validateBatch([...Array(30)].map(() => ({ type: 'SET_LIGHTING', payload: { preset: 'day' } })));
  assert.equal(batch.valid.length, 25); assert.equal(batch.errors[0].code, 'TOO_MANY');
});

test('confirmation rules: geometry always previewed, inferred sizes called out, restore always confirmed', () => {
  const told = ok({ type: 'MOVE_OBJECT', payload: { target: { kind: 'selected' }, along: -24 } });
  assert.equal(told.needsConfirmation, true); assert.match(told.confirmReason, /previewed/);
  const guessed = ok({ type: 'RESIZE_OBJECT', payload: { target: { kind: 'selected' }, width: 60 }, meta: { inferred: ['width'] } });
  assert.match(guessed.confirmReason, /chose width without you giving a size/);
  assert.equal(ok({ type: 'RESTORE_DESIGN', payload: { version: 2 } }).needsConfirmation, true);
  assert.equal(ok({ type: 'SET_LIGHTING', payload: { preset: 'sunset' } }).needsConfirmation, false);
});

test('studio flat format converts both ways, including every quick-parser output and style preset', () => {
  const samples = ['Change the roof to black metal', 'Show me the front of the house', 'Add a covered patio to the back', 'Move this window two feet to the left', 'Show me a brick version', 'Create a modern farmhouse version', 'Show me the kitchen'];
  const flats = samples.flatMap(s => quickParse(s, {}).commands).concat(...Object.values(STYLE_PRESETS));
  for (const flat of flats) {
    const v = ok(A.fromStudioCommand(flat));
    assert.deepEqual(A.toStudioCommand(v.command), flat, JSON.stringify(flat));
  }
});

test('JSON Schema for the Claude tool covers supported commands only', () => {
  const js = A.aiCommandJsonSchema();
  const types = (js.anyOf ?? js.oneOf).map(v => v.properties.type.const);
  assert.ok(types.includes('GENERATE_ESTIMATE'));
  assert.ok(!types.includes('CREATE_SCHEDULE'));
  assert.equal(types.length, 19);
});

test('semantic validation against the sample house', () => {
  const model = BuildingModel.parse(sampleHouse());
  const ctx = { model, selection: 'o-f1-front-2', designs: [{ id: 'd1', title: 'Base design' }, { id: 'd2', title: 'Brick version' }] };
  const run = c => A.validateAgainstModel(A.validateAICommand(c).command, ctx);
  assert.equal(run({ type: 'MOVE_OBJECT', payload: { target: { kind: 'selected' }, along: -24 } }).ok, true);
  assert.match(run({ type: 'MOVE_OBJECT', payload: { target: { kind: 'selected' }, along: -120 } }).problems[0], /overlaps or crowds/);
  assert.match(run({ type: 'MOVE_OBJECT', payload: { target: { id: 'o-front-door' }, up: 12 } }).problems[0], /Doors stay on the floor/);
  assert.match(run({ type: 'RESIZE_OBJECT', payload: { target: { kind: 'room', name: 'kitchen' }, width: 168 } }).problems[0], /resizing rooms isn’t available/);
  assert.match(run({ type: 'RESIZE_OBJECT', payload: { target: { kind: 'window', face: 'front' }, width: 48 } }).problems[0], /matches 7 elements/);
  assert.match(run({ type: 'REMOVE_COMPONENT', payload: { target: { id: 'c-slab' } } }).problems[0], /foundation/);
  assert.match(run({ type: 'REMOVE_COMPONENT', payload: { target: { id: 'w1-front' } } }).problems[0], /can’t be deleted/);
  assert.match(run({ type: 'UPDATE_MATERIAL', payload: { target: { kind: 'roof' }, material: 'brick' } }).problems[0], /can’t go on that surface/);
  const bulk = run({ type: 'UPDATE_COLOR', payload: { target: { kind: 'window' }, color: 'black' } });
  assert.equal(bulk.ok, true); assert.equal(bulk.needsConfirmation, true); assert.match(bulk.confirmReason, /19 elements/);
  assert.match(run({ type: 'CHANGE_CAMERA', payload: { preset: 'room', room: 'garage' } }).problems[0], /no room called “garage”/);
  assert.deepEqual(run({ type: 'CHANGE_CAMERA', payload: { preset: 'room', room: 'kitchen' } }).targets, ['r-kitchen']);
  assert.match(run({ type: 'SET_VIEW', payload: { mode: 'floor', floor: 2 } }).ok ? 'ok' : 'x', /ok/);
  assert.match(run({ type: 'LOAD_MODEL', payload: { designName: 'Stucco' } }).problems[0], /no design called/);
  assert.match(run({ type: 'GENERATE_ESTIMATE', payload: { alternateNames: ['Stone'] } }).warnings[0], /No design called “Stone”/);
  assert.match(run({ type: 'ADD_COMPONENT', payload: { component: 'covered-patio', width: 480 } }).ok ? 'ok' : 'x', /ok/);
  assert.equal(run({ type: 'UPDATE_MATERIAL', payload: { target: { kind: 'selected' }, material: 'aluminum-frame' } }).ok, true);
  assert.equal(A.validateAgainstModel(A.validateAICommand({ type: 'UPDATE_MATERIAL', payload: { target: { kind: 'selected' }, material: 'brick' } }).command, { model, selection: null }).problems[0], 'Nothing is selected.');
});
