// GC 3D Design Studio: model, measurements, command validation and the quick parser.
// Run: node --test tests/studio3d.test.mjs   (from site/)
import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleHouse } from '../src/modules/gc-3d-design-studio/core/sampleHouse.js';
import { measure, validateModel, buildingSummary, roofGeometry, findElement, wallLength } from '../src/modules/gc-3d-design-studio/core/model.js';
import { applyModelCommand, validateCommand, resolveTarget, commandClass, applyAll } from '../src/modules/gc-3d-design-studio/core/commands.js';
import { quickParse } from '../src/modules/gc-3d-design-studio/core/quickparse.js';
import { ftin, parseLength } from '../src/modules/gc-3d-design-studio/core/units.js';

const types = r => r.commands.map(c => c.type);

test('units', () => {
  assert.equal(ftin(0), '0"');
  assert.equal(ftin(30), `2'-6"`);
  assert.equal(ftin(48.5), `4'-0 1/2"`);
  assert.equal(parseLength('two feet'), 24);
  assert.equal(parseLength("3' 6\""), 42);
  assert.equal(parseLength('14 feet wide'), 168);
  assert.equal(parseLength('18 inches'), 18);
  assert.equal(parseLength('no length here'), null);
});

test('sample house is valid and measurable', () => {
  const m = sampleHouse();
  assert.deepEqual(validateModel(m), []);
  const s = buildingSummary(m);
  assert.equal(s.width, 480); assert.equal(s.depth, 360); assert.equal(s.floors, 2);
  assert.equal(s.roomArea, 480 * 360 * 2);
  const roof = roofGeometry(m, m.roofs[0]);
  assert.equal(roof.rise, 90);                                       // 15 ft run at 6:12
  assert.equal(roof.ridgeZ, 216 + 90);
  const wall = measure(m, 'w1-front');
  const net = wall.rows.find(r => r[0] === 'Net wall area')[1];
  const ops = 60 * 60 + 36 * 80 + 48 * 60 * 2;
  assert.equal(net, 480 * 120 - ops);
  const win = measure(m, 'o-f1-front-1');
  assert.equal(win.rows.find(r => r[0] === 'Head height')[1], 90);
  assert.equal(win.status, 'conceptual');
});

test('command shapes are validated; arbitrary input is rejected', () => {
  assert.equal(validateCommand({ type: 'UPDATE_MATERIAL', target: { kind: 'roof' }, material: 'standing-seam' }), null);
  assert.match(validateCommand({ type: 'EVAL', code: 'alert(1)' }), /unknown command/);
  assert.match(validateCommand({ type: 'UPDATE_MATERIAL', target: { kind: 'roof' }, material: 'unobtanium' }), /unknown material/);
  assert.match(validateCommand({ type: 'MOVE_OBJECT', target: { kind: 'selected' }, along: 1e9 }), /move needs/);
  assert.match(validateCommand({ type: 'CREATE_DESIGN_VARIATION', name: 'x', commands: [{ type: 'MOVE_OBJECT', target: { kind: 'selected' }, along: 2 }] }), /only change materials/);
  assert.equal(commandClass({ type: 'CHANGE_CAMERA' }), 'view');
  assert.equal(commandClass({ type: 'MOVE_OBJECT' }), 'geometry');
});

test('materials go only on allowed surfaces', () => {
  const m = sampleHouse();
  const r = applyModelCommand(m, { type: 'UPDATE_MATERIAL', target: { kind: 'roof' }, material: 'standing-seam' });
  assert.equal(findElement(r.model, 'roof-main').el.material, 'standing-seam');
  assert.equal(findElement(m, 'roof-main').el.material, 'asphalt-shingle', 'original model is not mutated');
  const bad = applyModelCommand(m, { type: 'UPDATE_MATERIAL', target: { kind: 'roof' }, material: 'brick' });
  assert.match(bad.error, /can’t go on that surface/);
  const siding = applyModelCommand(m, { type: 'UPDATE_MATERIAL', target: { kind: 'exterior-walls' }, material: 'brick' });
  assert.equal(siding.ids.length, 8);
  assert.ok(siding.model.walls.filter(w => w.exterior).every(w => w.finishExterior === 'brick'));
  assert.ok(siding.model.walls.filter(w => !w.exterior).every(w => w.finishExterior === 'drywall'));
});

