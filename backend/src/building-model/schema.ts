import { z } from 'zod';

// The structured building model ("gc-building/1"), server side. The same JSON the 3D Design Studio edits
// (site/src/modules/gc-3d-design-studio/core/model.js) and the source of every measurement, takeoff and
// estimate. Lengths are inches; x = east (width), y = north (depth), z = up; the front faces -y.
// Exterior walls run counter-clockwise seen from above, so each exterior wall's start is on the left of
// someone standing outside it.
//
// backend/test/building-model.test.mjs checks that the studio's sample house passes this schema, so the
// two sides can't drift apart.

export const SCHEMA_ID = 'gc-building/1';

const id = z.string().min(1).max(80);
const inches = z.number().finite();
const positive = (max: number) => z.number().finite().gt(0).lte(max);
const point2 = z.array(inches).length(2);   // [x, y]
const point3 = z.array(inches).length(3);   // [x, y, z]

// Where a size came from. Only blueprint (with a drawing reference) or contractor sizes can be "verified".
export const DimensionSource = z.enum(['sample', 'blueprint', 'ai-inferred', 'contractor']);
export type DimensionSource = z.infer<typeof DimensionSource>;

export const DrawingReference = z.object({
  sheet: z.string().max(40),                       // e.g. "A-101"
  page: z.number().int().min(1).max(2000).optional(),
  title: z.string().max(120).optional(),           // e.g. "First floor plan"
  region: z.array(z.number().finite()).length(4).optional(),   // x0, y0, x1, y1 on the page, in page pixels
  note: z.string().max(300).optional(),
}).strict();
export type DrawingReference = z.infer<typeof DrawingReference>;

// dims.status is what the UI shows; source/ref say why. ref may be a plain sheet name (older saves).
export const Dimensions = z.object({
  status: z.enum(['conceptual', 'verified']),
  source: DimensionSource.optional(),
  ref: z.union([z.string().max(120), DrawingReference]).optional(),
  edited: z.boolean().optional(),
  verifiedBy: z.string().max(120).optional(),
  verifiedAt: z.string().max(40).optional(),
}).strict();
export type Dimensions = z.infer<typeof Dimensions>;

export const Floor = z.object({
  id, name: z.string().max(80), level: z.number().int().min(-5).max(200),
  elevation: inches, wallHeight: positive(1200), framing: z.number().finite().min(0).max(120),
}).strict();

export const Wall = z.object({
  id, floor: id, name: z.string().max(120),
  start: point2, end: point2,
  height: positive(1200), thickness: positive(48),
  exterior: z.boolean(), face: z.enum(['front', 'back', 'left', 'right']).nullable(),
  finishExterior: z.string().max(40), finishInterior: z.string().max(40),
  colorExterior: z.string().max(20).optional(), colorInterior: z.string().max(20).optional(),
  dims: Dimensions.optional(),
}).strict();

const openingBase = {
  id, wall: id, name: z.string().max(120),
  offset: inches,                                   // distance along the wall from its start to the opening's center
  width: positive(480), height: positive(480), sill: z.number().finite().min(0).max(480),
  frame: z.string().max(40), frameColor: z.string().max(20).optional(),
  dims: Dimensions.optional(),
};
export const Window = z.object({ ...openingBase, kind: z.literal('window'), style: z.string().max(40).optional() }).strict();
export const Door = z.object({ ...openingBase, kind: z.literal('door'), door: z.string().max(40).nullable().optional(), doorColor: z.string().max(20).optional() }).strict();
export const Opening = z.discriminatedUnion('kind', [Window, Door]);

export const Room = z.object({
  id, floor: id, name: z.string().max(120), type: z.string().max(40),
  polygon: z.array(point2).min(3).max(200),
  floorFinish: z.string().max(40), floorColor: z.string().max(20).optional(),
  dims: Dimensions.optional(),
}).strict();

export const Roof = z.object({
  id, kind: z.literal('gable'), floor: id, name: z.string().max(120),
  axis: z.enum(['x', 'y']), pitch: z.number().finite().gt(0).lte(24), overhang: z.number().finite().min(0).max(60),
  thickness: positive(24), material: z.string().max(40), color: z.string().max(20).optional(),
  dims: Dimensions.optional(),
}).strict();

export const ComponentKind = z.enum(['slab', 'floor-deck', 'cabinet', 'countertop', 'patio', 'patio-post', 'patio-roof']);
export const Component = z.object({
  id, kind: ComponentKind, floor: id, room: id.optional(), name: z.string().max(120),
  box: z.object({ c: point3, s: z.array(positive(2400)).length(3), r: point3.optional() }).strict(),   // center, size [w, d, h], rotation
  material: z.string().max(40), color: z.string().max(20).optional(), group: z.string().max(80).optional(),
  dims: Dimensions.optional(),
}).strict();

export const BuildingModelSchema = z.object({
  schema: z.literal(SCHEMA_ID),
  id: z.string().max(80), name: z.string().max(160),
  meta: z.object({ source: z.enum(['sample', 'blueprint', 'manual']), notice: z.string().max(500).optional() }).passthrough(),
  drawings: z.array(DrawingReference).max(500).optional(),
  floors: z.array(Floor).min(1).max(10),
  walls: z.array(Wall).max(600),
  openings: z.array(Opening).max(600),
  rooms: z.array(Room).max(300),
  roofs: z.array(Roof).max(20),
  components: z.array(Component).max(600),
}).strict();

export type FloorData = z.infer<typeof Floor>;
export type WallData = z.infer<typeof Wall>;
export type WindowData = z.infer<typeof Window>;
export type DoorData = z.infer<typeof Door>;
export type OpeningData = z.infer<typeof Opening>;
export type RoomData = z.infer<typeof Room>;
export type RoofData = z.infer<typeof Roof>;
export type ComponentData = z.infer<typeof Component>;
export type BuildingModelData = z.infer<typeof BuildingModelSchema>;

// JSON Schema (draft 2020-12) for other tools, e.g. the blueprint parser's output format.
export const buildingModelJsonSchema = () => z.toJSONSchema(BuildingModelSchema);
