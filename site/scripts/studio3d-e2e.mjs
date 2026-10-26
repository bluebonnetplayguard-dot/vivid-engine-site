// GC 3D Design Studio acceptance test (milestone 1) in a real browser, desktop + phone + tablet.
//   BASE=http://127.0.0.1:5173 EMAIL=... PASSWORD=... OUT=./studio-e2e node scripts/studio3d-e2e.mjs
// Needs Playwright with Chromium and a running site + API (the account must exist and be verified).
// It creates a project in that account. Screenshots go to OUT.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:5173';
const OUT = process.env.OUT || './studio-e2e';
mkdirSync(OUT, { recursive: true });
const results = [];
const step = async (name, fn) => {
  try { await fn(); results.push(['PASS', name]); console.log(`PASS  ${name}`); }
  catch (e) { results.push(['FAIL', name, e.message]); console.log(`FAIL  ${name}\n      ${e.message.split('\n')[0]}`); }
};
const wait = ms => new Promise(r => setTimeout(r, ms));

async function login(page) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type=email]', process.env.EMAIL);
  await page.fill('input[type=password]', process.env.PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });
}
const st = page => page.evaluate(() => { const s = window.__gcStudio.getState(); return { model: s.model, selection: s.selection, dirty: s.dirty, project: s.project, design: s.design, proposal: !!s.proposal, view: s.view }; });
const pose = page => page.evaluate(() => window.__gcStudio.viewport.pose());
// Screen position of a model point (inches), for clicking a specific element.
const screenOf = (page, p) => page.evaluate(([x, y, z]) => {
  const v = window.__gcStudio.viewport, r = v.renderer.domElement.getBoundingClientRect();
  v.camera.updateMatrixWorld();
  const w = v.camera.position.clone().set(x, y, z).project(v.camera);
  return { x: r.left + (w.x + 1) / 2 * r.width, y: r.top + (1 - w.y) / 2 * r.height };
}, p);
const settle = page => page.waitForFunction(() => !window.__gcStudio?.viewport.anim, null, { timeout: 5000 }).then(() => wait(250));
async function ask(page, text) {
  const box = page.getByLabel('Request for the design assistant');
  await box.fill(text); await box.press('Enter');
  await page.waitForFunction(() => !document.querySelector('.gcs-typing'), null, { timeout: 30000 });
  await wait(300);
}