test('windows move and resize only within their wall', () => {
  const m = sampleHouse();
  const ok = applyModelCommand(m, { type: 'MOVE_OBJECT', target: { kind: 'selected' }, along: -24 }, { selection: 'o-f1-front-2' });
  assert.equal(ok.error, undefined);
  assert.equal(findElement(ok.model, 'o-f1-front-2').el.offset, 306);
  assert.match(ok.changes[0], /moved 2'-0" left/);
  const crash = applyModelCommand(m, { type: 'MOVE_OBJECT', target: { id: 'o-f1-front-2' }, along: -120 });
  assert.match(crash.error, /overlap|crowd/);
  const off = applyModelCommand(m, { type: 'MOVE_OBJECT', target: { id: 'o-f1-front-1' }, along: -60 });
  assert.match(off.error, /corner/);
  const tall = applyModelCommand(m, { type: 'RESIZE_OBJECT', target: { id: 'o-f1-front-1' }, height: 100 });
  assert.match(tall.error, /header/);
  const wide = applyModelCommand(m, { type: 'RESIZE_OBJECT', target: { id: 'o-f1-front-1' }, width: 72 });
  assert.equal(wide.error, undefined);
  const room = applyModelCommand(m, { type: 'RESIZE_OBJECT', target: { kind: 'room', name: 'kitchen' }, width: 168 });
  assert.match(room.error, /wall-editing tools/);
});

test('covered patio adds a removable group', () => {
  const m = sampleHouse();
  const r = applyModelCommand(m, { type: 'ADD_COMPONENT', component: 'covered-patio', side: 'back' });
  assert.equal(r.error, undefined);
  const added = r.model.components.length - m.components.length;
  assert.ok(added >= 4);
  const roof = r.model.components.find(c => c.kind === 'patio-roof');
  const rm = applyModelCommand(r.model, { type: 'REMOVE_COMPONENT', target: { id: roof.id } });
  assert.equal(rm.model.components.length, m.components.length);
  assert.match(applyModelCommand(m, { type: 'REMOVE_COMPONENT', target: { id: 'c-slab' } }).error, /foundation/);
});

test('targets resolve by kind, face, floor and name', () => {
  const m = sampleHouse();
  assert.deepEqual(resolveTarget(m, { kind: 'roof' }), ['roof-main']);
  assert.equal(resolveTarget(m, { kind: 'window', face: 'front' }).length, 7);
  assert.equal(resolveTarget(m, { kind: 'window', face: 'front', floor: 1 }).length, 3);
  assert.deepEqual(resolveTarget(m, { kind: 'room', name: 'kitchen' }), ['r-kitchen']);
  assert.deepEqual(resolveTarget(m, { kind: 'door', name: 'front door' }), ['o-front-door']);
  assert.deepEqual(resolveTarget(m, { kind: 'selected' }, 'w1-front'), ['w1-front']);
});

test('quick parser handles the directive’s example commands', () => {
  const p = s => quickParse(s, {});
  assert.deepEqual(p('Show me the front of the house.').commands.at(-1), { type: 'CHANGE_CAMERA', preset: 'front' });
  assert.deepEqual(p('Rotate the house to the right.').commands[0], { type: 'CHANGE_CAMERA', preset: 'rotate', degrees: 45 });
  assert.deepEqual(p('Remove the roof so I can see the floor plan.').commands[0], { type: 'SET_VIEW', mode: 'dollhouse' });
  assert.deepEqual(p('Show me the kitchen.').commands[1], { type: 'CHANGE_CAMERA', preset: 'room', room: 'kitchen' });
  assert.deepEqual(p('Change the exterior siding to white.').commands, [{ type: 'UPDATE_COLOR', target: { kind: 'exterior-walls' }, color: 'white' }]);
  assert.deepEqual(p('Make the roof black.').commands, [{ type: 'UPDATE_COLOR', target: { kind: 'roof' }, color: 'black' }]);
  assert.deepEqual(p('Change the roof to black metal.').commands, [
    { type: 'UPDATE_MATERIAL', target: { kind: 'roof' }, material: 'standing-seam' }, { type: 'UPDATE_COLOR', target: { kind: 'roof' }, color: 'black' }]);
  const brick = p('Show me a brick version of this house.');
  assert.equal(brick.commands[0].type, 'CREATE_DESIGN_VARIATION');
  assert.equal(brick.commands[0].commands[0].material, 'brick');
  assert.deepEqual(types(p('Add a covered patio to the back.')), ['ADD_COMPONENT']);
  assert.deepEqual(p('Move this window two feet to the left.').commands[0], { type: 'MOVE_OBJECT', target: { kind: 'selected' }, along: -24 });
  assert.deepEqual(p('Increase this room to 14 feet wide.').commands[0], { type: 'RESIZE_OBJECT', target: { kind: 'selected' }, width: 168 });
  assert.deepEqual(p('Show me the house at sunset.').commands.at(-1), { type: 'SET_LIGHTING', preset: 'sunset' });
  assert.equal(p('Create a modern farmhouse version.').commands[0].type, 'CREATE_DESIGN_VARIATION');
  assert.ok(p('Make this design look more contemporary.').commands.length > 3);
  assert.deepEqual(types(p('Show me what the completed building will look like.')), ['SET_VIEW', 'SET_LIGHTING', 'CHANGE_CAMERA']);
  const multi = p('Change it to white siding, black windows, and a metal roof');
  assert.deepEqual(multi.commands.map(c => `${c.type}:${c.target.kind}:${c.material || c.color}`), [
    'UPDATE_COLOR:exterior-walls:white', 'UPDATE_COLOR:window:black', 'UPDATE_MATERIAL:roof:standing-seam']);
  assert.equal(p('What year was this house built?'), null);
});

test('every parsed command is valid and applies to the sample', () => {
  const m = sampleHouse();
  for (const s of ['Change the roof to black metal', 'brick siding', 'make the cabinets navy', 'change the kitchen floor to hardwood', 'paint the front door red', 'black windows']) {
    const r = quickParse(s, {});
    assert.ok(r, s);
    for (const c of r.commands) assert.equal(validateCommand(c), null, `${s}: ${JSON.stringify(c)}`);
    const out = applyAll(m, r.commands, {});
    assert.equal(out.error, undefined, `${s}: ${out.error}`);
  }
  assert.ok(wallLength(m.walls[0]) === 480);
});

test('server vocabulary lists the same materials as the studio', async () => {
  const { readFileSync } = await import('node:fs');
  const { MATERIALS } = await import('../src/modules/gc-3d-design-studio/core/materials.js');
  const src = readFileSync(new URL('../../backend/src/studio3d/vocabulary.ts', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('MATERIAL_IDS = {'), src.indexOf('} as const'));
  const server = [...block.matchAll(/'([a-z0-9-]+)'/g)].map(m => m[1]).sort();
  assert.deepEqual(server, Object.keys(MATERIALS).sort());
});
