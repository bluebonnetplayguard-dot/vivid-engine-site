import { BuildingModel } from './model';
import { OpeningData } from './schema';

// Semantic checks the schema can't express. Same rules as the studio (core/model.js checkOpening), so a model
// the browser accepts is accepted here and the other way round.

export const EDGE_CLEARANCE = 4;
export const OPENING_GAP = 4;
export const HEADER_MIN = 6;

export type Severity = 'error' | 'warning';
export interface Finding { severity: Severity; code: string; element?: string; message: string }

const wallLength = (w: { start: number[]; end: number[] }) => Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]);

export function checkOpening(m: BuildingModel, o: OpeningData): Finding[] {
  const out: Finding[] = [];
  const wall = m.wallOf(o);
  const f = (code: string, message: string): Finding => ({ severity: 'error', code, element: o.id, message: `${o.name}: ${message}` });
  if (!wall) return [f('opening.no-wall', 'the opening is not in a wall.')];
  const L = wallLength(wall);
  if (o.width < 12 || o.width > 240) out.push(f('opening.width', 'openings must be between 1 ft and 20 ft wide.'));
  if (o.height < 12) out.push(f('opening.height', 'openings must be at least 1 ft tall.'));
  if (o.kind === 'door' && o.sill !== 0) out.push(f('opening.door-sill', 'doors sit on the floor (sill 0).'));
  const left = o.offset - o.width / 2, right = o.offset + o.width / 2;
  if (left < EDGE_CLEARANCE) out.push(f('opening.start-corner', `it comes within ${EDGE_CLEARANCE}" of the wall's start corner.`));
  if (right > L - EDGE_CLEARANCE) out.push(f('opening.end-corner', `it comes within ${EDGE_CLEARANCE}" of the wall's end corner.`));
  if (o.sill + o.height > wall.height - HEADER_MIN) out.push(f('opening.header', `the top leaves less than ${HEADER_MIN}" for a header.`));
  for (const other of m.openingsInWall(wall.id)) {
    if (other.id === o.id) continue;
    const ol = other.offset - other.width / 2, or = other.offset + other.width / 2;
    if (left < or + OPENING_GAP && right > ol - OPENING_GAP) out.push(f('opening.overlap', `it overlaps or crowds ${other.name}.`));
  }
  return out;
}

export function validateBuilding(m: BuildingModel): Finding[] {
  const out: Finding[] = [];
  const err = (code: string, message: string, element?: string) => out.push({ severity: 'error', code, element, message });
  const warn = (code: string, message: string, element?: string) => out.push({ severity: 'warning', code, element, message });

  const seen = new Set<string>();
  for (const list of [m.floors, m.walls, m.openings, m.rooms, m.roofs, m.components] as { id: string }[][]) {
    for (const el of list) { if (seen.has(el.id)) err('id.duplicate', `Two elements share the id ${el.id}.`, el.id); seen.add(el.id); }
  }
  const floorIds = new Set(m.floors.map(f => f.id));
  for (const list of [m.walls, m.rooms, m.roofs, m.components] as { id: string; floor: string; name: string }[][]) {
    for (const el of list) if (!floorIds.has(el.floor)) err('floor.missing', `${el.name} is on a floor that doesn't exist (${el.floor}).`, el.id);
  }
  for (const w of m.walls) if (wallLength(w) < 1) err('wall.zero-length', `${w.name} has no length.`, w.id);
  for (const c of m.components) if (c.room && !m.find(c.room)) warn('component.room-missing', `${c.name} names a room that doesn't exist.`, c.id);
  for (const o of m.openings) out.push(...checkOpening(m, o));

  // Verified sizes need a reason: a drawing reference or a contractor's confirmation.
  for (const list of [m.walls, m.openings, m.rooms, m.roofs, m.components] as { id: string; name: string; dims?: { status: string; source?: string; ref?: unknown } }[][]) {
    for (const el of list) {
      const d = el.dims;
      if (d?.status !== 'verified') continue;
      if (d.source === 'ai-inferred' || d.source === 'sample') err('dims.verified-source', `${el.name} is marked verified but its size is ${d.source === 'sample' ? 'a sample default' : 'AI-inferred'}.`, el.id);
      if (d.source === 'blueprint' && !d.ref) err('dims.verified-ref', `${el.name} is marked verified from a blueprint but names no drawing.`, el.id);
    }
  }

  // Structure warnings: things that are allowed but usually mean the model is incomplete.
  for (const f of m.floors) {
    const ext = m.exteriorWalls(f.id);
    if (!ext.length && m.wallsOnFloor(f.id).length) warn('floor.no-exterior', `${f.name} has walls but no exterior walls.`, f.id);
    if (ext.length && !isClosedLoop(ext)) warn('floor.open-outline', `${f.name}'s exterior walls don't form a closed outline.`, f.id);
  }
  for (const r of m.rooms) if (!m.wallsOfRoom(r.id).length) warn('room.no-walls', `${r.name} isn't bounded by any wall.`, r.id);
  return out;
}

// Each exterior wall's end meets another's start (within 1").
function isClosedLoop(walls: { start: number[]; end: number[] }[]): boolean {
  const near = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= 1;
  return walls.every(w => walls.some(o => o !== w && near(w.end, o.start)));
}

export const errorsOnly = (fs: Finding[]) => fs.filter(f => f.severity === 'error');
