// AI command router with fake services (no database, no network): server-side re-validation, confirmation gates,
// studio edits applied with the studio's own code and saved as one version, view commands handed to the browser,
// compute commands routed to takeoff / estimating / proposal, and the command-log status update.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// The services read config at load time; these are throwaway test values (nothing connects to them).
for (const [k, v] of Object.entries({ DATABASE_URL: 'postgres://test:test@127.0.0.1:1/test', JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdef', JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef', PUBLIC_CLIENT_SECRET: 'test-public-secret-0123456789abcdef' })) process.env[k] ??= v;
const dist = process.env.VE_DIST || new URL('../dist/', import.meta.url).pathname;
const { CommandRouterService } = require(dist + 'ai-commands/router/command-router.service.js');
const { loadStudioCore, studioCoreDir } = require(dist + 'ai-commands/router/studio-core.js');
const core = new URL('../../site/src/modules/gc-3d-design-studio/core/', import.meta.url);
const { sampleHouse } = await import(new URL('sampleHouse.js', core));

const user = { id: 'u1', email: 'gc@example.com' };
const clone = o => JSON.parse(JSON.stringify(o));

function setup({ version = 3, designs = [{ id: 'd1', title: 'Base design', version: 3 }, { id: 'd2', title: 'Brick version', version: 1 }], lastProposal = null, maxEstimate = 2 } = {}) {
  const calls = { saved: [], created: [], takeoffs: [], estimates: [], proposals: [], status: [] };
  const design = { id: 'd1', project_id: 'p1', title: 'Base design', version, data: { model: sampleHouse(), view: { camera: 'front' } } };
  const db = {
    async query(sql) { if (/FROM studio_designs/.test(sql)) return designs; return []; },
    async one(sql) {
      if (/max\(version\)/.test(sql)) return { version: maxEstimate };
      if (/FROM proposal_exports/.test(sql)) return lastProposal;
      return null;
    },
  };
  const studio = {
    async getDesign(_u, id) { if (id !== 'd1') { const e = new Error('nf'); throw e; } return clone(design); },
    async version(_u, _id, v) { if (v === '2') return { version: 2, data: { model: sampleHouse(), view: {} } }; throw new Error('nf'); },
    async saveDesign(_u, id, body) { calls.saved.push({ id, body }); return { id, version: design.version + 1 }; },
    async createDesign(_u, projectId, body) { calls.created.push({ projectId, body }); return { id: 'd9', project_id: projectId, title: body.title, version: 1 }; },
  };
  const takeoffs = { async start(_u, projectId, body) { calls.takeoffs.push({ projectId, body }); return { id: 't1', status: 'queued', cached: false }; } };
  const estimates = { async create(_u, projectId, body) { calls.estimates.push({ projectId, body }); return { version: 4, price: '212656.4', result: { alternates: body.alternates.map(id => ({ designId: id })), flags: [{ message: 'Starter prices.' }] } }; } };
  const proposals = { async generate(_u, projectId, v, body) { calls.proposals.push({ projectId, v, body }); return { id: 'pr1', proposal: { total: 212656, notices: [] } }; } };
  const interpreter = { async setStatus(_u, id, body) { calls.status.push({ id, ...body }); return { id, status: body.status }; } };
  const router = new CommandRouterService(db, studio, takeoffs, estimates, proposals, interpreter);
  const run = (commands, extra = {}) => router.execute(user, { projectId: 'p1', designId: 'd1', commands: commands.map(c => (c.command ? c : { command: c })), ...extra });
  return { router, run, calls, design };
}

test('the server loads the studio’s own command code', async () => {
  assert.ok(studioCoreDir(), 'studio core folder found');
  const c = await loadStudioCore();
  assert.equal(typeof c.applyModelCommand, 'function');
  assert.equal(typeof c.applyAll, 'function');
  assert.equal(await loadStudioCore(), c, 'cached');
});

