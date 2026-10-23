// Decks and pergolas.
import { Model, yd3 } from './model';
import { depth, ftin } from './lumber';

// Rule-of-thumb max joist spans (inches) for #2 southern pine, by spacing. Preview only.
const JOIST_SPAN = {
  12: { '2x6': 9 * 12 + 11, '2x8': 13 * 12 + 1, '2x10': 16 * 12 + 2, '2x12': 18 * 12 },
  16: { '2x6': 9 * 12, '2x8': 11 * 12 + 10, '2x10': 14 * 12, '2x12': 16 * 12 + 6 },
  24: { '2x6': 7 * 12 + 7, '2x8': 9 * 12 + 8, '2x10': 11 * 12 + 5, '2x12': 13 * 12 + 6 },
};

function footing(m, x, y, label = 'Footing') {
  m.box('Foundation', label, { c: [x, y, -12], s: [12, 12, 24], material: 'concrete', kind: 'concrete' });
  m.item('Concrete', 'footbags', '80 lb concrete mix bags (12" x 24" footings)', Math.ceil(12 * 12 * 24 / 1728 / 0.6), 'bags');
  m.item('Hardware', 'postbase', 'Standoff post bases', 1, 'ea');
}

function railing(m, segs, z0, mat) {
  // segs: [[x0,y0,x1,y1], ...] along deck edges (inside line)
  const H = 36;
  let lf = 0;
  for (const [x0, y0, x1, y1] of segs) {
    const L = Math.hypot(x1 - x0, y1 - y0); if (L < 12) continue;
    lf += L;
    const n = Math.max(1, Math.ceil(L / 72));
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      m.post('Railing', 'Rail post', '4x4', 'pt', x, y, z0 - 8, H + 8);
      m.item('Hardware', 'railbolt', '1/2" carriage bolts for rail posts', 2, 'ea');
    }
    const ux = (x1 - x0) / L, uy = (y1 - y0) / L;
    const axis = Math.abs(ux) > Math.abs(uy) ? 'x' : 'y';
    m.member('Railing', 'Top rail', '2x6', mat, [x0, y0, z0 + H + 0.75], [x1, y1, z0 + H + 0.75], { flat: true, axis });
    m.member('Railing', 'Bottom rail', '2x4', mat, [x0, y0, z0 + 3.5], [x1, y1, z0 + 3.5], { flat: true, axis });
    const nb = Math.ceil(L / 5.25);
    for (let i = 1; i < nb; i++) {
      const t = i / nb, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      m.box('Railing', 'Baluster', { c: [x, y, z0 + 2 + (H - 2) / 2], s: [1.5, 1.5, H - 2], nominal: '2x2', material: mat === 'composite' ? 'pt' : mat, lengthIn: H - 2 });
    }
  }
  return lf;
}

