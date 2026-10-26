import { Line3, ShapeUtils, Vector2, Vector3 } from 'three';
import { BuildingModel, DimensionSource, OpeningData, RoofData, RoomData, WallData } from '../building-model';
import {
  ComponentReading, FloorReading, GeometryReading, Measured, OpeningReading, RoofReading, RoomReading, Unit, WallReading,
} from './types';

// Reads a structured building model into measured geometry: lengths, heights, areas and volumes for every
// wall, opening, room, roof, component and floor. Pure: no database, no I/O. Uses three.js math (Vector2/3,
// Line3, ShapeUtils) so the numbers match what the 3D viewer draws.
//
// Conventions (same as the studio): inches; x east, y north, z up; wall start/end are centerline points;
// exterior walls run counter-clockwise; an opening's offset is wall start → opening center.

const RANK: Record<DimensionSource, number> = { sample: 0, 'ai-inferred': 1, contractor: 2, blueprint: 3 };
const ON_EDGE = 1;        // inches: an opening center this close to a room edge belongs to that room side
const CLOSE = 1;          // inches: wall ends this close count as joined

export class GeometryReader {
  private readonly warnings: string[] = [];
  private readonly prov = new Map<string, ReturnType<BuildingModel['provenance']>>();

  constructor(private readonly m: BuildingModel) {}

  static read(model: BuildingModel): GeometryReading { return new GeometryReader(model).read(); }

  // A measured value computed from the listed elements: verified only if all are, source = the weakest.
  private q(value: number, unit: Unit, from: string[]): Measured {
    const ps = from.map(id => { if (!this.prov.has(id)) this.prov.set(id, this.m.provenance(id)); return this.prov.get(id); }).filter(Boolean) as NonNullable<ReturnType<BuildingModel['provenance']>>[];
    const weakest = ps.reduce<DimensionSource>((w, p) => (RANK[p.source] < RANK[w] ? p.source : w), ps[0]?.source ?? 'sample');
    const refs = [...new Set(ps.map(p => JSON.stringify(p.ref ?? null)).filter(r => r !== 'null'))];
    const out: Measured = { value: round(value), unit, verified: ps.length > 0 && ps.every(p => p.verified), source: weakest, from: [...new Set(from)] };
    if (refs.length === 1) out.ref = JSON.parse(refs[0]);
    return out;
  }

  read(): GeometryReading {
    const m = this.m;
    const walls = m.walls.map(w => this.wall(w));
    const openings = m.openings.map(o => this.opening(o)).filter((o): o is OpeningReading => !!o);
    const rooms = m.rooms.map(r => this.room(r));
    const roofs = m.roofs.map(r => this.roof(r)).filter((r): r is RoofReading => !!r);
    const components = m.components.map(c => this.component(c.id));
    const floors = m.floorsByLevel().map(f => this.floor(f.id, rooms, walls));

    const ext = m.exteriorWalls();
    const xs = ext.flatMap(w => [w.start[0], w.end[0]]), ys = ext.flatMap(w => [w.start[1], w.end[1]]);
    const extIds = ext.map(w => w.id);
    const topFloor = m.floorsByLevel().at(-1)!;
    const height = roofs.length
      ? this.q(Math.max(...roofs.map(r => r.ridgeHeight.value)), 'in', roofs.flatMap(r => r.ridgeHeight.from))
      : this.q(topFloor.elevation + topFloor.wallHeight, 'in', m.wallsOnFloor(topFloor.id).map(w => w.id));

    const unverified = [...m.walls, ...m.openings, ...m.rooms, ...m.roofs, ...m.components]
      .map(el => ({ el, p: m.provenance(el.id)! }))
      .filter(({ p }) => !p.verified)
      .map(({ el, p }) => ({ id: el.id, name: el.name, source: p.source }));

    return {
      model: { id: m.data.id, name: m.data.name, source: m.data.meta.source },
      floors, walls, openings, rooms, roofs, components,
      building: {
        floors: m.floors.length,
        footprintWidth: this.q(xs.length ? Math.max(...xs) - Math.min(...xs) : 0, 'in', extIds),
        footprintDepth: this.q(ys.length ? Math.max(...ys) - Math.min(...ys) : 0, 'in', extIds),
        totalRoomArea: this.q(rooms.reduce((s, r) => s + r.area.value, 0), 'sq in', m.rooms.map(r => r.id)),
        height,
        windowCount: this.q(m.windows.length, 'count', m.windows.map(o => o.id)),
        doorCount: this.q(m.doors.filter(d => d.door).length, 'count', m.doors.filter(d => d.door).map(o => o.id)),
      },
      unverified,
      warnings: this.warnings,
    };
  }