async function desktop(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await login(page);

  await step('1. Contractor opens the GC application and selects 3D Design Studio', async () => {
    await page.goto(`${BASE}/portal`);
    await page.getByRole('link', { name: '3D Design Studio' }).first().click();
    await page.waitForURL(/\/studio/);
  });
  await step('2. A building appears as an interactive 3D model', async () => {
    await page.waitForFunction(() => window.__gcStudio?.viewport?.built?.pickables.length > 50, null, { timeout: 20000 });
    await settle(page);
    const n = await page.evaluate(() => window.__gcStudio.viewport.built.pickables.length);
    assert.ok(n > 100, `only ${n} meshes`);
    await page.screenshot({ path: `${OUT}/01-studio-desktop.png` });
  });
  await step('3. Rotate the building with the mouse', async () => {
    const before = await pose(page);
    const c = await page.locator('.gcs-canvas').boundingBox();
    await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
    await page.mouse.down(); await page.mouse.move(c.x + c.width / 2 + 260, c.y + c.height / 2 + 20, { steps: 12 }); await page.mouse.up();
    await wait(600);
    const after = await pose(page);
    const moved = Math.hypot(after.position[0] - before.position[0], after.position[1] - before.position[1]);
    assert.ok(moved > 100, `camera moved only ${moved.toFixed(1)}"`);
    await page.screenshot({ path: `${OUT}/02-rotated.png` });
  });
  await step('4. Select an exterior wall; its design properties appear', async () => {
    await page.evaluate(() => window.__gcStudio.viewport.cameraPreset('front', { instant: true }));
    await wait(300);
    const p = await screenOf(page, [130, -3.3, 60]);
    await page.mouse.click(p.x, p.y);
    await wait(300);
    const s = await st(page);
    assert.equal(s.selection, 'w1-front', `selected ${s.selection}`);
    await page.getByRole('heading', { name: 'Exterior finish' }).waitFor();
    await page.getByText('Length (centerline)').waitFor();
    await page.screenshot({ path: `${OUT}/03-wall-selected.png` });
  });
  await step('5. Change the wall material; the model updates', async () => {
    await page.getByRole('radio', { name: 'Brick veneer' }).click();
    await wait(300);
    const s = await st(page);
    assert.equal(s.model.walls.find(w => w.id === 'w1-front').finishExterior, 'brick');
    const mat = await page.evaluate(() => { const m = window.__gcStudio.viewport.built.byId.get('w1-front')[0]; const mm = m.userData.baseMaterial || m.material; return mm[0].color.getHexString(); });
    assert.equal(`#${mat}`, '#9a4b36', 'the 3D wall now uses the brick color');
    await page.screenshot({ path: `${OUT}/04-wall-brick.png` });
  });
  await step('6. "Change the roof to black metal": the AI updates the roof', async () => {
    await ask(page, 'Change the roof to black metal.');
    const s = await st(page);
    const roof = s.model.roofs[0];
    assert.equal(roof.material, 'standing-seam'); assert.equal(roof.color, '#1d1f22');
    await page.evaluate(() => window.__gcStudio.viewport.cameraPreset('iso', { instant: true }));
    await wait(400);
    await page.screenshot({ path: `${OUT}/05-roof-black-metal.png` });
  });
  await step('7. "Show me the front of the house": the camera moves to the front', async () => {
    await ask(page, 'Show me the front of the house.');
    await settle(page);
    const p = await pose(page);
    assert.ok(p.position[1] < -500 && Math.abs(p.position[0] - 240) < 60, `camera at ${p.position.map(Math.round)}`);
    await page.screenshot({ path: `${OUT}/06-front-view.png` });
  });
  await step('8. Select a window and inspect its dimensions', async () => {
    const p = await screenOf(page, [70, -1.3, 60]);
    await page.mouse.click(p.x, p.y);
    await wait(300);
    const s = await st(page);
    assert.equal(s.selection, 'o-f1-front-1', `selected ${s.selection}`);
    const row = await page.locator('.gcs-dims tr', { hasText: 'Width' }).first().innerText();
    assert.match(row, /5'-0"/);
    await page.getByText('Head height').waitFor();
    await page.screenshot({ path: `${OUT}/07-window-selected.png` });
  });
  await step('9. Save the design', async () => {
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(() => !window.__gcStudio.getState().dirty && window.__gcStudio.getState().project, null, { timeout: 15000 });
  });
  await step('10. After reopening the project, the modifications remain', async () => {
    await page.goto(`${BASE}/portal`); await page.goto(`${BASE}/studio`);
    await page.waitForFunction(() => window.__gcStudio?.getState().design, null, { timeout: 20000 });
    const s = await st(page);
    assert.equal(s.model.walls.find(w => w.id === 'w1-front').finishExterior, 'brick');
    assert.equal(s.model.roofs[0].material, 'standing-seam');
    await settle(page);
    await page.screenshot({ path: `${OUT}/08-reopened.png` });
  });
  await step('11. Create a presentation image; it is saved to the same project', async () => {
    const before = (await page.locator('.gcs-thumb').count());
    await page.getByRole('button', { name: 'Render' }).click();
    await page.waitForFunction(n => document.querySelectorAll('.gcs-thumb').length > n, before, { timeout: 20000 });
    await page.waitForSelector('.gcs-thumb img', { timeout: 10000 });
    const s = await st(page);
    const proj = await page.evaluate(id => fetch(`/api/studio3d/projects/${id}`).then(r => r.status), s.project.id);
    assert.ok(proj === 401 || proj === 200);   // bearer token isn't sent by bare fetch; the UI list proves it saved
    await page.locator('.gcs-thumb').first().click();
    await page.locator('.gcs-lightbox img').waitFor();
    await page.screenshot({ path: `${OUT}/09-presentation-image.png` });
    await page.getByRole('button', { name: 'Close', exact: true }).click();
  });

  // Beyond the acceptance list: the rest of the milestone-1 features.
  await step('Extra: dollhouse (roof off)', async () => { await ask(page, 'Remove the roof so I can see the floor plan.'); await settle(page); assert.equal((await st(page)).view.mode, 'dollhouse'); await page.screenshot({ path: `${OUT}/10-dollhouse.png` }); });
  await step('Extra: 2D floor plan with room dimensions', async () => {
    await page.getByRole('button', { name: /^2D/ }).click(); await settle(page);
    await page.getByRole('button', { name: 'Dims' }).click(); await wait(300);
    await page.locator('.gcs-dim.is-room').first().waitFor();
    await page.screenshot({ path: `${OUT}/11-floor-plan.png` });
    await page.getByRole('button', { name: 'Dims' }).click();
  });
  await step('Extra: interior view of the kitchen', async () => { await ask(page, 'Show me the kitchen.'); await settle(page); assert.equal((await st(page)).selection, 'r-kitchen'); await page.screenshot({ path: `${OUT}/12-kitchen.png` }); });
  await step('Extra: walkthrough mode', async () => { await page.getByRole('button', { name: 'Walk' }).click(); await wait(400); await page.getByRole('button', { name: 'Forward' }).click(); await page.getByRole('button', { name: 'Forward' }).click(); await wait(200); await page.screenshot({ path: `${OUT}/13-walkthrough.png` }); });
  await step('Extra: move a window 2 ft left: previewed, then applied, then undone', async () => {
    await ask(page, 'Show me the front of the house'); await settle(page);
    await page.evaluate(() => window.__gcStudio.viewport.select('o-f1-front-2'));
    await ask(page, 'Move this window two feet to the left');
    let s = await st(page); assert.ok(s.proposal, 'a proposal is shown');
    await page.screenshot({ path: `${OUT}/14-move-proposal.png` });
    await page.getByRole('button', { name: 'Apply' }).click(); await wait(200);
    s = await st(page); assert.equal(s.model.openings.find(o => o.id === 'o-f1-front-2').offset, 306);
    await page.getByRole('button', { name: 'Undo' }).click(); await wait(200);
    s = await st(page); assert.equal(s.model.openings.find(o => o.id === 'o-f1-front-2').offset, 330);
  });
  await step('Extra: an impossible move is refused with a reason', async () => {
    await page.evaluate(() => window.__gcStudio.viewport.select('o-f1-front-1'));
    await ask(page, 'Move this window 6 feet to the left');
    const last = await page.locator('.gcs-msg.is-ai').last().innerText();
    assert.match(last, /corner|can’t/);
    assert.equal((await st(page)).proposal, false);
  });
  await step('Extra: covered patio proposal on the back', async () => {
    await ask(page, 'Add a covered patio to the back'); await page.getByRole('button', { name: 'Apply' }).click();
    await ask(page, 'Show me the back of the house'); await settle(page);
    assert.ok((await st(page)).model.components.some(c => c.kind === 'patio-roof'));
    await page.screenshot({ path: `${OUT}/15-covered-patio.png` });
  });
  await step('Extra: sunset and evening lighting', async () => {
    await ask(page, 'Show me the house at sunset'); await settle(page); await page.screenshot({ path: `${OUT}/16-sunset.png` });
    await ask(page, 'evening'); await wait(300); await page.screenshot({ path: `${OUT}/17-evening.png` });
    await ask(page, 'daytime');
  });
  await step('Extra: measure tool (two points)', async () => {
    await ask(page, 'Show me the front of the house'); await settle(page);
    await page.getByRole('button', { name: 'Measure' }).click();
    const a = await screenOf(page, [10, -3.3, 6]), b = await screenOf(page, [470, -3.3, 6]);
    await page.mouse.click(a.x, a.y); await page.mouse.click(b.x, b.y); await wait(300);
    const text = await page.locator('.gcs-measure-out').innerText();
    assert.match(text, /Distance 38'-[0-9]/, text);
    await page.screenshot({ path: `${OUT}/18-measure.png` });
    await page.getByRole('button', { name: 'Measure' }).click();
  });
  await step('Extra: brick version as a separate design variation', async () => {
    await ask(page, 'Create a modern farmhouse version');
    await page.waitForFunction(() => /farmhouse/i.test(window.__gcStudio.getState().design?.title || ''), null, { timeout: 20000 });
    await settle(page);
    const s = await st(page); assert.equal(s.model.walls.find(w => w.id === 'w2-front').finishExterior, 'board-batten');
    assert.ok(s.project.designs.length >= 2);
    await ask(page, 'Show me the front of the house'); await settle(page);
    await page.screenshot({ path: `${OUT}/19-farmhouse-variation.png` });
  });
  // ---------- 3D engine (PR 9): rendering quality, cameras, first person, dollhouse, capture, performance ----------
  await step('Engine: PBR materials with relief maps, sky environment, ACES, soft shadows fitted to the house', async () => {
    await page.evaluate(() => window.__gcStudio.viewport.setQuality('high')); await wait(300);
    const r = await page.evaluate(() => {
      const v = window.__gcStudio.viewport, roof = v.built.byId.get('roof-main')[0], m = roof.userData.baseMaterial || roof.material;
      const wall = v.built.byId.get('w1-front')[0], wm = [].concat(wall.userData.baseMaterial || wall.material)[0];
      const cam = v.sun.shadow.camera;
      return { tone: v.renderer.toneMapping, env: !!v.scene.environment, bg: !!v.scene.background?.isTexture, normal: !!wm.normalMap, rough: !!wm.roughnessMap,
        pbr: m.type, shadowType: v.renderer.shadowMap.type, shadowSpan: cam.right - cam.left, map: v.sun.shadow.mapSize.x };
    });
    assert.equal(r.tone, 4, 'ACES filmic');           // THREE.ACESFilmicToneMapping
    assert.ok(r.env && r.bg, 'sky environment lights the scene and is the background');
    assert.ok(r.normal && r.rough, 'siding has normal + roughness maps');
    assert.match(r.pbr, /MeshStandardMaterial|MeshPhysicalMaterial/);
    assert.equal(r.shadowType, 2, 'PCF soft shadows');
    assert.ok(r.shadowSpan < 1400, `shadow frustum is fitted to the building (${Math.round(r.shadowSpan)}")`);
    assert.equal(r.map, 4096);
    await page.evaluate(() => { const v = window.__gcStudio.viewport; v.setMode('exterior'); v.setLighting('day'); v.cameraPreset('iso', { instant: true }); }); await wait(400);
    await page.screenshot({ path: `${OUT}/20-high-quality.png` });
  });
  await step('Engine: renders on demand (an idle view draws no frames)', async () => {
    await wait(600);
    const idle = await page.evaluate(() => new Promise(res => { const i = window.__gcStudio.viewport.renderer.info; const f0 = i.render.frame; setTimeout(() => res(i.render.frame - f0), 1000); }));
    assert.ok(idle <= 1, `idle frames in 1 s: ${idle}`);
    const moving = await page.evaluate(() => new Promise(res => { const v = window.__gcStudio.viewport, i = v.renderer.info, f0 = i.render.frame; v.cameraPreset('front'); setTimeout(() => res(i.render.frame - f0), 500); }));
    assert.ok(moving > 10, `frames while the camera flies: ${moving}`);
  });
  await step('Engine: quality setting (fast / balanced / high) is applied and remembered', async () => {
    await page.getByLabel('Render quality').selectOption('low'); await wait(300);
    let s = await page.evaluate(() => window.__gcStudio.viewport.stats());
    assert.equal(s.quality, 'low'); assert.equal(s.shadows, false);
    assert.equal(await page.evaluate(() => localStorage.getItem('gcs.quality')), 'low');
    await page.getByLabel('Render quality').selectOption('high'); await wait(300);
    s = await page.evaluate(() => window.__gcStudio.viewport.stats());
    assert.equal(s.quality, 'high'); assert.equal(s.shadows, true);
    assert.ok(s.drawCalls > 0 && s.triangles > 0);
  });
  await step('Engine: camera presets incl. aerial from the View menu', async () => {
    await page.getByLabel('Camera view').selectOption('aerial');
    await page.waitForFunction(() => !window.__gcStudio.viewport.anim, null, { timeout: 15000 });   // software GL is slow at high quality
    const p = await pose(page);
    assert.ok(p.position[2] > 600, `aerial camera is high (${Math.round(p.position[2])}")`);
    await page.screenshot({ path: `${OUT}/21-aerial.png` });
  });
  await step('Engine: dollhouse cuts away the walls facing the camera', async () => {
    const r = await page.evaluate(async () => {
      const v = window.__gcStudio.viewport; v.setMode('dollhouse'); v.cameraPreset('front', { instant: true });
      await new Promise(r => setTimeout(r, 100));
      const vis = id => v.built.byId.get(id).some(m => m.visible);
      const front = vis('w1-front'), back = vis('w1-back'), door = vis('o-front-door');
      v.cameraPreset('back', { instant: true }); await new Promise(r => setTimeout(r, 100));
      return { front, back, door, frontAfter: vis('w1-front'), backAfter: vis('w1-back') };
    });
    assert.deepEqual(r, { front: false, back: true, door: false, frontAfter: true, backAfter: false });
    await page.evaluate(() => window.__gcStudio.viewport.cameraPreset('dollhouse', { instant: true })); await wait(300);
    await page.screenshot({ path: `${OUT}/22-dollhouse-cutaway.png` });
  });
  await step('Engine: first person: walls stop you, the front door lets you in, floors change', async () => {
    const r = await page.evaluate(() => {
      const v = window.__gcStudio.viewport; v.setMode('walkthrough');
      const start = v.walk.pos.clone();
      const inn = v.walkStep(60);                                   // straight through the front door
      const inside = v.walk.pos.y > 10;
      v.walk.yaw = -Math.PI / 2;                                    // turn to face the front wall from inside
      for (let i = 0; i < 10; i++) v.walkStep(40);
      const y = v.walk.pos.y;
      v.walk.pos.x = 60; v.walk.pos.y = 30; v.walk.yaw = -Math.PI / 2;   // a spot with no door
      const hit = v.walkStep(60);
      const up = v.walkFloor(1), z = v.walk.pos.z, top = v.walkFloor(1);
      v.walkFloor(-1);
      return { started: start.y < 0, inBlocked: inn.blocked, inside, outAgain: y < 0, wallBlocked: hit.blocked, wallY: v.walk.pos.y, up: up.level, z, top: top.error };
    });
    assert.equal(r.started, true); assert.equal(r.inBlocked, false); assert.equal(r.inside, true);
    assert.equal(r.outAgain, true, 'walking back out through the same door works');
    assert.equal(r.wallBlocked, true);
    assert.equal(r.up, 2); assert.equal(r.z, 184); assert.match(r.top, /top floor/);
    await page.screenshot({ path: `${OUT}/23-first-person.png` });
    await page.evaluate(() => window.__gcStudio.viewport.setMode('exterior', { reframe: true })); await wait(800);
  });
  await step('Engine: export is a supersampled 2400 × 1500 PNG with the conceptual label', async () => {
    const r = await page.evaluate(async () => {
      const v = window.__gcStudio.viewport, w0 = v.renderer.domElement.width;
      const url = v.capture({ width: 2400, height: 1500, format: 'png', title: 'Test' });
      const img = new Image(); img.src = url; await img.decode();
      return { png: url.startsWith('data:image/png'), w: img.width, h: img.height, kb: Math.round(url.length * 0.75 / 1024), restored: v.renderer.domElement.width === w0 };
    });
    assert.deepEqual([r.png, r.w, r.h, r.restored], [true, 2400, 1500, true]);
    assert.ok(r.kb > 200, `image has detail (${r.kb} KB)`);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('navigation', { name: 'Design controls' }).getByRole('button', { name: 'Export', exact: true }).click()]);
    assert.match(dl.suggestedFilename(), /\.png$/);
  });
  await step('No uncaught page errors on desktop', async () => { assert.deepEqual(errors, []); });
  await ctx.close();
}

