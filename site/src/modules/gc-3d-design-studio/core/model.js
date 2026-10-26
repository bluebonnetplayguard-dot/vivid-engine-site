// The structured GC building model. This is the source of truth for editing, measurements and later
// takeoffs: the 3D meshes are always rebuilt from it, never the other way round.
//
// Frame: inches. x = east (building width), y = north (building depth), z = up. The front of the
// building faces -y. Exterior walls run counter-clockwise seen from above, so for every exterior wall
// "start" is on the left of someone standing outside looking at it.
//
// {
//   schema: 'gc-building/1', id, name,
//   meta: { source: 'sample' | 'blueprint' | 'manual', notice },
//   floors:   [{ id, name, level, elevation, wallHeight, framing }],
//   walls:    [{ id, floor, name, start:[x,y], end:[x,y], height, thickness, exterior, face, finishExterior, finishInterior, colorExterior?, colorInterior?, dims }],
//   openings: [{ id, kind:'window'|'door', wall, name, offset, width, height, sill, frame, frameColor?, door?, doorColor?, dims }],
//   rooms:    [{ id, floor, name, type, polygon:[[x,y]...], floorFinish, floorColor? }],
//   roofs:    [{ id, kind:'gable', floor, name, axis:'x', pitch, overhang, thickness, material, color? , dims }],
//   components: [{ id, kind, floor, room?, name, box:{ c:[x,y,z], s:[w,d,h] }, material, color?, group?, dims }],
// }
//
// dims.status is 'verified' only when a person has checked the size against construction documents
// (dims.ref says which sheet). Everything else is 'conceptual' and the UI labels it that way.

export const SCHEMA = 'gc-building/1';
export const EDGE_CLEARANCE = 4;     // min inches from an opening to a wall end
export const OPENING_GAP = 4;        // min inches between two openings in one wall
export const HEADER_MIN = 6;         // min inches from the top of an opening to the top of the wall

export const clone = v => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

const COLLECTIONS = ['walls', 'openings', 'rooms', 'roofs', 'components', 'floors'];
export const KIND_OF = { walls: 'wall', openings: 'opening', rooms: 'room', roofs: 'roof', components: 'component', floors: 'floor' };

export function findElement(model, id) {
  for (const c of COLLECTIONS) {
    const el = model[c]?.find(e => e.id === id);
    if (el) return { el, collection: c, kind: KIND_OF[c] };
  }
  return null;
}

export function allElements(model) {
  const out = [];
  for (const c of COLLECTIONS) for (const el of model[c] || []) out.push({ el, collection: c, kind: KIND_OF[c] });
  return out;
}

export const floorById = (model, id) => model.floors.find(f => f.id === id);

export function wallFrame(wall) {
  const [x0, y0] = wall.start, [x1, y1] = wall.end;
  const dx = x1 - x0, dy = y1 - y0;
  const length = Math.hypot(dx, dy);
  const dir = [dx / length, dy / length];
  const normal = [dir[1], -dir[0]];     // outward for counter-clockwise exterior walls
  return { length, dir, normal, origin: [x0, y0] };
}

export const wallLength = wall => wallFrame(wall).length;

export function openingsOn(model, wallId) {
  return model.openings.filter(o => o.wall === wallId).sort((a, b) => a.offset - b.offset);
}

export function polygonArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
    a += x0 * y1 - x1 * y0;
  }
  return Math.abs(a) / 2;
}

export function polygonBounds(pts) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

// Footprint of the exterior walls' centrelines (the building outline used for the roof).
export function footprint(model, floorId) {
  const ext = model.walls.filter(w => w.exterior && (!floorId || w.floor === floorId));
  const pts = ext.flatMap(w => [w.start, w.end]);
  return polygonBounds(pts);
}

export function roofGeometry(model, roof) {
  const fp = footprint(model, roof.floor);
  const fl = floorById(model, roof.floor);
  const base = fl.elevation + fl.wallHeight;
  const along = roof.axis === 'y' ? 'y' : 'x';
  const span = along === 'x' ? fp.maxY - fp.minY : fp.maxX - fp.minX;
  const run = span / 2;
  const rise = run * roof.pitch / 12;
  const angle = Math.atan2(rise, run);
  const ridgeLen = (along === 'x' ? fp.maxX - fp.minX : fp.maxY - fp.minY) + 2 * roof.overhang;
  const slopeLen = (run + roof.overhang) / Math.cos(angle);
  return { fp, base, along, span, run, rise, angle, ridgeLen, slopeLen, ridgeZ: base + rise, area: 2 * ridgeLen * slopeLen };
}