  // ---------- walls ----------
  private wall(w: WallData): WallReading {
    const a = new Vector2(w.start[0], w.start[1]), b = new Vector2(w.end[0], w.end[1]);
    const L = a.distanceTo(b);
    const dir = b.clone().sub(a).normalize();
    const ops = this.m.openingsInWall(w.id);
    const opArea = ops.reduce((s, o) => s + o.width * o.height, 0);
    const ids = [w.id], opIds = [w.id, ...ops.map(o => o.id)];
    const outside = w.exterior ? L + w.thickness : L;
    const inside = w.exterior ? Math.max(0, L - w.thickness) : L;
    return {
      id: w.id, name: w.name, floor: w.floor, exterior: w.exterior, face: w.face,
      length: this.q(L, 'in', ids),
      outsideLength: this.q(outside, 'in', ids),
      height: this.q(w.height, 'in', ids),
      thickness: this.q(w.thickness, 'in', ids),
      grossArea: this.q(L * w.height, 'sq in', ids),
      openingArea: this.q(opArea, 'sq in', opIds),
      netArea: this.q(L * w.height - opArea, 'sq in', opIds),
      exteriorFaceArea: w.exterior ? this.q(outside * w.height - opArea, 'sq in', opIds) : null,
      interiorFaceArea: this.q(inside * this.innerHeight(w) - opArea, 'sq in', opIds),
      openings: ops.map(o => o.id),
      rooms: this.m.roomsOfWall(w.id).map(r => r.id),
      direction: [round(dir.x, 6), round(dir.y, 6)],
    };
  }

  // Finished wall height inside: the floor's ceiling height for full-height exterior walls.
  private innerHeight(w: WallData) {
    const f = this.m.floor(w.floor);
    if (!f) return w.height;
    return w.exterior ? Math.min(w.height, f.wallHeight - f.framing) : w.height;
  }

  // ---------- openings ----------
  private opening(o: OpeningData): OpeningReading | null {
    const w = this.m.wallOf(o);
    if (!w) { this.warnings.push(`${o.name} is in a wall that doesn't exist.`); return null; }
    const f = this.m.floor(w.floor);
    const c = this.openingCenter(o, w);
    const trim = o.kind === 'door' ? 2 * o.height + o.width : 2 * (o.width + o.height);
    return {
      id: o.id, name: o.name, kind: o.kind, wall: w.id, floor: w.floor, face: w.face, exterior: w.exterior,
      width: this.q(o.width, 'in', [o.id]), height: this.q(o.height, 'in', [o.id]),
      sill: this.q(o.sill, 'in', [o.id]), head: this.q(o.sill + o.height, 'in', [o.id]),
      area: this.q(o.width * o.height, 'sq in', [o.id]),
      trimPerimeter: this.q(trim, 'in', [o.id]),
      center: [round(c.x), round(c.y), round((f?.elevation ?? 0) + o.sill + o.height / 2)],
    };
  }

  private openingCenter(o: OpeningData, w: WallData) {
    const a = new Vector2(w.start[0], w.start[1]), b = new Vector2(w.end[0], w.end[1]);
    return a.clone().add(b.clone().sub(a).normalize().multiplyScalar(o.offset));
  }

