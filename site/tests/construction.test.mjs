// Run: node tests/construction.test.mjs  (bundled with esbuild on the fly)
import { build } from 'esbuild';
import assert from 'node:assert/strict';
const out = await build({ entryPoints: ['src/construction/index.js'], bundle: true, format: 'esm', write: false, platform: 'node' });
const mod = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
const { TYPES, generate, estimate, lumberTakeoff, cutList } = mod;
let n = 0;
const finite = (m) => {
  for (const e of m.elements) {
    const nums = e.shape === 'box' ? [...e.c, ...e.s, ...e.r] : [...e.o, ...e.u, ...e.v, e.t, ...e.pts.flat()];
    assert.ok(nums.every(Number.isFinite), `${m.title}: ${e.name} has a bad number`);
    if (e.shape === 'box') assert.ok(e.s.every(v => v > 0), `${m.title}: ${e.name} has size ${e.s}`);
    if (e.kind === 'lumber') assert.ok(e.lengthIn > 0 && e.nominal, `${e.name} missing length/nominal`);
  }
};
const variants = {
  shed: [{}, { roof: 'leanto', pitch: 3, roofing: 'metal', siding: 'vinyl', foundation: 'piers' }, { width: 20, depth: 24, foundation: 'slab', door: 'overhead', windows: 6, studSpacing: '24' }],
  garage: [{}, { width: 12, depth: 20, door: 'double', roof: 'leanto' }, { width: 40, depth: 40, wallHeight: 12 }],
  deck: [{}, { attachment: 'free', height: 96, decking: 'composite', joistSpacing: '12' }, { height: 14, railing: false, stairs: false, width: 40, depth: 24 }],
  pergola: [{}, { width: 24, depth: 20, slats: false, lumber: 'pt', footing: 'slab' }],
  playset: [{}, { swings: 0, slide: false, roof: 'canopy', climber: 'ladder', surfacing: 'sand' }, { fortSize: '6', deckHeight: '6', swings: 3, surfacing: 'rubber' }],
};
for (const [t, list] of Object.entries(variants)) for (const v of list) {
  const m = generate(t, v); finite(m); n++;
  const est = estimate(m);
  assert.ok(Number.isFinite(est.total) && est.total > 0, `${t} estimate`);
  const zero = est.lines.filter(l => !(l.price > 0));
  assert.equal(zero.length, 0, `${t}: unpriced ${zero.map(z => z.key)}`);
  console.log(`${m.title.padEnd(42)} elements=${String(m.elements.length).padStart(4)} lumber rows=${lumberTakeoff(m).length} cuts=${cutList(m).length} total=$${est.total.toFixed(0)} warns=${m.notes.filter(x => x.level === 'warn').length}`);
}
// Specific checks
const deck = generate('deck', { width: 16, depth: 12, height: 36, joistSpacing: '16' });
assert.ok(deck.facts.find(f => f.label === 'Joists').value.startsWith('2x8'), 'deck joist 2x8 for ~10 ft span');
const play = generate('playset', { surfacing: 'sand', deckHeight: '5', swings: 2, swingBeamHeight: '8' });
assert.ok(play.notes.some(x => x.level === 'warn' && x.text.includes('Sand')), 'sand warning');
const play2 = generate('playset', { surfacing: 'woodChips' });
assert.equal(play2.surfacing.installDepth, 12, 'wood chips 9" compressed -> 12" install');
const shed = generate('shed', { width: 10, depth: 12, studSpacing: '16' });
const studs = shed.elements.filter(e => e.name === 'Stud' && e.group === 'Walls · Front');
assert.ok(studs.every(s => Math.abs(s.lengthIn - (7 * 12 - 4.5)) < 1e-6), 'stud length = wall height - 3 plates');
console.log(`ok: ${n} variants + specific checks`);