test('appearance edits are applied with the studio code and saved as ONE new version', async () => {
  const { run, calls } = setup();
  const r = await run([
    { type: 'UPDATE_MATERIAL', payload: { target: { kind: 'roof' }, material: 'standing-seam' } },
    { type: 'UPDATE_COLOR', payload: { target: { kind: 'roof' }, color: '#1d1f22' } },
  ], { logId: 'log1', message: 'black metal roof', baseVersion: 3 });
  assert.deepEqual(r.results.map(x => x.status), ['applied', 'applied']);
  assert.equal(calls.saved.length, 1);
  assert.equal(r.savedVersion, 4);
  assert.equal(r.version, 4);
  const saved = calls.saved[0].body;
  assert.equal(saved.baseVersion, 3);
  assert.match(saved.note, /^AI: black metal roof/);
  assert.deepEqual(saved.data.view, { camera: 'front' }, 'the saved view is kept');
  const roof = saved.data.model.roofs?.[0] ?? saved.data.model.roof;
  assert.ok(JSON.stringify(roof).includes('standing-seam'), 'material applied to the saved model');
  assert.deepEqual(calls.status, [{ id: 'log1', status: 'executed', version: 4 }]);
  assert.match(r.summary, /2 changes applied \(saved as version 4\)/);
});

test('preview mode changes nothing and saves nothing', async () => {
  const { run, calls } = setup();
  const r = await run([{ type: 'UPDATE_MATERIAL', payload: { target: { kind: 'roof' }, material: 'standing-seam' } }, { type: 'CALCULATE_MATERIALS', payload: {} }], { mode: 'preview', logId: 'log1' });
  assert.deepEqual(r.results.map(x => x.status), ['previewed', 'previewed']);
  assert.equal(r.savedVersion, null);
  assert.equal(calls.saved.length + calls.takeoffs.length + calls.status.length, 0);
});

test('geometry needs confirmation; with confirmed: true it runs', async () => {
  const { run, calls } = setup();
  const move = { type: 'MOVE_OBJECT', payload: { target: { id: 'o-f1-front-2' }, along: -24 } };
  const a = await run([move], { logId: 'log1' });
  assert.equal(a.results[0].status, 'needs-confirmation');
  assert.equal(calls.saved.length, 0);
  assert.equal(calls.status.length, 0, 'a plan waiting for confirmation stays open in the log');
  const b = await run([{ command: move, confirmed: true }], { logId: 'log1' });
  assert.equal(b.results[0].status, 'applied', b.results[0].message);
  assert.equal(calls.saved.length, 1);
});

test('the client’s plan is never trusted: bad and unsafe commands are rejected here', async () => {
  const { run, calls } = setup();
  const r = await run([
    { type: 'EXECUTE_JS', payload: { code: 'alert(1)' } },
    { type: 'REMOVE_COMPONENT', payload: { target: { id: 'c-slab' } } },
    { type: 'UPDATE_MATERIAL', payload: { target: { kind: 'roof' }, material: 'brick' } },
    { type: 'CHECK_COMPLIANCE', payload: {} },
  ], { logId: 'log1' });
  assert.deepEqual(r.results.map(x => x.status), ['rejected', 'rejected', 'rejected', 'rejected']);
  assert.match(r.results[1].message, /foundation/);
  assert.equal(calls.saved.length, 0);
  assert.deepEqual(calls.status, [{ id: 'log1', status: 'rejected' }]);
});

test('view commands and renders go back to the 3D view', async () => {
  const { run, calls } = setup();
  const r = await run([{ type: 'CHANGE_CAMERA', payload: { preset: 'rotate', degrees: 45 } }, { type: 'SET_LIGHTING', payload: { preset: 'sunset' } }, { type: 'LOAD_MODEL', payload: { designName: 'brick' } }]);
  assert.deepEqual(r.results.map(x => x.status), ['client', 'client', 'client']);
  assert.deepEqual(r.results[0].data.studioCommand, { type: 'CHANGE_CAMERA', preset: 'rotate', degrees: 45 });
  assert.equal(r.results[2].data.designId, 'd2');
  assert.equal(calls.saved.length, 0);
});