export function buildDeck(o) {
  const m = new Model(`${o.width}' x ${o.depth}' Deck`);
  const W = o.width * 12, D = o.depth * 12, Hd = o.height, sp = Number(o.joistSpacing);
  const dMat = o.decking; // pt | cedar | composite
  const attached = o.attachment === 'ledger';
  const boardT = 1, boardW = 5.5, gap = dMat === 'composite' ? 0.1875 : 0.125;
  const zJt = Hd - boardT; // top of joists
  const cant = Math.min(24, Math.round(D / 8));
  const beamY = D - cant;
  const beams = attached ? [beamY] : [Math.min(18, D / 6), beamY];
  const span = attached ? beamY - 1.5 : beamY - beams[0];
  const table = JOIST_SPAN[sp] || JOIST_SPAN[16];
  const joistNom = ['2x6', '2x8', '2x10', '2x12'].find(n => table[n] >= span) || '2x12';
  if (table[joistNom] < span) m.note('warn', `A ${ftin(span)} joist span is past the 2x12 rule-of-thumb limit at ${sp}" spacing. Add a mid beam or tighten the spacing.`);
  const jd = depth(joistNom);
  const zJb = zJt - jd;
  if (zJb < 6) m.note('warn', `At ${Hd}" the deck is too low for ${joistNom} joists on top of a beam. Raise the deck or use a ground-level frame on blocks.`);

  // posts and beams
  const nPost = Math.max(2, Math.ceil(W / 96) + 1);
  const postSp = (W - 6) / (nPost - 1);
  const beamNom = postSp <= 72 ? '2x8' : postSp <= 96 ? '2x10' : '2x12';
  const bd = depth(beamNom);
  const zBt = zJb, zBb = zBt - bd;
  for (const by of beams) {
    for (let i = 0; i < nPost; i++) {
      const x = 3 + i * postSp;
      footing(m, x, by);
      if (zBb > 1) m.post('Posts & beams', 'Post', '6x6', 'pt', x, by, 0, zBb);
    }
    for (const off of [-0.75, 0.75]) m.box('Posts & beams', `Beam (2-ply ${beamNom})`, { c: [W / 2, by + off, zBb + bd / 2], s: [W, 1.5, bd], nominal: beamNom, material: 'pt', lengthIn: W });
    m.item('Hardware', 'postcap', 'Post-to-beam caps', nPost, 'ea');
  }

  // ledger / rim / joists
  if (attached) {
    m.box('Framing', `Ledger (${joistNom})`, { c: [W / 2, 0.75, zJb + jd / 2], s: [W, 1.5, jd], nominal: joistNom, material: 'pt', lengthIn: W });
    m.item('Hardware', 'ledgerlag', '1/2" ledger lags or through-bolts (2 every 16")', Math.ceil(W / 16) * 2, 'ea');
    m.item('Hardware', 'flashing', 'Ledger flashing, 10 ft', Math.ceil(W / 120), 'pcs');
  } else {
    m.box('Framing', `Rim joist (${joistNom})`, { c: [W / 2, 0.75, zJb + jd / 2], s: [W, 1.5, jd], nominal: joistNom, material: 'pt', lengthIn: W });
  }
  m.box('Framing', `Rim joist (${joistNom})`, { c: [W / 2, D - 0.75, zJb + jd / 2], s: [W, 1.5, jd], nominal: joistNom, material: 'pt', lengthIn: W });
  const nJ = Math.ceil((W - 1.5) / sp) + 1;
  for (let i = 0; i < nJ; i++) {
    const x = Math.min(W - 0.75, 0.75 + i * sp);
    m.box('Framing', i === 0 || i === nJ - 1 ? 'End joist' : 'Joist', { c: [x, D / 2, zJb + jd / 2], s: [1.5, D - 3, jd], nominal: joistNom, material: 'pt', lengthIn: D - 3 });
  }
  m.item('Hardware', 'hanger', `Joist hangers (${joistNom})`, attached ? nJ * 2 : nJ * 2, 'ea');
  m.item('Hardware', 'hurricane', 'Hurricane ties (joist to beam)', nJ * beams.length, 'ea');

  // decking along x
  const nb = Math.ceil((D + gap) / (boardW + gap));
  for (let j = 0; j < nb; j++) {
    const y = j * (boardW + gap) + boardW / 2;
    m.box('Decking', 'Deck board', { c: [W / 2, Math.min(y, D + 0.5 - boardW / 2), zJt + boardT / 2], s: [W, boardW, boardT], nominal: '5/4x6', material: dMat, lengthIn: W });
  }
  if (dMat === 'composite') m.item('Hardware', 'hidden', 'Hidden fasteners (box of 90, ≈ 50 sq ft)', Math.ceil(W * D / 144 / 50), 'boxes');
  else m.item('Hardware', 'deckscrews', 'Deck screws, 5 lb box (≈ 100 sq ft)', Math.ceil(W * D / 144 / 100), 'boxes');

  // stairs on the front edge (+y)
  let stairNote = '';
  const stairW = o.stairWidth;
  const sx0 = W / 2 - stairW / 2, sx1 = W / 2 + stairW / 2;
  if (o.stairs && Hd > 8) {
    const n = Math.ceil(Hd / 7.5), rise = Hd / n, run = 10.5, treads = n - 1;
    const runTotal = treads * run;
    const nStr = Math.ceil(stairW / 16) + 1;
    const ang = Math.atan2(Hd, runTotal + run);
    const strL = Math.hypot(Hd, runTotal + run) + 6;
    for (let i = 0; i < nStr; i++) {
      const x = sx0 + 0.75 + i * (stairW - 1.5) / (nStr - 1);
      const y0 = D, z0 = zJt - rise, y1 = D + runTotal + run, z1 = 0;
      const c = [x, (y0 + y1) / 2, (z0 + z1) / 2 + 2];
      m.box('Stairs', 'Stair stringer', { c, s: [1.5, strL, 11.25], r: [-ang, 0, 0], nominal: '2x12', material: 'pt', lengthIn: strL });
    }
    for (let t = 0; t < treads; t++) {
      const z = Hd - rise * (t + 1);
      for (let b = 0; b < 2; b++) m.box('Stairs', 'Stair tread', { c: [W / 2, D + t * run + b * 5.625 + 2.75, z - 0.5], s: [stairW, 5.5, 1], nominal: '5/4x6', material: dMat, lengthIn: stairW });
    }
    m.box('Foundation', 'Stair landing pad', { c: [W / 2, D + runTotal + 18, -2], s: [stairW + 12, 30, 4], material: 'concrete', kind: 'concrete' });
    m.item('Concrete', 'landing', 'Concrete for stair landing pad', +(yd3((stairW + 12) * 30 * 4) * 1.1).toFixed(2), 'yd³');
    stairNote = `${n} risers at ${ftin(rise)}, ${treads} treads at 10-1/2" run`;
    if (rise > 7.75) m.note('warn', 'Stair rise is over 7-3/4".');
    if (n >= 4) m.note('info', `Stairs with 4 or more risers need a graspable handrail on at least one side (not drawn). Allow two ${ftin(Math.hypot(Hd, runTotal) + 12)} handrails in the order.`);
  }

  // railings
  let railLF = 0;
  if (o.railing) {
    const rm = dMat === 'composite' ? 'pt' : dMat;
    const segs = [];
    const yF = D - 1.75;
    if (o.stairs && Hd > 8) { segs.push([1.75, yF, sx0, yF], [sx1, yF, W - 1.75, yF]); } else segs.push([1.75, yF, W - 1.75, yF]);
    segs.push([1.75, attached ? 1.75 : 1.75, 1.75, yF], [W - 1.75, 1.75, W - 1.75, yF]);
    if (!attached) segs.push([1.75, 1.75, W - 1.75, 1.75]);
    railLF = railing(m, segs, Hd, rm) / 12;
  } else if (Hd > 30) m.note('warn', 'Decks more than 30" above grade need a 36" guard (railing) in most US codes.');

  m.fact('Deck size', `${o.width}' x ${o.depth}' (${o.width * o.depth} sq ft)`);
  m.fact('Height', `${ftin(Hd)} to top of decking`);
  m.fact('Joists', `${joistNom} at ${sp}" o.c., ${ftin(span)} span, ${ftin(cant)} cantilever`);
  m.fact('Beam', `${beams.length} x 2-ply ${beamNom} on ${nPost} posts (${ftin(postSp)} apart)`);
  if (stairNote) m.fact('Stairs', stairNote);
  if (railLF) m.fact('Railing', `${Math.round(railLF)} LF`);
  m.laborHours = Math.round(o.width * o.depth * 0.25 + railLF * 0.4 + (o.stairs ? 6 : 0) + 4);
  m.note('info', `Joist and beam sizes are rule-of-thumb picks for #2 southern pine at 40 psf live load. Check them against your local code (for example IRC R507) before you build.`);
  if (attached) m.note('info', 'Attach the ledger to the house rim with through-bolts or structural screws, and flash it. Never attach to brick veneer or siding alone.');
  return m;
}

