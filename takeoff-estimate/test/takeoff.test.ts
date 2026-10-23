import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../src/measure.ts';
import { VividProvider, StackProvider } from '../src/provider.ts';
import { ApprovalGate } from '../src/approval.ts';

const close = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('printed scales', () => {
  close(M.parseScale('1/8"=1\'-0"'), 1 / 9);            // 1/8 in = 9 pt per ft
  close(M.parseScale('1/4"=1\'-0"'), 1 / 18);
  close(M.parseScale('1-1/2"=1\'-0"'), 1 / 108);
  close(M.parseScale('1"=20\''), 20 / 72);
  close(M.parseScale('1:100'), 100 / 864);
  assert.throws(() => M.parseScale('about one inch'));
});

test('calibration agrees within 1% and warns beyond', () => {
  const printed = M.parseScale('1/8"=1\'-0"');
  const ok = M.calibrate([0, 0], [720, 0], 80, printed);    // 80 ft = 10 in = 720 pt at 1/8"
  close(ok.ftPerPt, 1 / 9); assert.equal(ok.warn, false);
  const bad = M.calibrate([0, 0], [700, 0], 80, printed);   // printed at 97%: 2.86% off
  assert.equal(bad.warn, true); assert.ok(bad.mismatchPct! > 2.8 && bad.mismatchPct! < 2.9);
});

test('linear, area with cut-out, volume, roof, wall', () => {
  const k = 1 / 9;
  close(M.linearFt([[0, 0], [1080, 0], [1080, 720]], k), 200);
  close(M.areaSf([[0, 0], [900, 0], [900, 900], [0, 900]], k, [[[0, 0], [90, 0], [90, 90], [0, 90]]]), 10000 - 100);
  close(M.volumeCy(324, 4), 4);                              // 324 SF × 4 in = 108 CF = 4 CY
  close(M.roofAreaSf(1000, 6), 1000 * Math.sqrt(1.25));
  close(M.wallAreaSf(40, 9, 42), 318);
});

test('fence posts: corners, ends, line posts, gate', () => {
  const k = 1 / 9;   // 1/8" scale
  const r = M.fencePosts([[0, 0], [0, 1080], [720, 1080], [720, 0]], k, 8, 1);   // 120 + 80 + 120 ft, one gate
  close(r.totalFt, 320);
  assert.equal(r.terminals, 4); assert.equal(r.linePosts, 14 + 9 + 14); assert.equal(r.posts, 42); assert.equal(r.bays, 40);
  const exact = M.fencePosts([[0, 0], [72 * 2, 0]], k, 8);   // 16 ft: 2 bays, 1 line post
  assert.equal(exact.linePosts, 1); assert.equal(exact.posts, 3);
});

test('approval gate: preview first, nothing written until approved', async () => {
  const vivid = new VividProvider();
  const gate = new ApprovalGate({ vivid, stack: new StackProvider({}) });
  const est = { companyId: 'c1', userId: 'u1', role: 'estimator' as const };
  const chg = gate.propose(est, 'vivid', 'createProject', { name: 'Smith backyard fence' });
  assert.equal(chg.summary, 'Create project "Smith backyard fence"');
  assert.equal((await vivid.findProjects(est)).length, 0);                       // not written yet
  await gate.approve(est, chg.id);
  assert.equal((await vivid.findProjects(est)).length, 1);
  await assert.rejects(() => gate.approve(est, chg.id), /already approved/);
  assert.deepEqual(gate.audit.map(a => a.action), ['propose', 'approve']);
});

test('roles and company isolation', async () => {
  const vivid = new VividProvider();
  const gate = new ApprovalGate({ vivid });
  assert.throws(() => gate.propose({ companyId: 'c1', userId: 'v', role: 'viewer' }, 'vivid', 'createProject', { name: 'x' }), /view but not change/);
  const a = { companyId: 'A', userId: 'u', role: 'owner' as const }, b = { companyId: 'B', userId: 'u', role: 'owner' as const };
  const c = gate.propose(a, 'vivid', 'createProject', { name: 'A job' });
  await assert.rejects(() => gate.approve(b, c.id), /not found/);                // another company can't approve it
  await gate.approve(a, c.id);
  assert.equal((await vivid.findProjects(b)).length, 0);                          // and can't see it
});

test('STACK stays off until certified', async () => {
  const gate = new ApprovalGate({ stack: new StackProvider({ STACK_ENABLED: 'false' }) });
  assert.throws(() => gate.propose({ companyId: 'c', userId: 'u', role: 'owner' }, 'stack', 'createProject', { name: 'x' }), /not switched on/);
  assert.equal(new StackProvider({ STACK_ENABLED: 'true', STACK_CLIENT_ID: 'id', STACK_CLIENT_SECRET: 's' }).enabled(), true);
});