  // ---------- rooms ----------
  private room(r: RoomData): RoomReading {
    const pts = r.polygon.map(p => new Vector2(p[0], p[1]));
    const area = Math.abs(ShapeUtils.area(pts));
    let perimeter = 0;
    for (let i = 0; i < pts.length; i++) perimeter += pts[i].distanceTo(pts[(i + 1) % pts.length]);
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const f = this.m.floor(r.floor);
    const ceiling = f ? f.wallHeight - f.framing : 0;
    const walls = this.m.wallsOfRoom(r.id);
    // Openings whose center sits on one of this room's edges (an interior door counts for both rooms).
    const edges = pts.map((p, i) => new Line3(new Vector3(p.x, p.y, 0), new Vector3(pts[(i + 1) % pts.length].x, pts[(i + 1) % pts.length].y, 0)));
    const openings = walls.flatMap(w => this.m.openingsInWall(w.id).filter(o => {
      const c = this.openingCenter(o, w);
      const pt = new Vector3(c.x, c.y, 0), on = new Vector3();
      return edges.some(e => e.closestPointToPoint(pt, true, on).distanceTo(pt) <= ON_EDGE);
    }));
    // Openings taller than the room's ceiling (a two-story wall) still only remove their own area.
    const opArea = openings.reduce((s, o) => s + o.width * Math.min(o.height, ceiling), 0);
    if (!walls.length) this.warnings.push(`${r.name} isn't bounded by any wall; its wall surface is estimated from its outline.`);
    const ids = [r.id], wallIds = [r.id, ...walls.map(w => w.id)], opIds = [...wallIds, ...openings.map(o => o.id)];
    return {
      id: r.id, name: r.name, type: r.type, floor: r.floor,
      area: this.q(area, 'sq in', ids),
      perimeter: this.q(perimeter, 'in', ids),
      width: this.q(Math.max(...xs) - Math.min(...xs), 'in', ids),
      depth: this.q(Math.max(...ys) - Math.min(...ys), 'in', ids),
      ceilingHeight: this.q(ceiling, 'in', ids),
      wallSurfaceGross: this.q(perimeter * ceiling, 'sq in', wallIds),
      openingArea: this.q(opArea, 'sq in', opIds),
      wallSurfaceNet: this.q(perimeter * ceiling - opArea, 'sq in', opIds),
      walls: walls.map(w => w.id),
      openings: openings.map(o => o.id),
      floorFinish: r.floorFinish,
    };
  }

  // ---------- roofs ----------
  private roof(r: RoofData): RoofReading | null {
    const ext = this.m.exteriorWalls(r.floor);
    const f = this.m.floor(r.floor);
    if (!ext.length || !f) { this.warnings.push(`${r.name} has no exterior walls under it, so its size can't be read.`); return null; }
    const xs = ext.flatMap(w => [w.start[0], w.end[0]]), ys = ext.flatMap(w => [w.start[1], w.end[1]]);
    const lenX = Math.max(...xs) - Math.min(...xs), lenY = Math.max(...ys) - Math.min(...ys);
    const span = r.axis === 'x' ? lenY : lenX;
    const along = r.axis === 'x' ? lenX : lenY;
    const run = span / 2;
    const rise = run * r.pitch / 12;
    const factor = Math.sqrt(1 + (r.pitch / 12) ** 2);
    const ridgeLength = along + 2 * r.overhang;
    const rafter = (run + r.overhang) * factor;
    const surface = 2 * ridgeLength * rafter;
    const base = f.elevation + f.wallHeight;
    const ids = [r.id, ...ext.map(w => w.id)];
    return {
      id: r.id, name: r.name, floor: r.floor, material: r.material,
      pitch: this.q(r.pitch, 'ratio', [r.id]),
      angle: this.q(Math.atan(r.pitch / 12) * 180 / Math.PI, 'deg', [r.id]),
      pitchFactor: this.q(factor, 'ratio', [r.id]),
      rise: this.q(rise, 'in', ids), run: this.q(run, 'in', ids),
      ridgeHeight: this.q(base + rise + r.thickness, 'in', ids),
      ridgeLength: this.q(ridgeLength, 'in', ids),
      rafterLength: this.q(rafter, 'in', ids),
      planArea: this.q((along + 2 * r.overhang) * (span + 2 * r.overhang), 'sq in', ids),
      surfaceArea: this.q(surface, 'sq in', ids),
      eaveLength: this.q(2 * ridgeLength, 'in', ids),
      rakeLength: this.q(4 * rafter, 'in', ids),
      squares: this.q(surface / 144 / 100, 'count', ids),
    };
  }