test('restore must be confirmed, then saves the old version as a new one', async () => {
  const { run, calls } = setup();
  assert.equal((await run([{ type: 'RESTORE_DESIGN', payload: { version: 2 } }])).results[0].status, 'needs-confirmation');
  const r = await run([{ command: { type: 'RESTORE_DESIGN', payload: { version: 2 } }, confirmed: true }]);
  assert.equal(r.results[0].status, 'applied');
  assert.match(calls.saved[0].body.note, /Restored version 2/);
});

test('takeoff, estimate and proposal are routed to their engines after the edits are saved', async () => {
  const { run, calls } = setup({ lastProposal: { options: { company: { name: 'Bluebonnet Builders' }, customer: { name: 'Lee' }, tone: 'friendly' } } });
  const r = await run([
    { type: 'UPDATE_MATERIAL', payload: { target: { kind: 'roof' }, material: 'standing-seam' } },
    { type: 'CALCULATE_MATERIALS', payload: {} },
    { type: 'GENERATE_ESTIMATE', payload: { alternateNames: ['Brick version'] } },
    { type: 'PRODUCE_PROPOSAL', payload: { tone: 'formal' } },
  ]);
  assert.deepEqual(r.results.map(x => x.status), ['applied', 'queued', 'done', 'done']);
  assert.equal(r.results[1].data.progressUrl, '/api/projects/p1/takeoffs/t1/events');
  assert.deepEqual(calls.estimates[0].body.alternates, ['d2']);
  assert.match(r.results[2].message, /\$212,656/);
  assert.equal(calls.proposals[0].v, '2');
  assert.equal(calls.proposals[0].body.tone, 'formal');
  assert.equal(calls.proposals[0].body.company.name, 'Bluebonnet Builders');
});

test('a proposal without a company name asks for it instead of guessing', async () => {
  const { run, calls } = setup();
  const r = await run([{ type: 'PRODUCE_PROPOSAL', payload: {} }]);
  assert.equal(r.results[0].status, 'needs-input');
  assert.deepEqual(r.results[0].data.needs, ['company']);
  assert.equal(calls.proposals.length, 0);
});

test('a variation is a new design built from the current one', async () => {
  const { run, calls } = setup();
  const r = await run([{ type: 'CREATE_DESIGN_VARIATION', payload: { name: 'Brick', commands: [{ type: 'UPDATE_MATERIAL', payload: { target: { kind: 'exterior-walls' }, material: 'brick' } }] } }]);
  assert.equal(r.results[0].status, 'done', r.results[0].message);
  assert.equal(r.results[0].data.designId, 'd9');
  assert.equal(calls.created[0].body.title, 'Brick');
  assert.ok(JSON.stringify(calls.created[0].body.data.model).includes('brick'));
  assert.equal(calls.saved.length, 0, 'the open design is not changed');
});

test('request checks: version conflicts, wrong project, empty and oversized batches', async () => {
  const { router, run } = setup();
  await assert.rejects(run([{ type: 'SAVE_DESIGN', payload: {} }], { baseVersion: 2 }), e => e.status === 409 || e.getStatus?.() === 409);
  await assert.rejects(router.execute(user, { projectId: 'p2', designId: 'd1', commands: [{ command: { type: 'SAVE_DESIGN', payload: {} } }] }), /isn’t in this project/);
  await assert.rejects(router.execute(user, { projectId: 'p1', designId: 'd1', commands: [] }), /at least one/);
  await assert.rejects(router.execute(user, { projectId: 'p1', designId: 'd1', commands: Array(26).fill({ command: { type: 'SAVE_DESIGN', payload: {} } }) }), /At most 25/);
});

test('a failing engine fails only its own step', async () => {
  const { router, run } = setup();
  router.takeoffs.start = async () => { throw new Error('db down'); };
  router.log.error = () => {};
  const r = await run([{ type: 'UPDATE_COLOR', payload: { target: { kind: 'roof' }, color: '#1d1f22' } }, { type: 'CALCULATE_MATERIALS', payload: {} }], { logId: 'l' });
  assert.deepEqual(r.results.map(x => x.status), ['applied', 'failed']);
  assert.equal(r.results[1].message, 'That step failed. Try again.');
});
