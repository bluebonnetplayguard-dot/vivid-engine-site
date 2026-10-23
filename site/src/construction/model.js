// Shared model builder for the Construction Configurator.
// World axes: x = width, y = depth, z = up. All lengths in inches.
import { depth, stockFor, thick } from './lumber';

export const MATERIALS = {
  spf: { name: 'SPF / SYP #2 framing lumber', color: '#d8b77c', priceFactor: 1 },
  pt: { name: 'Pressure-treated SYP #2 (ground contact)', color: '#a98d56', priceFactor: 1.25 },
  cedar: { name: 'Western red cedar', color: '#b9714a', priceFactor: 2.3 },
  composite: { name: 'Composite decking', color: '#6f6a64', priceFactor: 3.4 },
  osb: { name: '7/16" OSB sheathing', color: '#c9a86a' },
  ply: { name: '3/4" T&G plywood', color: '#d9bd85' },
  concrete: { name: 'Concrete', color: '#a7a9ad' },
  shingle: { name: 'Architectural asphalt shingles', color: '#3a3f47' },
  metalRoof: { name: '29 ga. metal roof panels', color: '#7d93a8' },
  t111: { name: 'T1-11 siding panels', color: '#b78b5a' },
  smartside: { name: 'Engineered wood lap siding (primed)', color: '#d7d2c4' },
  vinyl: { name: 'Vinyl lap siding', color: '#e6e3da' },
  metalSiding: { name: '29 ga. metal wall panels', color: '#9fb2c4' },
  door: { name: 'Door', color: '#3c4a5c' },
  glass: { name: 'Window', color: '#8fd3ff' },
  trim: { name: 'Trim', color: '#f1efe9' },
  steel: { name: 'Galvanized hardware', color: '#9aa3ad' },
  plastic: { name: 'HDPE slide / play panel', color: '#ffb02e' },
  seat: { name: 'Belt swing seat', color: '#1c2a3a' },
  rock: { name: 'Climbing wall panel', color: '#5e7d4f' },
  canopy: { name: 'Canopy fabric', color: '#2f80c9' },
  zone: { name: 'Protective surfacing (use zone)', color: '#7a5a3a' },
};

export class Model {
  constructor(title) {
    this.title = title;
    this.elements = [];
    this.items = [];      // non-lumber takeoff lines
    this.notes = [];      // { level: 'info'|'warn', text }
    this.facts = [];      // headline numbers: { label, value }
    this.n = 0;
  }

  // A box member. c = center, s = size, r = Euler XYZ rotation (radians).
  box(group, name, { c, s, r = [0, 0, 0], nominal, material = 'spf', kind = 'lumber', lengthIn, color, opacity }) {
    const id = `e${++this.n}`;
    const el = { id, group, name, shape: 'box', c, s, r, nominal, material, kind, lengthIn, color: color || MATERIALS[material]?.color || '#ccc' };
    if (opacity != null) el.opacity = opacity;
    this.elements.push(el);
    return el;
  }

  // A flat panel: polygon in the (u, v) plane at origin o, extruded t along u × v.
  poly(group, name, { o, u, v, pts, holes = [], t, material, kind = 'finish', color, opacity }) {
    const id = `e${++this.n}`;
    const el = { id, group, name, shape: 'poly', o, u, v, pts, holes, t, material, kind, color: color || MATERIALS[material]?.color || '#ccc' };
    if (opacity != null) el.opacity = opacity;
    this.elements.push(el);
    return el;
  }

  // Lumber between two points; the member's wide face is set by `up` (the depth direction).
  // Works for any direction in the x-z or y-z plane, and for axis-aligned members.
  member(group, name, nominal, material, a, b, { flat = false, axis } = {}) {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const L = Math.hypot(dx, dy, dz);
    const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const t = thick(nominal), d = depth(nominal);
    // narrow (t) is horizontal and across the member, wide (d) is vertical unless flat
    const across = flat ? d : t, vert = flat ? t : d;
    let s, r;
    const along = axis || (Math.abs(dz) > Math.abs(dx) && Math.abs(dz) > Math.abs(dy) && Math.hypot(dx, dy) < 1e-6 ? 'z' : Math.abs(dy) > Math.abs(dx) ? 'y' : 'x');
    if (along === 'z') { s = [t, d, L]; r = [0, 0, 0]; }
    else if (along === 'x') { s = [L, across, vert]; r = [0, -Math.atan2(dz, dx), 0]; }
    else { s = [across, L, vert]; r = [Math.atan2(dz, dy), 0, 0]; }
    return this.box(group, name, { c, s, r, nominal, material, lengthIn: L });
  }

