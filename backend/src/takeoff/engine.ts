import { BuildingModel } from '../building-model';
import { GeometryReader, GeometryReading, OpeningReading, toFt, toSqFt } from '../geometry-reader';
import { CABINETS, COUNTERTOPS, FLOORING, INTERIOR, ROOFING, SIDING } from './materials';
import {
  calculateConcreteVolume, calculateDrywallSheets, calculateFloorArea, calculateLumberCounts, calculatePaintGallons,
  calculateRoofArea, calculateWallArea, q, sum,
} from './quantities';
import { DEFAULT_SETTINGS, Quantity, TakeoffCategory, TakeoffFlag, TakeoffLine, TakeoffResult, TakeoffSettings, TakeoffUnit } from './types';

// Structured model -> material takeoff. Pure and deterministic: the same model and settings always give the same
// lines in the same order, so results can be cached by a hash of their inputs.

const CATEGORY_ORDER: TakeoffCategory[] = ['concrete', 'framing', 'sheathing', 'insulation', 'exterior', 'roofing', 'openings', 'drywall', 'paint', 'trim', 'flooring', 'cabinets', 'countertops'];
const WHOLE: TakeoffUnit[] = ['ea', 'sheets', 'gal', 'bundles', 'rolls', 'pcs', 'bags'];
const roundTo = (v: number, step: number) => Math.ceil(v / step - 1e-9) * step;
const fmt = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

class Lines {
  private readonly map = new Map<string, TakeoffLine>();
  constructor(private readonly settings: TakeoffSettings) {}

  add(key: string, category: TakeoffCategory, item: string, unit: TakeoffUnit, qty: Quantity, basis: string, opts: { material?: string | null; wastePct?: number } = {}) {
    if (!(qty.value > 0)) return;
    const prev = this.map.get(key);
    if (prev) {
      const merged = sum([{ value: prev.quantity, verified: prev.verified, source: prev.source, from: prev.from }, qty]);
      Object.assign(prev, { quantity: merged.value, verified: merged.verified, source: merged.source, from: merged.from });
      return;
    }
    this.map.set(key, { key, category, item, material: opts.material ?? null, unit, quantity: qty.value, wastePct: opts.wastePct ?? this.settings.waste[category],
      order: 0, basis, verified: qty.verified, source: qty.source, from: qty.from });
  }

  done(): TakeoffLine[] {
    const order = CATEGORY_ORDER;
    return [...this.map.values()].sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category)).map(l => {
      const gross = l.quantity * (1 + l.wastePct / 100);
      const order = WHOLE.includes(l.unit) ? Math.ceil(gross - 1e-9) : l.unit === 'cu yd' ? roundTo(gross, 0.25) : l.unit === 'squares' ? roundTo(gross, 1 / 3) : Math.ceil(gross - 1e-9);
      return { ...l, quantity: fmt(l.quantity), order: fmt(order) };
    });
  }
}