  // ---------- components ----------
  private component(id: string): ComponentReading {
    const c = this.m.components.find(x => x.id === id)!;
    const [w, d, h] = c.box.s;
    const ids = [c.id];
    return {
      id: c.id, name: c.name, kind: c.kind, floor: c.floor, room: c.room ?? null, material: c.material,
      width: this.q(w, 'in', ids), depth: this.q(d, 'in', ids), height: this.q(h, 'in', ids),
      topArea: this.q(w * d, 'sq in', ids),
      volume: this.q(w * d * h, 'cu in', ids),
      frontLength: this.q(Math.max(w, d), 'in', ids),
    };
  }

  // ---------- floors ----------
  private floor(id: string, rooms: RoomReading[], walls: WallReading[]): FloorReading {
    const f = this.m.floor(id)!;
    const ext = this.m.exteriorWalls(id);
    const loop = chainLoop(ext);
    let footprint = 0, perimeter = 0;
    if (loop) {
      footprint = Math.abs(ShapeUtils.area(loop));
      for (let i = 0; i < loop.length; i++) perimeter += loop[i].distanceTo(loop[(i + 1) % loop.length]);
    } else if (ext.length) {
      this.warnings.push(`${f.name}'s exterior walls don't close, so its footprint uses their bounding box.`);
      const xs = ext.flatMap(w => [w.start[0], w.end[0]]), ys = ext.flatMap(w => [w.start[1], w.end[1]]);
      footprint = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
      perimeter = ext.reduce((s, w) => s + Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1]), 0);
    }
    const onFloor = walls.filter(w => w.floor === id);
    const extIds = ext.map(w => w.id);
    const roomsHere = rooms.filter(r => r.floor === id);
    return {
      id: f.id, name: f.name, level: f.level,
      elevation: this.q(f.elevation, 'in', extIds),
      wallHeight: this.q(f.wallHeight, 'in', extIds),
      ceilingHeight: this.q(f.wallHeight - f.framing, 'in', extIds),
      footprintArea: this.q(footprint, 'sq in', extIds),
      exteriorPerimeter: this.q(perimeter, 'in', extIds),
      roomArea: this.q(roomsHere.reduce((s, r) => s + r.area.value, 0), 'sq in', roomsHere.map(r => r.id)),
      exteriorWallLength: this.q(onFloor.filter(w => w.exterior).reduce((s, w) => s + w.length.value, 0), 'in', extIds),
      interiorWallLength: this.q(onFloor.filter(w => !w.exterior).reduce((s, w) => s + w.length.value, 0), 'in', onFloor.filter(w => !w.exterior).map(w => w.id)),
    };
  }
}

// Orders exterior walls end-to-start into a closed outline. null when they don't form one loop.
export function chainLoop(walls: { start: number[]; end: number[] }[]): Vector2[] | null {
  if (walls.length < 3) return null;
  const left = [...walls];
  const pts: Vector2[] = [];
  let cur = left.shift()!;
  const first = new Vector2(cur.start[0], cur.start[1]);
  pts.push(first);
  while (left.length) {
    const end = new Vector2(cur.end[0], cur.end[1]);
    const i = left.findIndex(w => end.distanceTo(new Vector2(w.start[0], w.start[1])) <= CLOSE);
    if (i < 0) return null;
    cur = left.splice(i, 1)[0];
    pts.push(new Vector2(cur.start[0], cur.start[1]));
  }
  return new Vector2(cur.end[0], cur.end[1]).distanceTo(first) <= CLOSE ? pts : null;
}

const round = (v: number, digits = 4) => { const k = 10 ** digits; return Math.round(v * k) / k; };

// Display helpers shared by takeoffs and estimates.
export const toSqFt = (sqIn: number) => sqIn / 144;
export const toFt = (inches: number) => inches / 12;
export const toCuYd = (cuIn: number) => cuIn / 46656;
