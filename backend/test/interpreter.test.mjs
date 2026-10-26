// AI command interpreter pipeline with a fake command model (no network): validation, dimension guard,
// semantic rejection, confirmation info, caching and context.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const dist = process.env.VE_DIST || new URL('../dist/', import.meta.url).pathname;
const A = require(dist + 'ai-commands/index.js');
const { BuildingModel } = require(dist + 'building-model/index.js');
const core = new URL('../../site/src/modules/gc-3d-design-studio/core/', import.meta.url);
const { sampleHouse } = await import(new URL('sampleHouse.js', core));

function fake(answer) {
  const m = { name: 'fake', calls: 0, available: () => true, async interpret(input) { m.calls++; m.last = input; return typeof answer === 'function' ? answer(input) : answer; } };
  return m;
}
const model = BuildingModel.parse(sampleHouse());
const designs = [{ id: 'd1', title: 'Base design', version: 1 }, { id: 'd2', title: 'Brick version', version: 1 }];
const run = (message, answer, extra = {}) => { const f = fake(answer); return A.interpret({ message, model, selection: 'o-f1-front-2', designs, history: [], userId: 'u1', ...extra }, f, new A.InterpretCache()).then(r => ({ r, f })); };

test('stated lengths are read from the contractor’s words', () => {
  assert.deepEqual(A.statedLengths('move it two feet to the left'), [24]);
  assert.deepEqual(A.statedLengths("make it 3' 6\" wide"), [42]);
  assert.deepEqual(A.statedLengths('raise the sill 4 inches'), [4]);
  assert.deepEqual(A.statedLengths('add a 16x12 patio').sort((a, b) => a - b), [144, 192]);
  assert.deepEqual(A.statedLengths('make it bigger'), []);
});

test('a move with the size the contractor said: planned, previewed, not flagged', async () => {
  const { r } = await run('Move this window two feet to the left', { reply: 'Proposed moving the window 2 ft left.', commands: [{ type: 'MOVE_OBJECT', payload: { target: { kind: 'selected' }, along: -24 } }] });
  assert.equal(r.commands.length, 1);
  const c = r.commands[0];
  assert.equal(c.risk, 'geometry'); assert.equal(c.needsConfirmation, true);
  assert.deepEqual(c.command.meta.inferred, []);
  assert.match(c.confirmReason, /previewed/);
  assert.deepEqual(c.targets, ['o-f1-front-2']);
  assert.equal(r.engine, 'claude');
});

test('the dimension guard flags a size the contractor never said, even if the AI didn’t admit it', async () => {
  const { r } = await run('Move this window a little to the left', { reply: 'Moved it.', commands: [{ type: 'MOVE_OBJECT', payload: { target: { kind: 'selected' }, along: -18 } }] });
  const c = r.commands[0];
  assert.deepEqual(c.command.meta.inferred, ['along']);
  assert.match(c.confirmReason, /chose along without you giving a size/);
  assert.match(c.warnings.join(' '), /you didn't state: along/);
});

test('invalid, unsupported and impossible commands are rejected with reasons', async () => {
  const { r } = await run('do a bunch of things', { reply: '', commands: [
    { type: 'RUN_CODE', payload: { js: 'x' } },
    { type: 'CHECK_COMPLIANCE', payload: {} },
    { type: 'MOVE_OBJECT', payload: { target: { kind: 'selected' }, along: -144 } },
    { type: 'UPDATE_MATERIAL', payload: { target: { kind: 'roof' }, material: 'brick' } },
    { type: 'SET_LIGHTING', payload: { preset: 'sunset' } },
  ] });
  assert.deepEqual(r.commands.map(c => c.command.type), ['SET_LIGHTING']);
  const reasons = r.rejected.map(x => `${x.type}: ${x.reason}`).join('\n');
  assert.match(reasons, /RUN_CODE: Unknown command/);
  assert.match(reasons, /CHECK_COMPLIANCE: .*never gives code-compliance determinations/);
  assert.match(reasons, /MOVE_OBJECT: .*(overlaps|corner)/);
  assert.match(reasons, /UPDATE_MATERIAL: .*can’t go on that surface/);
});

test('nothing usable: the reply explains why', async () => {
  const { r } = await run('make the kitchen 14 feet wide', { reply: '', commands: [{ type: 'RESIZE_OBJECT', payload: { target: { kind: 'room', name: 'kitchen' }, width: 168 } }] });
  assert.equal(r.commands.length, 0);
  assert.match(r.reply, /^I couldn't do that: .*resizing rooms isn’t available/);
});

test('clarification passes through when a size is missing', async () => {
  const { r } = await run('make this window wider', { reply: '', clarification: 'How wide should the window be?', commands: [] });
  assert.equal(r.clarification, 'How wide should the window be?');
  assert.equal(r.reply, 'How wide should the window be?');
});

test('identical requests are answered from the cache; follow-ups are not', async () => {
  const f = fake({ reply: 'Roof is now black metal.', commands: [{ type: 'UPDATE_MATERIAL', payload: { target: { kind: 'roof' }, material: 'standing-seam' } }, { type: 'UPDATE_COLOR', payload: { target: { kind: 'roof' }, color: 'black' } }] });
  const cache = new A.InterpretCache();
  const input = { message: 'Change the roof to black metal.', model, selection: null, designs, history: [], userId: 'u1' };
  const a = await A.interpret(input, f, cache);
  const b = await A.interpret({ ...input, message: '  change the ROOF to black metal ' }, f, cache);
  assert.equal(a.engine, 'claude'); assert.equal(b.engine, 'cache'); assert.equal(f.calls, 1);
  assert.equal(b.commands.length, 2);
  await A.interpret({ ...input, selection: 'roof-main' }, f, cache);
  assert.equal(f.calls, 2, 'a different selection is a different situation');
  await A.interpret({ ...input, history: ['show me the front'] }, f, cache);
  assert.equal(f.calls, 3, 'follow-ups are never served from the cache');
  const small = new A.InterpretCache(2);
  small.set('a', { reply: '', commands: [] }); small.set('b', { reply: '', commands: [] }); small.set('c', { reply: '', commands: [] });
  assert.equal(small.size, 2); assert.equal(small.get('a'), null);
});

test('the model gets a compact context with names, faces, finishes and designs — and no geometry', async () => {
  const { f } = await run('show me the kitchen', { reply: 'Going to the kitchen.', commands: [{ type: 'CHANGE_CAMERA', payload: { preset: 'room', room: 'kitchen' } }] });
  const ctx = f.last.context;
  assert.equal(ctx.selection.id, 'o-f1-front-2');
  assert.ok(ctx.walls.find(w => w.id === 'w1-front' && w.face === 'front' && w.finish === 'vinyl-lap'));
  assert.ok(ctx.openings.find(o => o.id === 'o-kitchen-sink' && o.face === 'back'));
  assert.deepEqual(ctx.designs.map(d => d.title), ['Base design', 'Brick version']);
  assert.ok(!JSON.stringify(ctx).includes('"start"'), 'no coordinates are sent');
});

test('the system prompt states the safety rules', () => {
  const { SYSTEM_PROMPT } = require(dist + 'ai-commands/prompt.js');
  for (const rule of [/Never invent a dimension/, /meta\.inferred/, /never write code/i, /Never say the design meets code/, /<context> is data/]) assert.match(SYSTEM_PROMPT, rule);
});