export function buildTakeoff(model: BuildingModel, settings: TakeoffSettings = DEFAULT_SETTINGS, geometry: GeometryReading = GeometryReader.read(model)): TakeoffResult {
  const g = geometry, s = settings;
  const L = new Lines(s);
  const flags: TakeoffFlag[] = [];
  const opening = new Map(g.openings.map(o => [o.id, o]));

  // ---------- concrete ----------
  for (const c of g.components) {
    if (c.kind !== 'slab' && c.kind !== 'patio') continue;
    L.add(`concrete.${c.kind}`, 'concrete', c.kind === 'slab' ? 'Concrete, foundation slab' : 'Concrete, patio slab', 'cu yd', calculateConcreteVolume(c),
      `slab ${fmt(toFt(c.width.value))}' × ${fmt(toFt(c.depth.value))}' × ${fmt(c.height.value)}" thick`);
  }

  // ---------- framing ----------
  for (const w of g.walls) {
    const ops = w.openings.map(id => opening.get(id)!).filter(Boolean).map(o => ({ width: o.width.value, sill: o.sill.value, kind: o.kind }));
    const floor = model.floor(w.floor);
    const framed = floor && w.exterior ? Math.min(w.height.value, floor.wallHeight - floor.framing) : w.height.value;
    const lc = calculateLumberCounts(w, ops, s, framed);
    L.add(`framing.studs-${lc.size}-${lc.studLengthFt}`, 'framing', `Studs ${lc.size}, ${lc.studLengthFt}' (cut length)`, 'ea', lc.studs,
      `${s.studSpacingIn}" on center, plus 2 king + 2 jack studs per opening and corner backing`);
    L.add(`framing.plates-${lc.size}`, 'framing', `Plates ${lc.size}, ${s.plateStockFt}' stock`, 'pcs', lc.plates, 'bottom plate + double top plate along every wall');
    L.add(`framing.headers-${lc.size}`, 'framing', `Header stock, 2-ply (${lc.size === '2x6' ? '2x10' : '2x8'})`, 'lf', lc.headerLf, 'opening width + 3" bearing, two plies');
    L.add(`framing.cripples-${lc.size}`, 'framing', `Cripple studs ${lc.size}`, 'ea', lc.cripples, 'above headers and below window sills');
  }
  for (const c of g.components.filter(c => c.kind === 'floor-deck')) {
    L.add('framing.subfloor', 'framing', '3/4" T&G subfloor sheets (4\'×8\')', 'sheets', q(Math.ceil(toSqFt(c.topArea.value) / 32), c.topArea), 'floor deck area ÷ 32 sq ft');
  }

  // ---------- sheathing, wrap, insulation ----------
  const extWalls = g.walls.filter(w => w.exterior);
  const extFace = sum(extWalls.map(w => calculateWallArea(w, 'exterior')));
  // Gable ends: triangles above the top floor's side walls, under each gable roof.
  const gables: { wallId: string; area: Quantity }[] = [];
  for (const r of g.roofs) {
    const sideFaces = r.ridgeLength ? extWalls.filter(w => w.floor === r.floor && (w.face === 'left' || w.face === 'right')) : [];
    for (const w of sideFaces) gables.push({ wallId: w.id, area: q(toSqFt(0.5 * w.outsideLength.value * r.rise.value), w.outsideLength, r.rise) });
  }
  const gableArea = sum(gables.map(x => x.area));
  const wallSheathing = sum([extFace, gableArea]);
  L.add('sheathing.walls', 'sheathing', '7/16" OSB wall sheathing (4\'×8\')', 'sheets', { ...wallSheathing, value: Math.ceil(wallSheathing.value / s.sheathingSheetSqFt) }, 'exterior wall faces + gable ends ÷ 32 sq ft');
  L.add('exterior.house-wrap', 'exterior', 'House wrap (9\'×150\' roll)', 'rolls', { ...wallSheathing, value: Math.ceil(wallSheathing.value / s.houseWrapRollSqFt) }, 'exterior wall faces + gable ends');
  L.add('insulation.walls', 'insulation', 'Wall insulation batts (R-21 in 2x6, R-13 in 2x4)', 'sq ft', sum(extWalls.map(w => calculateWallArea(w, 'interior'))), 'inside face of exterior walls, net of openings');
  const top = model.floorsByLevel().at(-1);
  const topFloor = top && g.floors.find(f => f.id === top.id);
  if (topFloor) L.add('insulation.attic', 'insulation', 'Attic insulation, blown (R-38)', 'sq ft', q(toSqFt(topFloor.footprintArea.value), topFloor.footprintArea), 'top floor footprint');

  // ---------- siding and exterior paint ----------
  const byFinish = new Map<string, Quantity[]>();
  for (const w of extWalls) {
    const finish = model.walls.find(x => x.id === w.id)!.finishExterior;
    const parts = [calculateWallArea(w, 'exterior'), ...gables.filter(x => x.wallId === w.id).map(x => x.area)];
    byFinish.set(finish, [...(byFinish.get(finish) ?? []), ...parts]);
  }
  const paintable: Quantity[] = [];
  for (const [finish, parts] of byFinish) {
    const area = sum(parts);
    const rule = SIDING[finish];
    if (!rule) { flags.push({ severity: 'warning', message: `No takeoff rule for exterior finish “${finish}”; its ${fmt(area.value, 0)} sq ft are not counted.` }); continue; }
    L.add(`exterior.siding.${finish}`, 'exterior', rule.item, rule.unit, { ...area, value: area.value * rule.perSqFt }, rule.basis, { material: finish });
    if (rule.paintable) paintable.push(area);
  }
  if (paintable.length) {
    const area = sum(paintable);
    L.add('paint.exterior', 'paint', 'Exterior paint (2 coats)', 'gal', calculatePaintGallons(area, 2, s.exteriorPaintCoverageSqFt), `paintable siding area × 2 coats ÷ ${s.exteriorPaintCoverageSqFt} sq ft/gal`);
  }

  // ---------- roofing ----------
  for (const r of g.roofs) {
    const area = calculateRoofArea(r);
    const roofEl = model.roofs.find(x => x.id === r.id)!;
    const rule = ROOFING[roofEl.material];
    const squares = area.value / 100;
    if (rule?.unit === 'bundles') L.add(`roofing.${roofEl.material}`, 'roofing', rule.item, 'bundles', { ...area, value: squares * (s.bundlesPerSquare[roofEl.material] ?? 3) }, `${fmt(squares)} squares × ${s.bundlesPerSquare[roofEl.material] ?? 3} bundles per square`, { material: roofEl.material });
    else if (rule?.unit === 'squares') L.add(`roofing.${roofEl.material}`, 'roofing', rule.item, 'squares', { ...area, value: squares }, rule.basis, { material: roofEl.material });
    else if (rule) L.add(`roofing.${roofEl.material}`, 'roofing', rule.item, 'sq ft', area, rule.basis, { material: roofEl.material });
    else flags.push({ severity: 'warning', message: `No takeoff rule for roofing “${roofEl.material}”.` });
    L.add('sheathing.roof', 'sheathing', '7/16" OSB roof sheathing (4\'×8\')', 'sheets', { ...area, value: Math.ceil(area.value / s.sheathingSheetSqFt) }, 'roof surface ÷ 32 sq ft');
    L.add('roofing.underlayment', 'roofing', 'Synthetic roof underlayment', 'rolls', { ...area, value: Math.ceil(squares / s.underlaymentSquaresPerRoll) }, `${s.underlaymentSquaresPerRoll} squares per roll`);
    const edge = q(toFt(r.eaveLength.value + r.rakeLength.value), r.eaveLength, r.rakeLength);
    L.add('roofing.drip-edge', 'roofing', `Drip edge (${s.dripEdgePieceFt}' pieces)`, 'pcs', { ...edge, value: Math.ceil(edge.value / s.dripEdgePieceFt) }, 'eaves + rakes');
    L.add('roofing.starter', 'roofing', 'Starter strip', 'lf', q(toFt(r.eaveLength.value), r.eaveLength), 'both eaves');
    L.add('roofing.ridge-cap', 'roofing', 'Ridge cap', 'lf', q(toFt(r.ridgeLength.value), r.ridgeLength), 'ridge length with overhangs');
  }
  for (const c of g.components.filter(c => c.kind === 'patio-roof')) {
    const mat = model.components.find(x => x.id === c.id)!.material;
    const rule = ROOFING[mat];
    L.add(`roofing.patio.${mat}`, 'roofing', `${rule?.item ?? mat}, patio cover`, 'sq ft', q(toSqFt(c.topArea.value), c.topArea), 'patio roof surface', { material: mat });
  }
  const posts = g.components.filter(c => c.kind === 'patio-post');
  if (posts.length) {
    const vertical = posts.filter(p => p.height.value > p.width.value);
    if (vertical.length) L.add('framing.patio-posts', 'framing', 'Patio posts, 6x6 treated', 'ea', q(vertical.length, ...vertical.map(p => p.height)), 'one per post');
    const beams = posts.filter(p => p.height.value <= p.width.value);
    if (beams.length) L.add('framing.patio-beam', 'framing', 'Patio beam, built-up', 'lf', sum(beams.map(b => q(toFt(b.width.value), b.width))), 'beam length');
  }

  // ---------- windows and doors ----------
  for (const o of g.openings) {
    const el = model.openings.find(x => x.id === o.id)!;
    const size = `${fmt(toFt(o.width.value))}'×${fmt(toFt(o.height.value))}'`;
    const one = q(1, o.width, o.height);
    if (o.kind === 'window') L.add(`openings.window.${o.width.value}x${o.height.value}.${el.frame}`, 'openings', `Window ${size} (${el.frame.replace('-frame', '')} frame)`, 'ea', one, 'one per window opening', { material: el.frame });
    else if (el.kind === 'door' && el.door) L.add(`openings.door.${o.exterior ? 'ext' : 'int'}.${el.door}.${o.width.value}x${o.height.value}`, 'openings', `${o.exterior ? 'Exterior' : 'Interior'} door ${size} (${el.door.replace('-door', '')}), pre-hung`, 'ea', one, 'one per door opening', { material: el.door });
    else L.add(`openings.cased.${o.width.value}x${o.height.value}`, 'openings', `Cased opening ${size} (jamb kit)`, 'ea', one, 'one per cased opening');
  }

  // ---------- drywall and paint ----------
  const roomWalls = sum(g.rooms.map(r => q(toSqFt(r.wallSurfaceNet.value), r.wallSurfaceNet)));
  const ceilings = sum(g.rooms.map(r => calculateFloorArea(r)));
  L.add('drywall.walls', 'drywall', `1/2" drywall, walls (${sheetName(s)})`, 'sheets', calculateDrywallSheets(roomWalls, s), `room wall surfaces net of openings ÷ ${s.drywallSheetSqFt} sq ft`);
  L.add('drywall.ceilings', 'drywall', `5/8" drywall, ceilings (${sheetName(s)})`, 'sheets', calculateDrywallSheets(ceilings, s), `room ceilings ÷ ${s.drywallSheetSqFt} sq ft`);
  L.add('drywall.finish', 'drywall', 'Joint compound and tape', 'sq ft', sum([roomWalls, ceilings]), 'finished drywall area');
  const paintedWalls = roomWalls;
  L.add('paint.walls', 'paint', `Interior wall paint (${s.paintCoats} coats)`, 'gal', calculatePaintGallons(paintedWalls, s.paintCoats, s.paintCoverageSqFt), `wall area × ${s.paintCoats} coats ÷ ${s.paintCoverageSqFt} sq ft/gal`);
  L.add('paint.ceilings', 'paint', `Ceiling paint (${s.paintCoats} coats)`, 'gal', calculatePaintGallons(ceilings, s.paintCoats, s.paintCoverageSqFt), `ceiling area × ${s.paintCoats} coats ÷ ${s.paintCoverageSqFt} sq ft/gal`);
  L.add('paint.primer', 'paint', 'Drywall primer (1 coat)', 'gal', calculatePaintGallons(sum([paintedWalls, ceilings]), 1, s.primerCoverageSqFt), `walls + ceilings ÷ ${s.primerCoverageSqFt} sq ft/gal`);
  for (const w of model.walls.filter(w => w.finishInterior !== 'drywall' && INTERIOR[w.finishInterior])) {
    flags.push({ severity: 'info', message: `${w.name} has ${INTERIOR[w.finishInterior].item.toLowerCase()} inside; it is counted as drywall area here.` });
  }

  // ---------- trim ----------
  const extOps = g.openings.filter(o => o.exterior);
  L.add('trim.exterior-casing', 'trim', 'Exterior window and door trim', 'lf', sum(extOps.map(o => q(toFt(o.trimPerimeter.value), o.trimPerimeter))), 'trim perimeter of every exterior opening');
  const intCasing = g.openings.map(o => q(toFt(o.trimPerimeter.value) * (o.exterior ? 1 : 2), o.trimPerimeter));
  L.add('trim.interior-casing', 'trim', 'Interior casing', 'lf', sum(intCasing), 'inside of exterior openings; both sides of interior openings');
  for (const r of g.rooms) {
    const floorOpenings = r.openings.map(id => opening.get(id)!).filter((o): o is OpeningReading => !!o && o.sill.value === 0);
    const lf = Math.max(0, toFt(r.perimeter.value - floorOpenings.reduce((s2, o) => s2 + o.width.value, 0)));
    L.add('trim.baseboard', 'trim', 'Baseboard', 'lf', q(lf, r.perimeter, ...floorOpenings.map(o => o.width)), 'room perimeters less door and cased openings');
  }

  // ---------- flooring ----------
  for (const r of g.rooms) {
    const rule = FLOORING[r.floorFinish];
    const area = calculateFloorArea(r);
    if (!rule) { flags.push({ severity: 'warning', message: `${r.name}: no takeoff rule for flooring “${r.floorFinish}”.` }); continue; }
    L.add(`flooring.${r.floorFinish}`, 'flooring', rule.item, rule.unit, { ...area, value: area.value * rule.perSqFt }, rule.basis, { material: r.floorFinish, wastePct: rule.wastePct });
  }

  // ---------- cabinets and countertops ----------
  for (const c of g.components.filter(c => c.kind === 'cabinet')) {
    const el = model.components.find(x => x.id === c.id)!;
    const center = el.box.c[2];
    const kind = center - c.height.value / 2 >= 40 ? 'upper' : /island/i.test(c.name) ? 'island' : 'base';
    L.add(`cabinets.${kind}.${el.material}`, 'cabinets', `${CABINETS[el.material] ?? el.material}, ${kind}`, 'lf', q(toFt(c.frontLength.value), c.frontLength), 'cabinet run length', { material: el.material });
  }
  for (const c of g.components.filter(c => c.kind === 'countertop')) {
    const el = model.components.find(x => x.id === c.id)!;
    L.add(`countertops.${el.material}`, 'countertops', COUNTERTOPS[el.material] ?? el.material, 'sq ft', q(toSqFt(c.topArea.value), c.topArea), 'countertop top area', { material: el.material });
  }

  const lines = L.done();

  // ---------- flags ----------
  const unverified = lines.filter(l => !l.verified);
  if (g.model.source === 'sample') flags.unshift({ severity: 'warning', message: 'This takeoff is from the sample model. Its sizes are conceptual defaults, not from your drawings.' });
  else if (unverified.length) flags.unshift({ severity: 'warning', message: `${unverified.length} of ${lines.length} lines rest on sizes that aren't verified against drawings or field measurements.`, lines: unverified.map(l => l.key) });
  for (const w of g.warnings) flags.push({ severity: 'warning', message: w });

  return {
    engine: 'gc-takeoff/1',
    model: g.model,
    computedAt: new Date().toISOString(),
    settings: s,
    lines,
    summary: {
      floorArea: fmt(toSqFt(g.building.totalRoomArea.value)),
      exteriorWallArea: fmt(extFace.value),
      roofArea: fmt(g.roofs.reduce((t, r) => t + toSqFt(r.surfaceArea.value), 0)),
      lineCount: lines.length,
      verifiedLines: lines.length - unverified.length,
    },
    flags,
    assumptions: [
      'Quantities come from the model’s centerline geometry; check them before ordering.',
      'Framing counts studs, plates, headers and cripples for walls only; floor and roof framing (joists, rafters, trusses) are not included yet.',
      'Foundation concrete is the slab only; footings, rebar and vapor barrier are not included.',
      'Wall drywall counts each room’s side of every wall; garages, closets and soffits are not modeled.',
      'Plumbing, electrical, HVAC, fixtures and appliances are not part of the material takeoff.',
      `Waste factors: ${Object.entries(s.waste).filter(([, v]) => v).map(([k, v]) => `${k} ${v}%`).join(', ')}; tile flooring 15%.`,
    ],
  };
}

