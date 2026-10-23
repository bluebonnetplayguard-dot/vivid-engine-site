// Construction Configurator: structure types, their options, and pricing.
import { buildBuilding } from './building';
import { buildDeck, buildPergola } from './deck';
import { buildPlayset, SURFACING } from './playset';
import { cutList, lumberTakeoff, MATERIALS } from './model';

const num = (key, label, min, max, step, def, unit = '') => ({ key, label, type: 'number', min, max, step, default: def, unit });
const sel = (key, label, choices, def) => ({ key, label, type: 'select', choices, default: def });
const tog = (key, label, def) => ({ key, label, type: 'toggle', default: def });

const BUILDING_OPTS = (kind) => [
  { section: 'Size' },
  num('width', 'Width', 6, kind === 'garage' ? 40 : 20, 1, kind === 'garage' ? 24 : 10, 'ft'),
  num('depth', 'Depth', 6, kind === 'garage' ? 40 : 24, 1, kind === 'garage' ? 24 : 12, 'ft'),
  num('wallHeight', 'Wall height', 6, 12, 1, kind === 'garage' ? 9 : 7, 'ft'),
  { section: 'Structure' },
  sel('foundation', 'Foundation', kind === 'garage' ? [['slab', 'Concrete slab']] : [['skids', 'Treated skids on gravel'], ['piers', 'Concrete piers'], ['slab', 'Concrete slab']], kind === 'garage' ? 'slab' : 'skids'),
  sel('studSpacing', 'Stud spacing', [['16', '16" on center'], ['24', '24" on center']], '16'),
  sel('roof', 'Roof style', [['gable', 'Gable'], ['leanto', 'Lean-to (single slope)']], 'gable'),
  num('pitch', 'Roof pitch', 2, 12, 1, kind === 'garage' ? 6 : 5, '/12'),
  num('overhang', 'Eave overhang', 0, 24, 2, 12, 'in'),
  { section: 'Openings' },
  sel('door', 'Main door', kind === 'garage' ? [['overhead', 'Overhead garage door'], ['double', 'Double door']] : [['single', 'Single 36" door'], ['double', 'Double door'], ['overhead', 'Roll-up / overhead door']], kind === 'garage' ? 'overhead' : 'double'),
  ...(kind === 'garage' ? [tog('sideDoor', 'Side entry door', true)] : []),
  num('windows', 'Windows', 0, 6, 1, 2),
  { section: 'Finishes' },
  sel('siding', 'Siding', [['t111', 'T1-11 panels'], ['smartside', 'Engineered wood lap'], ['vinyl', 'Vinyl lap'], ['metal', 'Metal panels']], kind === 'garage' ? 'smartside' : 't111'),
  sel('roofing', 'Roofing', [['shingle', 'Architectural shingles'], ['metal', 'Metal panels']], 'shingle'),
];

export const TYPES = {
  shed: { label: 'Storage shed', blurb: 'Framed walls, floor, door, windows and a gable or lean-to roof.', build: o => buildBuilding(o, 'shed'), options: BUILDING_OPTS('shed') },
  garage: { label: 'Garage', blurb: 'Slab, framed walls, overhead door and roof framing.', build: o => buildBuilding(o, 'garage'), options: BUILDING_OPTS('garage') },
  deck: {
    label: 'Deck', blurb: 'Footings, posts, beams, joists, decking, railing and stairs.', build: buildDeck,
    options: [
      { section: 'Size' },
      num('width', 'Width (along house)', 6, 40, 1, 16, 'ft'),
      num('depth', 'Depth (out from house)', 6, 24, 1, 12, 'ft'),
      num('height', 'Height to top of deck', 12, 120, 1, 36, 'in'),
      { section: 'Structure' },
      sel('attachment', 'Support', [['ledger', 'Attached to house (ledger)'], ['free', 'Freestanding']], 'ledger'),
      sel('joistSpacing', 'Joist spacing', [['12', '12" on center'], ['16', '16" on center'], ['24', '24" on center']], '16'),
      { section: 'Finishes' },
      sel('decking', 'Decking', [['pt', 'Pressure-treated pine'], ['cedar', 'Cedar'], ['composite', 'Composite']], 'pt'),
      tog('railing', 'Railing', true),
      tog('stairs', 'Stairs', true),
      num('stairWidth', 'Stair width', 36, 72, 6, 48, 'in'),
    ],
  },
  pergola: {
    label: 'Pergola', blurb: 'Posts, doubled beams, rafters and shade slats.', build: buildPergola,
    options: [
      { section: 'Size' },
      num('width', 'Width', 8, 24, 1, 12, 'ft'),
      num('depth', 'Depth', 8, 24, 1, 12, 'ft'),
      num('height', 'Clear height', 7, 12, 1, 8, 'ft'),
      { section: 'Structure' },
      sel('footing', 'Post support', [['footing', 'Concrete footings'], ['slab', 'Bolted to existing slab']], 'footing'),
      sel('rafterSpacing', 'Rafter spacing', [['12', '12" on center'], ['16', '16" on center'], ['24', '24" on center']], '16'),
      tog('braces', 'Knee braces', true),
      { section: 'Finishes' },
      sel('lumber', 'Lumber', [['pt', 'Pressure-treated pine'], ['cedar', 'Cedar']], 'cedar'),
      tog('slats', 'Shade slats on top', true),
    ],
  },
  playset: {
    label: 'Play structure', blurb: 'Fort, slide, swings and a CPSC-sized protective surfacing zone.', build: buildPlayset,
    options: [
      { section: 'Fort' },
      sel('fortSize', 'Fort deck size', [['4', "4' x 4'"], ['5', "5' x 5'"], ['6', "6' x 6'"]], '5'),
      sel('deckHeight', 'Deck height', [['4', "4'"], ['5', "5'"], ['6', "6'"]], '5'),
      sel('roof', 'Roof', [['wood', 'Wood gable roof'], ['canopy', 'Canopy'], ['none', 'Open']], 'wood'),
      sel('lumber', 'Lumber', [['pt', 'Pressure-treated pine'], ['cedar', 'Cedar']], 'cedar'),
      { section: 'Play components' },
      tog('slide', 'Slide', true),
      sel('climber', 'Climber', [['ladder', 'Ladder'], ['rock', 'Rock wall']], 'rock'),
      num('swings', 'Belt swings', 0, 3, 1, 2),
      sel('swingBeamHeight', 'Swing beam height', [['7', "7'"], ['8', "8'"]], '8'),
      { section: 'Safety surfacing' },
      sel('surfacing', 'Surfacing', Object.entries(SURFACING).map(([k, v]) => [k, `${v.label} (to ${v.maxFall} ft)`]), 'woodChips'),
    ],
  },
};

