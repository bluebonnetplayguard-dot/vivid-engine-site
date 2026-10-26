// GC 3D Design Studio: the server-side command vocabulary (what the AI interpreter is allowed to return).
// Save, version and image routes are covered end to end by scripts/studio3d-e2e.mjs against a running API.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const dist = process.env.VE_DIST || new URL('../dist/', import.meta.url).pathname;
const { checkCommands, Command, ALL_MATERIALS } = require(dist + 'studio3d/vocabulary.js');

test('valid commands pass, unknown or unsafe ones are dropped with a reason', () => {
  const { commands, dropped } = checkCommands([
    { type: 'UPDATE_MATERIAL', target: { kind: 'roof' }, material: 'standing-seam' },
    { type: 'UPDATE_COLOR', target: { kind: 'roof' }, color: 'black' },
    { type: 'CHANGE_CAMERA', preset: 'front' },
    { type: 'MOVE_OBJECT', target: { kind: 'selected' }, along: -24 },
    { type: 'RUN_SCRIPT', code: 'fetch("/api/auth/me")' },
    { type: 'UPDATE_MATERIAL', target: { kind: 'roof' }, material: 'kryptonite' },
    { type: 'UPDATE_COLOR', target: { kind: 'roof' }, color: 'url(javascript:alert(1))' },
    { type: 'CHANGE_CAMERA', preset: 'front', extra: '<script>' },
  ]);
  assert.equal(commands.length, 4);
  assert.equal(dropped.length, 4);
  assert.match(dropped[0], /RUN_SCRIPT/);
});

test('variations may only carry finish changes', () => {
  assert.equal(Command.safeParse({ type: 'CREATE_DESIGN_VARIATION', name: 'Brick', commands: [{ type: 'UPDATE_MATERIAL', target: { kind: 'exterior-walls' }, material: 'brick' }] }).success, true);
  assert.equal(Command.safeParse({ type: 'CREATE_DESIGN_VARIATION', name: 'Bad', commands: [{ type: 'MOVE_OBJECT', target: { kind: 'selected' }, along: 12 }] }).success, false);
});

test('limits: at most 25 commands per answer, numbers bounded', () => {
  const many = Array.from({ length: 40 }, () => ({ type: 'SET_LIGHTING', preset: 'day' }));
  assert.equal(checkCommands(many).commands.length, 25);
  assert.equal(Command.safeParse({ type: 'MOVE_OBJECT', target: { kind: 'selected' }, along: 1e6 }).success, false);
  assert.ok(ALL_MATERIALS.includes('brick'));
  assert.deepEqual(checkCommands('not a list'), { commands: [], dropped: [] });
});