export function buildPergola(o) {
  const m = new Model(`${o.width}' x ${o.depth}' Pergola`);
  const W = o.width * 12, D = o.depth * 12, H = o.height * 12, oh = 12;
  const mat = o.lumber;
  const nx = W > 14 * 12 ? 3 : 2, ny = D > 14 * 12 ? 3 : 2;
  const beamNom = Math.max(W / (nx - 1), 0) > 12 * 12 ? '2x12' : '2x10';
  const bd = depth(beamNom);
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const x = 2.75 + i * (W - 5.5) / (nx - 1), y = 2.75 + j * (D - 5.5) / (ny - 1);
    if (o.footing === 'footing') footing(m, x, y); else m.item('Hardware', 'surfacebase', 'Surface-mount post bases (on slab)', 1, 'ea');
    m.post('Posts & beams', 'Post', '6x6', mat === 'cedar' ? 'cedar' : 'pt', x, y, 0, H);
  }
  for (let j = 0; j < ny; j++) {
    const y = 2.75 + j * (D - 5.5) / (ny - 1);
    for (const off of [-3.5, 3.5]) m.box('Posts & beams', `Beam (${beamNom})`, { c: [W / 2, y + off, H - bd / 2 + 2], s: [W + 2 * oh, 1.5, bd], nominal: beamNom, material: mat, lengthIn: W + 2 * oh });
    m.item('Hardware', 'beambolt', '1/2" through-bolts (beam to post)', nx * 2, 'ea');
  }
  const rafNom = '2x8', rd = depth(rafNom);
  const nR = Math.ceil(W / Number(o.rafterSpacing)) + 1;
  for (let i = 0; i < nR; i++) {
    const x = Math.min(W - 0.75, 0.75 + i * (W - 1.5) / (nR - 1));
    m.box('Rafters', 'Rafter', { c: [x, D / 2, H + 2 + rd / 2], s: [1.5, D + 2 * oh, rd], nominal: rafNom, material: mat, lengthIn: D + 2 * oh });
  }
  m.item('Hardware', 'rafterties', 'Rafter ties / hurricane clips', nR * ny, 'ea');
  if (o.slats) {
    const ns = Math.floor((D + 2 * oh - 6) / 12) + 1;
    for (let j = 0; j < ns; j++) m.box('Shade slats', 'Shade slat', { c: [W / 2, -oh + 3 + j * 12, H + 2 + rd + 0.75], s: [W + 2 * oh - 6, 1.5, 1.5], nominal: '2x2', material: mat, lengthIn: W + 2 * oh - 6 });
  }
  if (o.braces) {
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const x = 2.75 + i * (W - 5.5) / (nx - 1), y = 2.75 + j * (D - 5.5) / (ny - 1);
      const dir = i === 0 ? 1 : -1;
      m.member('Posts & beams', 'Knee brace', '4x4', mat === 'cedar' ? 'cedar' : 'pt', [x + dir * 2.75, y, H - bd - 24], [x + dir * 26, y, H - bd + 1], { axis: 'x' });
    }
  }
  m.fact('Footprint', `${o.width}' x ${o.depth}' (${o.width * o.depth} sq ft)`);
  m.fact('Clear height', `${o.height}' to bottom of beams`);
  m.fact('Rafters', `${nR} x ${rafNom} at ${o.rafterSpacing}" o.c., 12" overhang`);
  m.laborHours = Math.round(o.width * o.depth * 0.18 + 8);
  m.note('info', 'Freestanding pergolas need deep footings or knee braces for wind. In high-wind areas, use engineered post bases.');
  return m;
}
