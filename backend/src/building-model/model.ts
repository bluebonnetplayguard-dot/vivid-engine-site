import {
  BuildingModelData, BuildingModelSchema, ComponentData, DimensionSource, Dimensions, DoorData, FloorData, OpeningData,
  RoofData, RoomData, WallData, WindowData,
} from './schema';

// Typed, read-only view over a gc-building/1 document: lookups, relationships and where each size came from.
// Geometry math (lengths, areas, roof geometry) lives in geometry-reader (next PR); this class is structure.

export type ElementKind = 'floor' | 'wall' | 'opening' | 'room' | 'roof' | 'component';
export type AnyElement = FloorData | WallData | OpeningData | RoomData | RoofData | ComponentData;

export interface Provenance { verified: boolean; source: DimensionSource; ref?: Dimensions['ref'] }

export class ModelParseError extends Error {
  constructor(readonly issues: { path: string; message: string }[]) {
    super(`The building model isn't valid: ${issues.slice(0, 3).map(i => `${i.path || '(root)'}: ${i.message}`).join('; ')}${issues.length > 3 ? ` (+${issues.length - 3} more)` : ''}`);
    this.name = 'ModelParseError';
  }
}

const EPS = 0.5;   // inches: how close a wall must sit to a room edge to bound it

export class BuildingModel {
  private readonly index = new Map<string, { kind: ElementKind; el: AnyElement }>();

  private constructor(readonly data: BuildingModelData) {
    const add = (kind: ElementKind, list: AnyElement[]) => { for (const el of list) this.index.set(el.id, { kind, el }); };
    add('floor', data.floors); add('wall', data.walls); add('opening', data.openings);
    add('room', data.rooms); add('roof', data.roofs); add('component', data.components);
  }

  // Parse untrusted JSON. Throws ModelParseError listing what's wrong.
  static parse(json: unknown): BuildingModel {
    const r = BuildingModelSchema.safeParse(json);
    if (!r.success) throw new ModelParseError(r.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })));
    return new BuildingModel(r.data);
  }

  static tryParse(json: unknown): { model: BuildingModel | null; error: ModelParseError | null } {
    try { return { model: BuildingModel.parse(json), error: null }; } catch (e) { return { model: null, error: e as ModelParseError }; }
  }

  toJSON(): BuildingModelData { return this.data; }

  get floors(): FloorData[] { return this.data.floors; }
  get walls(): WallData[] { return this.data.walls; }
  get openings(): OpeningData[] { return this.data.openings; }
  get windows(): WindowData[] { return this.data.openings.filter((o): o is WindowData => o.kind === 'window'); }
  get doors(): DoorData[] { return this.data.openings.filter((o): o is DoorData => o.kind === 'door'); }
  get rooms(): RoomData[] { return this.data.rooms; }
  get roofs(): RoofData[] { return this.data.roofs; }
  get components(): ComponentData[] { return this.data.components; }

  find(id: string) { return this.index.get(id) ?? null; }
  kindOf(id: string): ElementKind | null { return this.index.get(id)?.kind ?? null; }
  floor(id: string) { return this.data.floors.find(f => f.id === id) ?? null; }
  floorsByLevel(): FloorData[] { return [...this.data.floors].sort((a, b) => a.level - b.level); }

  wallsOnFloor(floorId: string) { return this.data.walls.filter(w => w.floor === floorId); }
  exteriorWalls(floorId?: string) { return this.data.walls.filter(w => w.exterior && (!floorId || w.floor === floorId)); }
  openingsInWall(wallId: string) { return this.data.openings.filter(o => o.wall === wallId).sort((a, b) => a.offset - b.offset); }
  wallOf(opening: OpeningData) { return this.data.walls.find(w => w.id === opening.wall) ?? null; }
  roomsOnFloor(floorId: string) { return this.data.rooms.filter(r => r.floor === floorId); }
  componentsInRoom(roomId: string) { return this.data.components.filter(c => c.room === roomId); }

  // Walls that run along the room's outline (collinear with and overlapping one of its edges).
  wallsOfRoom(roomId: string): WallData[] {
    const room = this.data.rooms.find(r => r.id === roomId);
    if (!room) return [];
    const edges = room.polygon.map((p, i) => [p, room.polygon[(i + 1) % room.polygon.length]] as const);
    return this.wallsOnFloor(room.floor).filter(w => edges.some(([a, b]) => segmentsOverlap(w.start, w.end, a, b)));
  }

  // Rooms that a wall bounds (one for an exterior wall, usually two for an interior wall).
  roomsOfWall(wallId: string): RoomData[] {
    const wall = this.data.walls.find(w => w.id === wallId);
    if (!wall) return [];
    return this.roomsOnFloor(wall.floor).filter(r => r.polygon.some((p, i) => segmentsOverlap(wall.start, wall.end, p, r.polygon[(i + 1) % r.polygon.length])));
  }

  // Where an element's sizes came from. Old saves without dims.source count as the model's own source.
  provenance(id: string): Provenance | null {
    const hit = this.index.get(id);
    if (!hit) return null;
    const dims = (hit.el as { dims?: Dimensions }).dims;
    const fallback: DimensionSource = this.data.meta.source === 'blueprint' ? 'ai-inferred' : this.data.meta.source === 'manual' ? 'contractor' : 'sample';
    const source = dims?.source ?? (dims?.status === 'verified' ? 'contractor' : fallback);
    return { verified: dims?.status === 'verified', source, ref: dims?.ref };
  }
}

// True when segment p0-p1 and q0-q1 lie on the same line and share more than EPS of length.
export function segmentsOverlap(p0: readonly number[], p1: readonly number[], q0: readonly number[], q1: readonly number[]): boolean {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
  const len = Math.hypot(dx, dy);
  if (len < EPS) return false;
  const ux = dx / len, uy = dy / len;
  const off = (q: readonly number[]) => Math.abs((q[0] - p0[0]) * uy - (q[1] - p0[1]) * ux);   // distance from p's line
  if (off(q0) > EPS || off(q1) > EPS) return false;
  const t = (q: readonly number[]) => (q[0] - p0[0]) * ux + (q[1] - p0[1]) * uy;
  const a = Math.min(t(q0), t(q1)), b = Math.max(t(q0), t(q1));
  return Math.min(b, len) - Math.max(a, 0) > EPS;
}