  // Post standing on z0 with height h.
  post(group, name, nominal, material, x, y, z0, h) {
    const t = thick(nominal), d = depth(nominal);
    return this.box(group, name, { c: [x, y, z0 + h / 2], s: [t, d, h], nominal, material, lengthIn: h });
  }

  item(category, key, label, qty, unit, extra = {}) {
    if (!(qty > 0)) return;
    const found = this.items.find(i => i.key === key);
    if (found) found.qty += qty; else this.items.push({ category, key, label, qty, unit, ...extra });
  }

  note(level, text) { this.notes.push({ level, text }); }
  fact(label, value) { this.facts.push({ label, value }); }

  bounds() {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    const grow = p => { for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); } };
    for (const e of this.elements) {
      if (e.shape === 'box') {
        const [rx, ry, rz] = e.r, [a, b, c] = e.s.map(v => v / 2);
        const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
        for (const p of [[-a, -b, -c], [a, -b, -c], [-a, b, -c], [a, b, -c], [-a, -b, c], [a, -b, c], [-a, b, c], [a, b, c]]) {
          // Euler XYZ (three.js): v' = Rx * Ry * Rz * v
          let [x, y, z] = p;
          [x, y] = [x * cz - y * sz, x * sz + y * cz];
          [x, z] = [x * cy + z * sy, -x * sy + z * cy];
          [y, z] = [y * cx - z * sx, y * sx + z * cx];
          grow([e.c[0] + x, e.c[1] + y, e.c[2] + z]);
        }
      } else {
        for (const [pu, pv] of e.pts) grow([0, 1, 2].map(k => e.o[k] + e.u[k] * pu + e.v[k] * pv));
      }
    }
    return [lo, hi];
  }
}

// Lumber to buy, per material + nominal size. Cuts are packed into stock lengths with
// first-fit decreasing (1/8" kerf), so short cuts share boards with longer ones.
export function lumberTakeoff(model) {
  const groups = new Map();
  for (const e of model.elements) {
    if (e.kind !== 'lumber') continue;
    const k = `${e.material}|${e.nominal}`;
    if (!groups.has(k)) groups.set(k, { material: e.material, nominal: e.nominal, cuts: [] });
    groups.get(k).cuts.push(e.lengthIn);
  }
  const rows = new Map();
  const add = (g, ft, n, lf) => {
    const key = `${g.material}|${g.nominal}|${ft}`;
    const r = rows.get(key) || { material: g.material, nominal: g.nominal, stockFt: ft, qty: 0, cuts: 0, lf: 0 };
    r.qty += n; r.lf += lf; rows.set(key, r); return r;
  };
  const kerf = 0.125;
  for (const g of groups.values()) {
    const bins = []; // { ft, left, cuts }
    for (const L of g.cuts.sort((a, b) => b - a)) {
      const st = stockFor(L);
      if (st.pieces > 1) { add(g, 20, st.pieces, L / 12).cuts += 1; continue; }
      const bin = bins.find(b => b.left >= L + kerf - 1e-9);
      if (bin) { bin.left -= L + kerf; bin.cuts++; bin.lf += L / 12; }
      else bins.push({ ft: st.ft, left: st.ft * 12 - L - kerf, cuts: 1, lf: L / 12 });
    }
    for (const b of bins) add(g, b.ft, 1, b.lf).cuts += b.cuts;
  }
  const order = n => ['2x2', '1x6', '2x4', '2x6', '2x8', '2x10', '2x12', 'LVL 1-3/4x11-7/8', '5/4x6', '4x4', '4x6', '6x6'].indexOf(n);
  return [...rows.values()].sort((a, b) => a.material.localeCompare(b.material) || order(a.nominal) - order(b.nominal) || a.stockFt - b.stockFt);
}

// Cut list grouped by assembly.
export function cutList(model) {
  const map = new Map();
  for (const e of model.elements) {
    if (e.kind !== 'lumber') continue;
    const L = Math.round(e.lengthIn * 16) / 16;
    const key = `${e.group}|${e.name}|${e.nominal}|${e.material}|${L}`;
    const row = map.get(key) || { group: e.group, name: e.name, nominal: e.nominal, material: e.material, lengthIn: L, qty: 0 };
    row.qty += 1; map.set(key, row);
  }
  return [...map.values()].sort((a, b) => a.group.localeCompare(b.group) || b.lengthIn - a.lengthIn);
}

export const sheets = (sqft, waste = 0.1) => Math.ceil(sqft * (1 + waste) / 32);
export const yd3 = cuin => cuin / 46656;