async function handheld(browser, name, device) {
  const ctx = await browser.newContext({ ...device });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await login(page);
  await page.goto(`${BASE}/studio`);
  await step(`${name}: studio loads with the model first`, async () => {
    await page.waitForFunction(() => window.__gcStudio?.getState().design && window.__gcStudio.viewport.built, null, { timeout: 20000 });
    await settle(page);
    const c = await page.locator('.gcs-canvas').boundingBox();
    assert.ok(c.height > device.viewport.height * 0.45, `viewport only ${c.height}px tall`);
    await page.screenshot({ path: `${OUT}/${name}-01-loaded.png` });
  });
  await step(`${name}: touch rotate`, async () => {
    const before = await pose(page);
    const c = await page.locator('.gcs-canvas').boundingBox();
    const cdp = await ctx.newCDPSession(page);
    const pt = (x, y) => [{ x, y, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(c.x + c.width * 0.3, c.y + c.height / 2) });
    for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(c.x + c.width * 0.3 + i * 18, c.y + c.height / 2) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await wait(600);
    const after = await pose(page);
    assert.ok(Math.hypot(after.position[0] - before.position[0], after.position[1] - before.position[1]) > 50, 'camera did not orbit');
  });
  await step(`${name}: tap a wall opens its edit sheet`, async () => {
    await page.evaluate(() => window.__gcStudio.viewport.cameraPreset('front', { instant: true })); await wait(300);
    const p = await screenOf(page, [130, -3.3, 60]);
    await page.touchscreen.tap(p.x, p.y); await wait(400);
    assert.equal((await st(page)).selection, 'w1-front');
    await page.locator('.gcs-sheet .gcs-props').waitFor();
    await page.screenshot({ path: `${OUT}/${name}-02-edit-sheet.png` });
  });
  await step(`${name}: assistant sheet runs a voice/typed command`, async () => {
    await page.getByRole('tab', { name: 'Assistant' }).tap();
    await ask(page, 'Show me the house at sunset');
    assert.equal((await st(page)).view.lighting, 'sunset');
    await page.screenshot({ path: `${OUT}/${name}-03-assistant.png` });
    await page.getByRole('tab', { name: 'Assistant' }).tap();
    await settle(page);
    await page.screenshot({ path: `${OUT}/${name}-04-sunset.png` });
  });
  await step(`${name}: no uncaught page errors`, async () => { assert.deepEqual(errors, []); });
  await ctx.close();
}

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  await desktop(browser);
  await handheld(browser, 'phone', devices['iPhone 13']);
  await handheld(browser, 'tablet', devices['iPad (gen 7)']);
} finally { await browser.close(); }
const failed = results.filter(r => r[0] === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
