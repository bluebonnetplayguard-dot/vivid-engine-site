// Backyard play structure with fort, slide, swings, climber and protective surfacing.
// Use-zone and surfacing depth rules follow the CPSC Public Playground Safety Handbook (Pub. 325).
import { Model, yd3 } from './model';
import { ftin } from './lumber';

// CPSC Pub. 325, Table 2: minimum compressed loose-fill depth (in) and the fall height it protects (ft).
export const SURFACING = {
  woodChips: { label: 'Wood chips', depth: 9, maxFall: 10, compress: true },
  woodMulch: { label: 'Wood mulch (non-CCA)', depth: 9, maxFall: 7, compress: true },
  rubber: { label: 'Shredded / recycled rubber', depth: 6, maxFall: 10, compress: false },
  peaGravel: { label: 'Pea gravel', depth: 9, maxFall: 5, compress: true },
  sand: { label: 'Sand', depth: 9, maxFall: 4, compress: true },
};

export function buildPlayset(o) {
  const m = new Model(`Play structure · ${o.fortSize}' fort${o.swings ? ` + ${o.swings} swings` : ''}`);
  const F = o.fortSize * 12, Hp = o.deckHeight * 12, mat = o.lumber;
  const postH = Hp + (o.roof === 'none' ? 34 : 60);

  // fort posts (set in ground 24")
  for (const [x, y] of [[1.75, 1.75], [F - 1.75, 1.75], [1.75, F - 1.75], [F - 1.75, F - 1.75]]) {
    m.post('Fort', 'Fort post', '4x4', 'pt', x, y, -24, postH + 24);
    m.box('Foundation', 'Post footing', { c: [x, y, -18], s: [10, 10, 12], material: 'concrete', kind: 'concrete' });
  }
  m.item('Concrete', 'footbags', '50 lb fast-set concrete bags', 4 * 2, 'bags');
  // deck frame + boards
  const zf = Hp - 1.5 - 5.5;
  for (const y of [4.25, F - 4.25]) m.box('Fort', 'Deck frame', { c: [F / 2, y, zf + 2.75], s: [F, 1.5, 5.5], nominal: '2x6', material: 'pt', lengthIn: F });
  for (const x of [4.25, F - 4.25]) m.box('Fort', 'Deck frame', { c: [x, F / 2, zf + 2.75], s: [1.5, F - 10, 5.5], nominal: '2x6', material: 'pt', lengthIn: F - 10 });
  m.box('Fort', 'Deck joist', { c: [F / 2, F / 2, zf + 2.75], s: [1.5, F - 10, 5.5], nominal: '2x6', material: 'pt', lengthIn: F - 10 });
  const nb = Math.ceil(F / 5.75);
  for (let i = 0; i < nb; i++) m.box('Fort', 'Deck board', { c: [F / 2, Math.min(F - 2.75, 2.75 + i * 5.75), Hp - 0.75], s: [F, 5.5, 1.5], nominal: '2x6', material: mat, lengthIn: F });
  m.item('Hardware', 'lag', '3/8" galvanized lag screws / carriage bolts', 24, 'ea');

  // guard walls: 2x2 slats with < 3-1/2" gaps; openings for slide (y=0) and ladder/climber (x=0)
  const openW = 22;
  const guard = (side) => {
    const H = 29, z0 = Hp;
    const along = side === 'front' || side === 'back' ? 'x' : 'y';
    const fixed = { front: 1.75, back: F - 1.75, left: 1.75, right: F - 1.75 }[side];
    const gap = side === 'front' ? [F / 2 - openW / 2, F / 2 + openW / 2] : side === 'left' ? [F / 2 - openW / 2, F / 2 + openW / 2] : null;
    for (const zr of [z0 + 4, z0 + H]) {
      const pieces = gap ? [[3.5, gap[0]], [gap[1], F - 3.5]] : [[3.5, F - 3.5]];
      for (const [a, b] of pieces) {
        const A = along === 'x' ? [a, fixed, zr] : [fixed, a, zr], B = along === 'x' ? [b, fixed, zr] : [fixed, b, zr];
        m.member('Fort', 'Guard rail', '2x4', mat, A, B, { flat: false, axis: along });
      }
    }
    for (let u = 3.5 + 2.4; u < F - 4.5; u += 4.75) {
      if (gap && u > gap[0] - 1 && u < gap[1] + 1) continue;
      const c = along === 'x' ? [u, fixed, z0 + H / 2 + 2] : [fixed, u, z0 + H / 2 + 2];
      m.box('Fort', 'Guard slat', { c, s: [1.5, 1.5, H], nominal: '2x2', material: mat, lengthIn: H });
    }
  };
  ['front', 'back', 'left', 'right'].forEach(guard);
  m.note('info', 'Guard slats are spaced 3-1/4" apart. CPSC treats openings between 3.5" and 9" as head-entrapment hazards.');

  // roof
  if (o.roof === 'wood') {
    const rise = F / 2 * 0.6, a = Math.atan(0.6), top = Hp + 60;
    for (const y of [1.75, F / 2, F - 1.75]) {
      m.member('Roof', 'Roof rafter', '2x4', mat, [-6, y, top - 6 * 0.6], [F / 2, y, top + rise], { axis: 'x' });
      m.member('Roof', 'Roof rafter', '2x4', mat, [F + 6, y, top - 6 * 0.6], [F / 2, y, top + rise], { axis: 'x' });
    }
    const slope = (F / 2 + 6) / Math.cos(a);
    for (const s of [-1, 1]) {
      const c = [F / 2 + s * (F / 2 + 6) / 2, F / 2, (top - 3.6 + top + rise) / 2 + 2.5];
      m.box('Roof', 'Roof boards', { c, s: [slope, F + 12, 0.75], r: [0, s < 0 ? -a : a, 0], material: mat === 'cedar' ? 'cedar' : 'pt', kind: 'finish' });
    }
    m.item('Lumber (roof boards)', 'roofboards', '1x6 roof boards, 8 ft', Math.ceil(2 * slope / 5.5 * (F + 12) / 96), 'pcs');
  } else if (o.roof === 'canopy') {
    const top = Hp + 60;
    m.poly('Roof', 'Canopy', { o: [0, 0, top], u: [1, 0, 0], v: [0, 1, 0], pts: [[-4, -4], [F + 4, -4], [F + 4, F + 4], [-4, F + 4]], t: 0.2, material: 'canopy' });
    m.item('Play components', 'canopy', `Canopy tarp ${o.fortSize}' x ${o.fortSize}'`, 1, 'ea');
  }

  // slide on the front (y < 0)
  let footprint = [[0, 0, F, F]];
  if (o.slide) {
    const run = Hp / Math.tan(30 * Math.PI / 180);
    const L = Math.hypot(run, Hp - 11);
    const ang = Math.atan2(Hp - 11, run);
    m.box('Play components', `Slide (${ftin(L)})`, { c: [F / 2, -run / 2, (Hp + 11) / 2], s: [18, L, 2], r: [ang, 0, 0], material: 'plastic', kind: 'finish' });
    for (const dx of [-9.5, 9.5]) m.box('Play components', 'Slide side wall', { c: [F / 2 + dx, -run / 2, (Hp + 11) / 2 + 4], s: [1.5, L, 6], r: [ang, 0, 0], material: 'plastic', kind: 'finish' });
    m.box('Play components', 'Slide exit', { c: [F / 2, -run - 6, 11], s: [18, 12, 2], material: 'plastic', kind: 'finish' });
    m.item('Play components', 'slide', `Slide for ${o.deckHeight}' deck height`, 1, 'ea');
    footprint.push([F / 2 - 11, -run - 12, F / 2 + 11, 0]);
  }

  // ladder or rock wall on the left (x < 0)
  const climbRun = Hp * 0.45;
  if (o.climber === 'rock') {
    const ang = Math.atan2(climbRun, Hp);
    m.box('Play components', 'Rock wall panel', { c: [-climbRun / 2, F / 2, Hp / 2], s: [1.5, 30, Math.hypot(Hp, climbRun)], r: [0, ang, 0], material: 'rock', kind: 'finish' });
    m.item('Play components', 'holds', 'Climbing holds with T-nuts', Math.ceil(Hp / 8), 'ea');
    m.item('Sheet goods', 'plywall', '3/4" exterior plywood for climbing wall, 4x8', 1, 'sheets');
  } else {
    for (const dy of [-11, 11]) m.member('Play components', 'Ladder rail', '2x4', mat, [-climbRun, F / 2 + dy, 0], [1, F / 2 + dy, Hp], { axis: 'x' });
    const nr = Math.floor(Hp / 11);
    for (let i = 1; i <= nr; i++) {
      const z = i * Hp / (nr + 1), x = -climbRun * (1 - z / Hp);
      m.box('Play components', 'Ladder rung', { c: [x, F / 2, z], s: [3.5, 20.5, 1.5], nominal: '2x4', material: mat, lengthIn: 20.5 });
    }
  }
  footprint.push([-climbRun - 6, F / 2 - 18, 0, F / 2 + 18]);

  // swing beam off the right side
  let swingZone = null, pivot = 0;
  if (o.swings > 0) {
    pivot = o.swingBeamHeight * 12;
    const bayW = 30, len = Math.max(96, o.swings * bayW + 24 + 24);
    const y0 = F / 2, x0 = F, x1 = F + len;
    m.box('Swing set', 'Swing beam (4x6)', { c: [(x0 + x1) / 2, y0, pivot + 2.75], s: [len + 6, 3.5, 5.5], nominal: '4x6', material: 'pt', lengthIn: len + 6 });
    // A-frame end
    const splay = pivot * 0.45;
    for (const s of [-1, 1]) m.member('Swing set', 'A-frame leg', '4x4', 'pt', [x1, y0 + s * splay, -12], [x1, y0 + s * 2, pivot], { axis: 'y' });
    m.member('Swing set', 'A-frame brace', '2x4', 'pt', [x1 + 2.5, y0 - splay * 0.55, pivot * 0.45], [x1 + 2.5, y0 + splay * 0.55, pivot * 0.45], { axis: 'y' });
    m.item('Hardware', 'abracket', 'Swing-beam A-frame bracket', 1, 'ea');
    m.item('Hardware', 'anchor', 'Ground anchors (auger type)', 2, 'ea');
    for (let i = 0; i < o.swings; i++) {
      const xc = x0 + 24 + (i + 0.5) * bayW;
      for (const dy of [-10, 10]) m.box('Swing set', 'Swing chain', { c: [xc, y0 + dy, (pivot + 16) / 2], s: [0.5, 0.5, pivot - 16], material: 'steel', kind: 'finish' });
      m.box('Swing set', 'Belt swing seat', { c: [xc, y0, 15.5], s: [7, 22, 1], material: 'seat', kind: 'finish' });
      m.item('Play components', 'swing', 'Belt swing seat with coated chain + hangers', 1, 'ea');
    }
    m.item('Hardware', 'swinghanger', 'Heavy-duty swing hangers', o.swings * 2, 'ea');
    // CPSC: front/back = 2 x pivot height; sides = 6 ft.
    swingZone = [x0, y0 - 2 * pivot, x1 + 72, y0 + 2 * pivot];
    footprint.push([x0, y0 - splay, x1, y0 + splay]);
  }

  // ---------- use zone and surfacing ----------
  const sf = SURFACING[o.surfacing];
  const fallFt = Math.max(o.deckHeight, pivot / 12);
  const rects = footprint.map(([a, b, c, d]) => [a - 72, b - 72, c + 72, d + 72]);
  if (swingZone) rects.push(swingZone);
  // union area by rasterizing at 6"
  const step = 6;
  const lo = [Math.min(...rects.map(r => r[0])), Math.min(...rects.map(r => r[1]))];
  const hi = [Math.max(...rects.map(r => r[2])), Math.max(...rects.map(r => r[3]))];
  let cells = 0;
  for (let x = lo[0] + step / 2; x < hi[0]; x += step) for (let y = lo[1] + step / 2; y < hi[1]; y += step) if (rects.some(r => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3])) cells++;
  const areaSqft = cells * step * step / 144;
  const install = sf.compress ? Math.ceil(sf.depth / 0.75) : sf.depth;
  for (const [a, b, c, d] of rects) m.poly('Use zone & surfacing', 'Use zone', { o: [0, 0, -install + 0.05], u: [1, 0, 0], v: [0, 1, 0], pts: [[a, b], [c, b], [c, d], [a, d]], t: install, material: 'zone', kind: 'zone' });
  m.item('Surfacing', `surf:${o.surfacing}`, `${sf.label}, installed ${install}" deep (${sf.depth}" compressed)`, +(yd3(areaSqft * 144 * install)).toFixed(1), 'yd³');
  m.item('Surfacing', 'fabric', 'Landscape fabric (under loose fill)', Math.ceil(areaSqft * 1.1), 'sq ft');
  m.item('Surfacing', 'border', 'Timber or plastic border, linear ft', Math.ceil(2 * ((hi[0] - lo[0]) + (hi[1] - lo[1])) / 12), 'LF');
  if (fallFt > sf.maxFall) m.note('warn', `${sf.label} at ${sf.depth}" protects a fall height of only ${sf.maxFall} ft, but this design has a ${fallFt} ft fall height (${pivot ? 'swing pivot' : 'deck'}). Choose wood chips or shredded rubber, or lower the structure.`);
  if (sf.compress) m.note('info', `Loose ${sf.label.toLowerCase()} compresses about 25% over time, so it is installed ${install}" deep to keep ${sf.depth}" after settling (CPSC Pub. 325).`);
  m.note('info', 'Use zone: 6 ft in all directions around the fort, and in front of and behind belt swings at least twice the pivot height (CPSC Pub. 325).');
  if (o.deckHeight * 12 > 30) m.note('info', 'Platforms over 30" need guardrails or protective barriers; the fort is drawn with full slatted barriers.');

  m.fact('Fort', `${o.fortSize}' x ${o.fortSize}' deck at ${o.deckHeight}'`);
  if (o.swings) m.fact('Swings', `${o.swings} belt swings, ${o.swingBeamHeight}' pivot`);
  m.fact('Fall height', `${fallFt} ft`);
  m.fact('Use zone', `${Math.round(areaSqft)} sq ft of ${sf.label.toLowerCase()}`);
  m.laborHours = Math.round(16 + o.swings * 2 + (o.slide ? 2 : 0) + areaSqft / 60);
  m.surfacing = { areaSqft, installDepth: install, material: sf.label };
  return m;
}