const sheetName = (s: TakeoffSettings) => (s.drywallSheetSqFt === 48 ? "4'×12'" : s.drywallSheetSqFt === 32 ? "4'×8'" : `${s.drywallSheetSqFt} sq ft`);

// Settings from untrusted input: unknown keys dropped, numbers clamped to sane ranges.
export function cleanSettings(input: unknown): TakeoffSettings {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, any>;
  const n = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const d = DEFAULT_SETTINGS;
  const waste = { ...d.waste };
  if (i.waste && typeof i.waste === 'object') for (const k of Object.keys(waste) as TakeoffCategory[]) waste[k] = n(i.waste[k], 0, 50, waste[k]);
  return {
    drywallSheetSqFt: [32, 40, 48, 54].includes(i.drywallSheetSqFt) ? i.drywallSheetSqFt : d.drywallSheetSqFt,
    paintCoats: n(i.paintCoats, 1, 4, d.paintCoats),
    paintCoverageSqFt: n(i.paintCoverageSqFt, 150, 500, d.paintCoverageSqFt),
    primerCoverageSqFt: n(i.primerCoverageSqFt, 150, 500, d.primerCoverageSqFt),
    exteriorPaintCoverageSqFt: n(i.exteriorPaintCoverageSqFt, 100, 450, d.exteriorPaintCoverageSqFt),
    studSpacingIn: [12, 16, 19.2, 24].includes(i.studSpacingIn) ? i.studSpacingIn : d.studSpacingIn,
    plateStockFt: [8, 10, 12, 14, 16, 20].includes(i.plateStockFt) ? i.plateStockFt : d.plateStockFt,
    sheathingSheetSqFt: [32, 36, 40].includes(i.sheathingSheetSqFt) ? i.sheathingSheetSqFt : d.sheathingSheetSqFt,
    houseWrapRollSqFt: n(i.houseWrapRollSqFt, 100, 2000, d.houseWrapRollSqFt),
    underlaymentSquaresPerRoll: n(i.underlaymentSquaresPerRoll, 2, 20, d.underlaymentSquaresPerRoll),
    bundlesPerSquare: { ...d.bundlesPerSquare, ...Object.fromEntries(Object.entries(i.bundlesPerSquare ?? {}).filter(([k]) => k in d.bundlesPerSquare).map(([k, v]) => [k, n(v, 2, 6, d.bundlesPerSquare[k])])) },
    dripEdgePieceFt: [10, 12].includes(i.dripEdgePieceFt) ? i.dripEdgePieceFt : d.dripEdgePieceFt,
    concreteBagCuFt: n(i.concreteBagCuFt, 0.3, 1, d.concreteBagCuFt),
    waste,
  };
}