// Everything the properties panel can show about an element. Lengths in inches, areas in square inches.
export function measure(model, id) {
  const hit = findElement(model, id);
  if (!hit) return null;
  const { el, kind } = hit;
  const status = el.dims?.status || 'conceptual';
  if (kind === 'wall') {
    const L = wallLength(el);
    const ops = openingsOn(model, el.id);
    const openingArea = ops.reduce((s, o) => s + o.width * o.height, 0);
    return { kind, status, rows: [
      ['Length (centerline)', L, 'len'], ['Height', el.height, 'len'], ['Thickness', el.thickness, 'len'],
      ['Gross wall area', L * el.height, 'area'], ['Openings', openingArea, 'area'], ['Net wall area', L * el.height - openingArea, 'area'],
      ['Openings in wall', ops.length, 'count'],
    ] };
  }
  if (kind === 'opening') {
    const wall = model.walls.find(w => w.id === el.wall);
    const L = wall ? wallLength(wall) : 0;
    return { kind, status, rows: [
      ['Width', el.width, 'len'], ['Height', el.height, 'len'], ['Sill height', el.sill, 'len'], ['Head height', el.sill + el.height, 'len'],
      ['From wall start (left edge)', el.offset - el.width / 2, 'len'], ['From wall end (right edge)', L - el.offset - el.width / 2, 'len'],
      ['Rough opening area', el.width * el.height, 'area'],
    ] };
  }
  if (kind === 'room') {
    const b = polygonBounds(el.polygon);
    return { kind, status, rows: [
      ['Width (x)', b.maxX - b.minX, 'len'], ['Depth (y)', b.maxY - b.minY, 'len'], ['Floor area', polygonArea(el.polygon), 'area'],
      ['Ceiling height', floorById(model, el.floor)?.wallHeight ?? 0, 'len'],
    ] };
  }
  if (kind === 'roof') {
    const g = roofGeometry(model, el);
    return { kind, status, rows: [
      ['Pitch', `${el.pitch}:12`, 'text'], ['Overhang', el.overhang, 'len'], ['Rise', g.rise, 'len'], ['Ridge height above grade', g.ridgeZ + el.thickness, 'len'],
      ['Ridge length', g.ridgeLen, 'len'], ['Rafter length (with overhang)', g.slopeLen, 'len'], ['Roof surface area', g.area, 'area'],
    ] };
  }
  if (kind === 'component') {
    const [w, d, h] = el.box.s;
    return { kind, status, rows: [['Width', w, 'len'], ['Depth', d, 'len'], ['Height', h, 'len'], ['Top surface area', w * d, 'area']] };
  }
  return { kind, status, rows: [] };
}

export function buildingSummary(model) {
  const rooms = model.rooms;
  const area = rooms.reduce((s, r) => s + polygonArea(r.polygon), 0);
  const roof = model.roofs[0];
  const height = roof ? roofGeometry(model, roof).ridgeZ + roof.thickness : Math.max(...model.floors.map(f => f.elevation + f.wallHeight));
  const fp = footprint(model);
  return { floors: model.floors.length, roomArea: area, height, width: fp.maxX - fp.minX, depth: fp.maxY - fp.minY,
    windows: model.openings.filter(o => o.kind === 'window').length, doors: model.openings.filter(o => o.kind === 'door').length };
}

// Checks one opening against its wall and neighbours. Returns a list of plain-language problems.
export function checkOpening(model, opening) {
  const problems = [];
  const wall = model.walls.find(w => w.id === opening.wall);
  if (!wall) return ['The opening is not in a wall.'];
  const L = wallLength(wall);
  if (!(opening.width >= 12 && opening.width <= 240)) problems.push('Openings must be between 1 ft and 20 ft wide.');
  if (!(opening.height >= 12)) problems.push('Openings must be at least 1 ft tall.');
  if (opening.sill < 0) problems.push('The sill can’t be below the floor.');
  if (opening.kind === 'door' && opening.sill !== 0) problems.push('Doors sit on the floor (sill 0).');
  const left = opening.offset - opening.width / 2, right = opening.offset + opening.width / 2;
  if (left < EDGE_CLEARANCE) problems.push(`It would come within ${EDGE_CLEARANCE}" of the wall’s start corner.`);
  if (right > L - EDGE_CLEARANCE) problems.push(`It would come within ${EDGE_CLEARANCE}" of the wall’s end corner.`);
  if (opening.sill + opening.height > wall.height - HEADER_MIN) problems.push(`The top would leave less than ${HEADER_MIN}" for a header.`);
  for (const o of model.openings) {
    if (o.id === opening.id || o.wall !== opening.wall) continue;
    const ol = o.offset - o.width / 2, or = o.offset + o.width / 2;
    if (left < or + OPENING_GAP && right > ol - OPENING_GAP) problems.push(`It would overlap or crowd ${o.name}.`);
  }
  return problems;
}

export function validateModel(model) {
  const problems = [];
  if (model?.schema !== SCHEMA) problems.push('Unknown model format.');
  const ids = new Set();
  for (const { el } of allElements(model)) {
    if (ids.has(el.id)) problems.push(`Duplicate id ${el.id}.`);
    ids.add(el.id);
  }
  for (const w of model.walls) if (!(wallLength(w) > 0)) problems.push(`${w.name} has no length.`);
  for (const o of model.openings) for (const p of checkOpening(model, o)) problems.push(`${o.name}: ${p}`);
  return problems;
}

let seq = 0;
export const newId = prefix => `${prefix}-${Date.now().toString(36)}${(++seq).toString(36)}`;