const NUMERIC_SELECTS = new Set(['fortSize', 'deckHeight', 'swingBeamHeight']);

export function defaults(type) {
  const o = {};
  for (const f of TYPES[type].options) if (f.key) o[f.key] = f.default;
  return o;
}

export function normalize(type, raw) {
  const o = { ...defaults(type), ...raw };
  for (const f of TYPES[type].options) {
    if (!f.key) continue;
    if (f.type === 'number') { let v = Number(o[f.key]); if (!Number.isFinite(v)) v = f.default; o[f.key] = Math.min(f.max, Math.max(f.min, v)); }
    if (f.type === 'select' && !f.choices.some(c => c[0] === String(o[f.key]))) o[f.key] = f.default;
    if (f.type === 'toggle') o[f.key] = !!o[f.key];
    if (NUMERIC_SELECTS.has(f.key)) o[f.key] = Number(o[f.key]);
  }
  return o;
}

export function generate(type, raw) {
  const opts = normalize(type, raw);
  const model = TYPES[type].build(opts);
  model.type = type; model.options = opts;
  return model;
}

// ---------- Pricing (sample defaults; every contractor sets their own) ----------
export const LUMBER_LF = { '2x2': 0.6, '1x6': 0.9, '2x4': 0.75, '2x6': 1.05, '2x8': 1.45, '2x10': 1.95, '2x12': 2.6, '4x4': 1.35, '4x6': 2.25, '6x6': 4.1, '5/4x6': 1.15, 'LVL 1-3/4x11-7/8': 9.5 };
export const ITEM_PRICES = {
  concrete: 165, rebar: 11, vapor: 0.12, anchor: 3.5, pierbags: 6.5, footbags: 6.5, postbase: 14, gravel: 55, ply: 58, hanger: 2.1,
  'siding:t111': 62, 'osb:wall': 17, 'osb:roof': 17, housewrap: 0.18, 'siding:lap': 3.4, 'siding:vinyl': 135, 'siding:metal': 2.6,
  metal: 2.4, metalscrews: 34, 'ridgecap:metal': 22, 'ridgecap': 58, shingles: 42, underlay: 115, dripedge: 9, roofnails: 72, trim: 16,
  win: 165, dbl: 520, entry: 340, oh108: 1350, oh192: 2350, nails16: 32, nails8: 30, hurricane: 1.6, ledgerlag: 2.4, flashing: 14,
  postcap: 18, footholes: 0, hidden: 48, deckscrews: 44, landing: 165, railbolt: 2.2, surfacebase: 38, beambolt: 4.5, rafterties: 1.6,
  lag: 1.1, roofboards: 9, canopy: 95, slide: 289, holds: 6, plywall: 64, abracket: 39, swing: 45, swinghanger: 16,
  'surf:woodChips': 38, 'surf:woodMulch': 34, 'surf:rubber': 420, 'surf:peaGravel': 48, 'surf:sand': 42, fabric: 0.2, border: 3.5,
};

export function estimate(model, prices = {}, settings = {}) {
  const { laborRate = 65, markup = 20, tax = 8.25, waste = 0 } = settings;
  const lf = { ...LUMBER_LF, ...(prices.lumber || {}) };
  const ip = { ...ITEM_PRICES, ...(prices.items || {}) };
  const lines = [];
  for (const r of lumberTakeoff(model)) {
    const fac = MATERIALS[r.material]?.priceFactor ?? 1;
    const unit = +(lf[r.nominal] * fac * r.stockFt).toFixed(2);
    const qty = Math.ceil(r.qty * (1 + waste / 100));
    lines.push({ category: 'Lumber', key: `lumber:${r.material}:${r.nominal}`, label: `${r.nominal} x ${r.stockFt}' ${MATERIALS[r.material]?.name ?? r.material}`, qty, unit: 'pcs', price: unit, total: +(unit * qty).toFixed(2) });
  }
  for (const it of model.items) {
    const price = ip[it.key] ?? 0;
    lines.push({ ...it, price, total: +(price * it.qty).toFixed(2) });
  }
  const materials = lines.reduce((s, l) => s + l.total, 0);
  const labor = (model.laborHours || 0) * laborRate;
  const taxAmt = materials * tax / 100;
  const sub = materials + taxAmt + labor;
  const markupAmt = sub * markup / 100;
  return { lines, materials, taxAmt, labor, laborHours: model.laborHours || 0, markupAmt, total: sub + markupAmt, settings: { laborRate, markup, tax, waste } };
}

export { cutList, lumberTakeoff, MATERIALS };
