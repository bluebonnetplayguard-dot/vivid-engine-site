// Sheds and garages: foundation, floor, stud walls with openings, gable or lean-to roof, finishes.
import { Model, sheets, yd3 } from './model';
import { depth } from './lumber';

const SIDING = { t111: 't111', smartside: 'smartside', vinyl: 'vinyl', metal: 'metalSiding' };

function headerFor(w) {
  if (w <= 48) return '2x6';
  if (w <= 72) return '2x8';
  if (w <= 96) return '2x10';
  if (w <= 120) return '2x12';
  return 'LVL 1-3/4x11-7/8';
}

export function buildBuilding(o, kind) {
  const m = new Model(kind === 'garage' ? `${o.width}' x ${o.depth}' Garage` : `${o.width}' x ${o.depth}' Storage Shed`);
  const W = o.width * 12, D = o.depth * 12, H = o.wallHeight * 12, sp = Number(o.studSpacing);
  const p = o.pitch / 12, oh = o.overhang;
  const studMat = 'spf', wallT = 3.5;

  // ---------- Foundation and floor ----------
  let f = 0; // top of finished floor
  if (o.foundation === 'slab') {
    const t = 4;
    m.box('Foundation', 'Concrete slab', { c: [W / 2, D / 2, -t / 2], s: [W, D, t], material: 'concrete', kind: 'concrete' });
    const slabCu = W * D * t;
    const thick = 2 * (W + D) * 12 * 8; // 12" wide x 8" deeper thickened edge
    m.item('Concrete', 'concrete', 'Ready-mix concrete (slab + thickened edge, +10%)', +(yd3(slabCu + thick) * 1.1).toFixed(2), 'yd³');
    m.item('Concrete', 'rebar', '#4 rebar, 20 ft (perimeter + 24" grid)', Math.ceil((2 * (W + D) * 2 + (W / 24 + 1) * D + (D / 24 + 1) * W) / 12 / 20 * 1.1), 'pcs');
    m.item('Concrete', 'vapor', '6 mil vapor barrier', Math.ceil(W * D / 144 * 1.15), 'sq ft');
    m.item('Hardware', 'anchor', '1/2" anchor bolts with washers', Math.ceil(2 * (W + D) / 72) + 4, 'ea');
    m.note('info', `Slab: ${t}" thick with a 12" x 12" thickened edge. Pour on compacted base; confirm thickness for vehicle loads with your local code.`);
  } else {
    const onPiers = o.foundation === 'piers';
    const base = onPiers ? 12 : 0;
    const runners = Math.max(2, Math.ceil(W / 48) + 1);
    const runnerNom = '4x6';
    for (let i = 0; i < runners; i++) {
      const x = Math.min(W - 1.75, Math.max(1.75, (W - 3.5) * i / (runners - 1) + 1.75));
      m.box('Foundation', onPiers ? 'Beam' : 'Skid', { c: [x, D / 2, base + depth(runnerNom) / 2], s: [3.5, D, 5.5], nominal: runnerNom, material: 'pt', lengthIn: D });
      if (onPiers) {
        const piers = Math.max(2, Math.ceil(D / 72) + 1);
        for (let j = 0; j < piers; j++) {
          const y = Math.min(D - 6, Math.max(6, (D - 12) * j / (piers - 1) + 6));
          m.box('Foundation', 'Concrete pier', { c: [x, y, base / 2 - 12], s: [12, 12, base + 24], material: 'concrete', kind: 'concrete' });
        }
        m.item('Concrete', 'pierbags', '80 lb concrete mix bags (12" x 36" piers)', piers * Math.ceil(12 * 12 * 36 / 1728 / 0.6), 'bags');
        m.item('Hardware', 'postbase', 'Pier-to-beam connectors', piers, 'ea');
      }
    }
    if (!onPiers) m.item('Site', 'gravel', 'Gravel pad (4" deep, 1 ft wider all round)', +(yd3((W + 24) * (D + 24) * 4) * 1.1).toFixed(2), 'yd³');
    const fz = base + 5.5;
    const joistNom = W > 12 * 12 ? '2x8' : '2x6';
    const jd = depth(joistNom);
    const nj = Math.ceil((D - 1.5) / 16) + 1;
    for (let j = 0; j < nj; j++) {
      const y = Math.min(D - 0.75, 0.75 + j * 16);
      m.member('Floor', j === 0 || j === nj - 1 ? 'Rim joist' : 'Floor joist', joistNom, 'pt', [0, y, fz + jd / 2], [W, y, fz + jd / 2]);
    }
    for (const x of [0.75, W - 0.75]) m.member('Floor', 'Band joist', joistNom, 'pt', [x, 1.5, fz + jd / 2], [x, D - 1.5, fz + jd / 2], { axis: 'y' });
    m.box('Floor', '3/4" T&G plywood floor', { c: [W / 2, D / 2, fz + jd + 0.375], s: [W, D, 0.75], material: 'ply', kind: 'sheet' });
    m.item('Sheet goods', 'ply', '3/4" T&G plywood floor, 4x8', sheets(W * D / 144), 'sheets');
    m.item('Hardware', 'hanger', 'Joist hangers / hurricane clips (floor)', 2 * nj, 'ea');
    f = fz + jd + 0.75;
  }

  // ---------- Openings ----------
  const openings = { front: [], back: [], left: [], right: [] };
  const doorW = o.door === 'overhead' ? (o.width >= 20 ? 16 * 12 : 9 * 12) : o.door === 'double' ? 64 : 38;
  const doorH = o.door === 'overhead' ? Math.min(H - 16, 7 * 12) : Math.min(H - 10, 82.5);
  if (doorW > W - 24) m.note('warn', 'The door is almost as wide as the front wall. Make the building wider or pick a smaller door.');
  openings.front.push({ c: W / 2, w: Math.min(doorW, W - 24), h: doorH, sill: 0, type: o.door });
  const winW = 36 + 2, winH = 36 + 2, sill = Math.min(40, H - winH - 16);
  const nWin = Math.max(0, Math.min(6, o.windows | 0));
  for (let i = 0; i < nWin; i++) {
    const side = ['left', 'right', 'back', 'left', 'right', 'back'][i];
    const len = side === 'back' ? W : D;
    const same = ['left', 'right', 'back', 'left', 'right', 'back'].slice(0, nWin).filter(s => s === side).length;
    const idx = openings[side].length;
    openings[side].push({ c: len * (idx + 1) / (same + 1), w: winW, h: winH, sill, type: 'window' });
  }
  if (kind === 'garage' && o.sideDoor) openings.right.push({ c: D * 0.75, w: 38, h: 82.5, sill: 0, type: 'single' });

  // ---------- Walls ----------
  const studL = H - 4.5;
  const top = f + H;
  let studs = 0;
  // wall(along-axis, start u0, length, fixed coordinate of the wall's centerline, openings)
  const wall = (label, axis, u0, len, fixed, ops) => {
    const P = (u, z) => axis === 'x' ? [u0 + u, fixed, z] : [fixed, u0 + u, z];
    const plate = (name, z) => m.member(`Walls · ${label}`, name, '2x4', z === f + 0.75 && o.foundation === 'slab' ? 'pt' : studMat, P(0, z), P(len, z), { flat: true, axis });
    plate('Bottom plate', f + 0.75); plate('Top plate', top - 2.25); plate('Cap plate', top - 0.75);
    const stud = (name, u, z0, z1) => { studs++; const a = P(u, z0), b = P(u, z1); return m.box(`Walls · ${label}`, name, { c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (z0 + z1) / 2], s: axis === 'x' ? [1.5, 3.5, z1 - z0] : [3.5, 1.5, z1 - z0], nominal: '2x4', material: studMat, lengthIn: z1 - z0 }); };
    const zs0 = f + 1.5, zs1 = top - 3;
    const inOpening = u => ops.some(op => u > op.c - op.w / 2 - 3.1 && u < op.c + op.w / 2 + 3.1);
    const pos = [0.75, len - 0.75];
    for (let u = sp; u < len - 1; u += sp) pos.push(u);
    // corner backer studs so sheathing and drywall have nailing
    pos.push(2.25, len - 2.25);
    for (const u of [...new Set(pos.map(v => +v.toFixed(3)))]) if (!inOpening(u)) stud('Stud', u, zs0, zs1);
    for (const op of ops) {
      const l = op.c - op.w / 2, r = op.c + op.w / 2;
      const hn = headerFor(op.w), hd = depth(hn);
      const zTopRO = zs0 + op.sill + op.h; // top of rough opening
      const zHead = Math.min(zTopRO + hd, zs1);
      stud('King stud', l - 2.25, zs0, zs1); stud('King stud', r + 2.25, zs0, zs1);
      stud('Jack stud', l - 0.75, zs0, zHead - hd); stud('Jack stud', r + 0.75, zs0, zHead - hd);
      const hl = op.w + 3;
      for (const off of [-0.875, 0.875]) {
        const a = P(op.c - hl / 2, zHead - hd / 2), b = P(op.c + hl / 2, zHead - hd / 2);
        const shift = axis === 'x' ? [0, off, 0] : [off, 0, 0];
        m.box(`Walls · ${label}`, 'Header', { c: [(a[0] + b[0]) / 2 + shift[0], (a[1] + b[1]) / 2 + shift[1], zHead - hd / 2], s: axis === 'x' ? [hl, 1.5, hd] : [1.5, hl, hd], nominal: hn, material: hn.startsWith('LVL') ? 'spf' : studMat, lengthIn: hl });
      }
      if (hn.startsWith('LVL')) m.note('warn', `${label} wall: a ${Math.round(op.w / 12)} ft opening needs an engineered (LVL or glulam) header. Have it sized by the supplier or an engineer.`);
      for (let u = Math.ceil(l / sp) * sp; u < r; u += sp) {
        if (zs1 - zHead > 1) stud('Cripple', u, zHead, zs1);
        if (op.sill > 0) stud('Cripple', u, zs0, zs0 + op.sill - 1.5);
      }
      if (op.sill > 0) {
        const a = P(op.c - op.w / 2, zs0 + op.sill - 0.75), b = P(op.c + op.w / 2, zs0 + op.sill - 0.75);
        m.member(`Walls · ${label}`, 'Sill', '2x4', studMat, a, b, { flat: true, axis });
      }
      // finish unit
      const inset = axis === 'x' ? (fixed < D / 2 ? -1.75 : 1.75) : (fixed < W / 2 ? -1.75 : 1.75);
      const cU = op.c, cZ = zs0 + op.sill + op.h / 2;
      const cc = P(cU, cZ); if (axis === 'x') cc[1] += inset; else cc[0] += inset;
      const sz = axis === 'x' ? [op.w - 2, 1.75, op.h - 2] : [1.75, op.w - 2, op.h - 2];
      if (op.type === 'window') m.box('Doors & windows', 'Window 36" x 36"', { c: cc, s: sz, material: 'glass', kind: 'finish', opacity: 0.55 });
      else m.box('Doors & windows', op.type === 'overhead' ? `Overhead door ${Math.round(op.w / 12)}' x ${Math.round(op.h / 12)}'` : op.type === 'double' ? 'Double door' : 'Entry door', { c: cc, s: sz, material: 'door', kind: 'finish' });
    }
    return ops;
  };
  wall('Front', 'x', 0, W, 1.75, openings.front);
  wall('Back', 'x', 0, W, D - 1.75, openings.back);
  wall('Left', 'y', 3.5, D - 7, 1.75, openings.left.map(op => ({ ...op, c: op.c - 3.5 })));
  wall('Right', 'y', 3.5, D - 7, W - 1.75, openings.right.map(op => ({ ...op, c: op.c - 3.5 })));

  // ---------- Roof ----------
  const rSp = 24;
  const rafterNom = (o.roof === 'gable' ? W / 2 : W) <= 8 * 12 ? '2x4' : (o.roof === 'gable' ? W / 2 : W) <= 12 * 12 ? '2x6' : (o.roof === 'gable' ? W / 2 : W) <= 16 * 12 ? '2x8' : '2x10';
  const rd = depth(rafterNom);
  const a = Math.atan(p);
  const nR = Math.ceil(D / rSp) + 1;
  const ys = Array.from({ length: nR }, (_, i) => Math.min(D - 0.75, Math.max(0.75, i * rSp)));
  const gOh = Math.min(oh, 12); // gable overhang on sheathing
  let roofArea = 0, ridgeLen = 0, eaveLen = 0, rakeLen = 0;
  const up = rd / Math.cos(a); // vertical thickness of a rafter
  const gableStuds = [];
  if (o.roof === 'gable') {
    const rise = (W / 2) * p;
    const zr = top + rise; // roof line at ridge (bottom of rafters, at the wall line extension)
    for (const y of ys) {
      // left rafter: from eave tail to ridge, bottom edge on plate line
      const x0 = -oh, z0 = top - oh * p, x1 = W / 2 - 0.75, z1 = top + (W / 2 - 0.75) * p;
      const nz = up / 2;
      m.member('Roof framing', 'Common rafter', rafterNom, 'spf', [x0, y, z0 + nz], [x1, y, z1 + nz]);
      m.member('Roof framing', 'Common rafter', rafterNom, 'spf', [W - x0, y, z0 + nz], [W - x1, y, z1 + nz]);
      m.member('Roof framing', 'Rafter tie', '2x4', 'spf', [3.5, y, top + 1.75], [W - 3.5, y, top + 1.75], { axis: 'x' });
      m.item('Hardware', 'hurricane', 'Hurricane ties (rafter to plate)', 2, 'ea');
    }
    const ridgeNom = { '2x4': '2x6', '2x6': '2x8', '2x8': '2x10', '2x10': '2x12' }[rafterNom];
    m.box('Roof framing', 'Ridge board', { c: [W / 2, D / 2, zr + up - depth(ridgeNom) / 2 + 0.5], s: [1.5, D, depth(ridgeNom)], nominal: ridgeNom, material: 'spf', lengthIn: D });
    // gable end studs (front and back)
    for (const yW of [1.75, D - 1.75]) {
      for (let x = sp; x < W - 1; x += sp) {
        const h = (x <= W / 2 ? x : W - x) * p;
        if (h < 8) continue;
        m.box(`Walls · ${yW < D / 2 ? 'Front' : 'Back'}`, 'Gable stud', { c: [x, yW, top + h / 2], s: [1.5, 3.5, h], nominal: '2x4', material: studMat, lengthIn: h });
        gableStuds.push(x); studs++;
      }
    }
    // sheathing + roofing panels
    const slope = (W / 2 + oh) / Math.cos(a);
    roofArea = 2 * slope * (D + 2 * gOh);
    for (const side of [-1, 1]) {
      const n = [side * Math.sin(a), 0, Math.cos(a)];
      const mid = side < 0 ? [(-oh + W / 2) / 2, D / 2, (top - oh * p + zr) / 2] : [(W + oh + W / 2) / 2, D / 2, (top - oh * p + zr) / 2];
      const lift = rd + 0.22;
      const c = mid.map((v, k) => v + n[k] * lift);
      m.box('Roof sheathing', 'Roof sheathing (OSB)', { c, s: [slope, D + 2 * gOh, 0.44], r: [0, side < 0 ? -a : a, 0], material: 'osb', kind: 'sheet' });
      const c2 = mid.map((v, k) => v + n[k] * (lift + 0.6));
      m.box('Roofing', o.roofing === 'metal' ? 'Metal roof panels' : 'Shingles', { c: c2, s: [slope + 1, D + 2 * gOh + 1, 0.5], r: [0, side < 0 ? -a : a, 0], material: o.roofing === 'metal' ? 'metalRoof' : 'shingle', kind: 'finish' });
    }
    ridgeLen = D + 2 * gOh; eaveLen = 2 * (D + 2 * gOh); rakeLen = 4 * slope;
    for (const x of [-oh, W + oh]) m.box('Trim', 'Fascia', { c: [x, D / 2, top - oh * p + 1], s: [0.75, D + 2 * gOh, 5.5], nominal: '1x6', material: 'trim', kind: 'finish' });
  } else {
    const rise = W * p;
    for (const y of ys) {
      m.member('Roof framing', 'Rafter', rafterNom, 'spf', [-oh, y, top + rise + oh * p + up / 2], [W + oh, y, top - oh * p + up / 2]);
      m.item('Hardware', 'hurricane', 'Hurricane ties (rafter to plate)', 2, 'ea');
    }
    // raise the left (high) wall with a pony wall
    for (const yW of [1.75, D - 1.75]) {
      for (let x = sp; x < W - 1; x += sp) {
        const h = (W - x) * p;
        if (h < 8) continue;
        m.box(`Walls · ${yW < D / 2 ? 'Front' : 'Back'}`, 'Rake-wall stud', { c: [x, yW, top + h / 2], s: [1.5, 3.5, h], nominal: '2x4', material: studMat, lengthIn: h });
        studs++;
      }
    }
    for (let y = 3.5 + 0.75; y < D - 3.5; y += sp) {
      m.box('Walls · Left', 'Pony-wall stud', { c: [1.75, y, top + rise / 2], s: [3.5, 1.5, rise], nominal: '2x4', material: studMat, lengthIn: rise });
      studs++;
    }
    m.member('Walls · Left', 'Pony-wall plate', '2x4', studMat, [1.75, 0, top + rise - 0.75], [1.75, D, top + rise - 0.75], { flat: true, axis: 'y' });
    const slope = (W + 2 * oh) / Math.cos(a);
    roofArea = slope * (D + 2 * gOh);
    const mid = [W / 2, D / 2, top + rise / 2];
    const n = [Math.sin(a), 0, Math.cos(a)];
    m.box('Roof sheathing', 'Roof sheathing (OSB)', { c: mid.map((v, k) => v + n[k] * (rd + 0.22)), s: [slope, D + 2 * gOh, 0.44], r: [0, a, 0], material: 'osb', kind: 'sheet' });
    m.box('Roofing', o.roofing === 'metal' ? 'Metal roof panels' : 'Shingles', { c: mid.map((v, k) => v + n[k] * (rd + 0.82)), s: [slope + 1, D + 2 * gOh + 1, 0.5], r: [0, a, 0], material: o.roofing === 'metal' ? 'metalRoof' : 'shingle', kind: 'finish' });
    eaveLen = 2 * (D + 2 * gOh); rakeLen = 2 * slope;
    if (o.pitch < 3 && o.roofing !== 'metal') m.note('warn', 'Asphalt shingles need at least a 2/12 pitch, with extra underlayment below 4/12. Metal panels are a better fit for low slopes.');
  }

  // ---------- Siding (panels with openings cut out) ----------
  const sidingMat = SIDING[o.siding] || 't111';
  const rise = o.roof === 'gable' ? (W / 2) * p : W * p;
  const wallFace = (label, o3, u, v, len, ops, topPts) => {
    const pts = [[0, f - 1], [len, f - 1], ...topPts];
    const holes = ops.map(op => {
      const l = op.c - op.w / 2, r = op.c + op.w / 2, b = f + 1.5 + op.sill, t2 = b + op.h;
      return [[l, b], [r, b], [r, t2], [l, t2]];
    });
    m.poly('Siding', `Siding · ${label}`, { o: o3, u, v, pts, holes, t: 0.5, material: sidingMat, kind: 'finish' });
  };
  const gableTop = len => o.roof === 'gable' ? [[len, top], [len / 2, top + rise], [0, top]] : [[len, top], [0, top + rise]];
  wallFace('Front', [0, -0.5, 0], [1, 0, 0], [0, 0, 1], W, openings.front, gableTop(W));
  wallFace('Back', [W, D + 0.5, 0], [-1, 0, 0], [0, 0, 1], W, openings.back.map(op => ({ ...op, c: W - op.c })), o.roof === 'gable' ? gableTop(W) : [[W, top + rise], [0, top]]);
  wallFace('Left', [-0.5, D, 0], [0, -1, 0], [0, 0, 1], D, openings.left.map(op => ({ ...op, c: D - op.c })), o.roof === 'gable' ? [[D, top], [0, top]] : [[D, top + rise], [0, top + rise]]);
  wallFace('Right', [W + 0.5, 0, 0], [0, 1, 0], [0, 0, 1], D, openings.right, [[D, top], [0, top]]);

  // ---------- Areas and takeoff ----------
  const gableArea = o.roof === 'gable' ? 2 * (W * rise / 2) : 2 * (W * rise / 2) + D * rise;
  const openArea = Object.values(openings).flat().reduce((s, op) => s + op.w * op.h, 0);
  const wallArea = (2 * (W + D) * (top - f + 1) + gableArea - openArea) / 144;
  const roofSq = roofArea / 144;
  if (sidingMat === 't111') m.item('Sheet goods', 'siding:t111', 'T1-11 siding panels, 4x8', sheets(wallArea, 0.12), 'sheets');
  else {
    m.item('Sheet goods', 'osb:wall', '7/16" OSB wall sheathing, 4x8', sheets(wallArea, 0.1), 'sheets');
    m.item('Finishes', 'housewrap', 'House wrap', Math.ceil(wallArea * 1.15), 'sq ft');
    if (sidingMat === 'smartside') m.item('Finishes', 'siding:lap', 'Engineered wood lap siding (8" exposure)', Math.ceil(wallArea * 1.12), 'sq ft');
    if (sidingMat === 'vinyl') m.item('Finishes', 'siding:vinyl', 'Vinyl siding', Math.ceil(wallArea * 1.12 / 100 * 10) / 10, 'squares');
    if (sidingMat === 'metalSiding') m.item('Finishes', 'siding:metal', '29 ga. metal wall panels', Math.ceil(wallArea * 1.1), 'sq ft');
  }
  m.item('Sheet goods', 'osb:roof', '7/16" OSB roof sheathing, 4x8', sheets(roofSq, 0.1), 'sheets');
  if (o.roofing === 'metal') {
    m.item('Roofing', 'metal', '29 ga. metal roof panels', Math.ceil(roofSq * 1.08), 'sq ft');
    m.item('Roofing', 'metalscrews', 'Metal roofing screws (bags of 250)', Math.ceil(roofSq / 100 * 80 / 250) || 1, 'bags');
    if (ridgeLen) m.item('Roofing', 'ridgecap:metal', 'Metal ridge cap, 10 ft', Math.ceil(ridgeLen / 120), 'pcs');
  } else {
    const sq = roofSq / 100;
    m.item('Roofing', 'shingles', 'Architectural shingles (3 bundles per square, +10%)', Math.ceil(sq * 1.1 * 3), 'bundles');
    m.item('Roofing', 'underlay', 'Synthetic underlayment, 10-square roll', Math.ceil(sq * 1.1 / 10), 'rolls');
    m.item('Roofing', 'dripedge', 'Drip edge, 10 ft', Math.ceil((eaveLen + rakeLen) / 120), 'pcs');
    if (ridgeLen) m.item('Roofing', 'ridgecap', 'Ridge cap shingles (bundle ≈ 20 LF)', Math.ceil(ridgeLen / 12 / 20), 'bundles');
    m.item('Roofing', 'roofnails', 'Coil roofing nails, 7,200 ct box', Math.ceil(sq / 16) || 1, 'boxes');
  }
  m.item('Trim', 'trim', '1x4 / 1x6 trim boards (corners, fascia, openings)', Math.ceil((4 * (top - f) + eaveLen + rakeLen + Object.values(openings).flat().reduce((s, op) => s + 2 * (op.w + op.h), 0)) / 12 / 12) , '12 ft pcs');
  for (const op of Object.values(openings).flat()) {
    if (op.type === 'window') m.item('Doors & windows', 'win', 'Window, 36" x 36" (shed/utility)', 1, 'ea');
    else if (op.type === 'overhead') m.item('Doors & windows', `oh${op.w}`, `Overhead garage door ${Math.round(op.w / 12)}' x ${Math.round(op.h / 12)}' with opener`, 1, 'ea');
    else if (op.type === 'double') m.item('Doors & windows', 'dbl', 'Double door kit, 64" rough opening', 1, 'ea');
    else m.item('Doors & windows', 'entry', 'Prehung exterior door, 36"', 1, 'ea');
  }
  const framing = m.elements.filter(e => e.kind === 'lumber').length;
  m.item('Hardware', 'nails16', '16d framing nails, 5 lb box (allowance)', Math.ceil(framing / 45), 'boxes');
  m.item('Hardware', 'nails8', '8d siding / sheathing nails, 5 lb box (allowance)', Math.ceil((wallArea + roofSq) / 400), 'boxes');

  m.fact('Footprint', `${o.width}' x ${o.depth}' (${o.width * o.depth} sq ft)`);
  m.fact('Wall height', `${o.wallHeight}' plate height`);
  m.fact('Roof', `${o.roof === 'gable' ? 'Gable' : 'Lean-to'}, ${o.pitch}/12, ${Math.round(roofSq)} sq ft`);
  m.fact('Wall area', `${Math.round(wallArea)} sq ft (net of openings)`);
  m.fact('Studs', `${studs} at ${sp}" o.c.`);
  m.fact('Rafters', `${rafterNom} at 24" o.c.`);
  m.laborHours = Math.round(o.width * o.depth * (kind === 'garage' ? 0.3 : 0.38) + nWin * 1.5 + 6);
  if (kind === 'garage' || o.width * o.depth > 200) m.note('warn', 'Buildings over 200 sq ft usually need a building permit, and garages need engineered roof framing or trusses in most areas. Check with your city or county.');
  m.note('info', `Rafter size (${rafterNom}) is a rule-of-thumb preview for light roof loads. Confirm spans against your local code span tables or use engineered trusses.`);
  return m;
}
