import { z } from 'zod';

// The command vocabulary the AI interpreter may use. It mirrors site/src/modules/gc-3d-design-studio/core
// (commands.js and materials.js); site/tests/studio3d.test.mjs fails if the two lists drift apart.
// The server checks the shape here; the browser checks every command again against the actual building.

export const MATERIAL_IDS = {
  siding: ['vinyl-lap', 'fiber-cement-lap', 'board-batten', 'brick', 'brick-white', 'stone', 'stucco', 'metal-panel'],
  interior: ['drywall', 'shiplap'],
  roofing: ['asphalt-shingle', 'standing-seam', 'clay-tile', 'cedar-shake'],
  trim: ['vinyl-frame', 'aluminum-frame', 'wood-frame'],
  door: ['steel-door', 'wood-door', 'glass-door'],
  flooring: ['oak-floor', 'lvp-gray', 'tile-floor', 'carpet'],
  cabinet: ['shaker-white', 'shaker-navy', 'walnut-cabinet'],
  countertop: ['quartz-white', 'granite-black', 'butcher-block'],
  hardscape: ['concrete', 'pavers'],
} as const;
export const ALL_MATERIALS = Object.values(MATERIAL_IDS).flat() as string[];
export const COLOR_NAMES = ['white', 'off white', 'cream', 'ivory', 'beige', 'tan', 'greige', 'gray', 'grey', 'light gray', 'light grey', 'charcoal', 'black',
  'navy', 'blue', 'sky blue', 'green', 'sage', 'olive', 'red', 'brick', 'brown', 'bronze', 'terracotta', 'yellow'];

const TARGET_KINDS = ['selected', 'roof', 'wall', 'exterior-walls', 'interior-walls', 'window', 'door', 'opening', 'room', 'cabinet', 'countertop', 'component'] as const;
const FACES = ['front', 'back', 'left', 'right'] as const;
const inches = (max: number) => z.number().finite().min(-max).max(max);

const Target = z.union([
  z.object({ id: z.string().max(80) }).strict(),
  z.object({ kind: z.enum(TARGET_KINDS), face: z.enum(FACES).optional(), floor: z.union([z.literal('f1'), z.literal('f2'), z.literal(1), z.literal(2)]).optional(), name: z.string().max(80).optional() }).strict(),
]);
const Color = z.string().max(30).refine(c => /^#[0-9a-fA-F]{6}$/.test(c) || COLOR_NAMES.includes(c.toLowerCase()), 'unknown color');
const Surface = z.enum(['exterior', 'interior', 'frame', 'door', 'floor']).optional();
const Appearance = z.discriminatedUnion('type', [
  z.object({ type: z.literal('UPDATE_MATERIAL'), target: Target, material: z.enum(ALL_MATERIALS as [string, ...string[]]), surface: Surface }).strict(),
  z.object({ type: z.literal('UPDATE_COLOR'), target: Target, color: Color, surface: Surface }).strict(),
]);

export const Command = z.discriminatedUnion('type', [
  z.object({ type: z.literal('SELECT_OBJECT'), target: Target }).strict(),
  z.object({ type: z.literal('UPDATE_MATERIAL'), target: Target, material: z.enum(ALL_MATERIALS as [string, ...string[]]), surface: Surface }).strict(),
  z.object({ type: z.literal('UPDATE_COLOR'), target: Target, color: Color, surface: Surface }).strict(),
  z.object({ type: z.literal('MOVE_OBJECT'), target: Target, along: inches(600).optional(), up: inches(120).optional() }).strict(),
  z.object({ type: z.literal('RESIZE_OBJECT'), target: Target, width: inches(1200).optional(), height: inches(1200).optional(), depth: inches(1200).optional(), sill: inches(1200).optional() }).strict(),
  z.object({ type: z.literal('ADD_COMPONENT'), component: z.literal('covered-patio'), side: z.enum(['front', 'back']).optional(), width: z.number().min(96).max(480).optional(), depth: z.number().min(72).max(240).optional() }).strict(),
  z.object({ type: z.literal('REMOVE_COMPONENT'), target: Target }).strict(),
  z.object({ type: z.literal('CHANGE_CAMERA'), preset: z.enum(['front', 'back', 'left', 'right', 'top', 'iso', 'ground', 'room', 'rotate']), room: z.string().max(60).optional(), degrees: z.number().min(-360).max(360).optional() }).strict(),
  z.object({ type: z.literal('SET_VIEW'), mode: z.enum(['exterior', 'interior', 'dollhouse', 'walkthrough', 'floor', 'perspective', 'orthographic']), floor: z.union([z.literal(1), z.literal(2)]).optional() }).strict(),
  z.object({ type: z.literal('TOGGLE_LAYER'), layer: z.enum(['roof', 'exterior-walls', 'interior-walls', 'openings', 'floors', 'cabinets', 'site', 'dimensions', 'grid']), visible: z.boolean() }).strict(),
  z.object({ type: z.literal('SET_LIGHTING'), preset: z.enum(['day', 'sunset', 'evening']) }).strict(),
  z.object({ type: z.literal('GENERATE_RENDER'), label: z.string().max(120).optional() }).strict(),
  z.object({ type: z.literal('CREATE_DESIGN_VARIATION'), name: z.string().min(1).max(80), commands: z.array(Appearance).max(20).optional() }).strict(),
  z.object({ type: z.literal('SAVE_DESIGN') }).strict(),
]);
export type StudioCommand = z.infer<typeof Command>;

// Keeps the valid commands and explains the rest in plain words.
export function checkCommands(raw: unknown): { commands: StudioCommand[]; dropped: string[] } {
  const list = Array.isArray(raw) ? raw.slice(0, 25) : [];
  const commands: StudioCommand[] = [], dropped: string[] = [];
  for (const c of list) {
    const r = Command.safeParse(c);
    if (r.success) commands.push(r.data);
    else dropped.push(`Skipped an instruction I couldn’t use (${(c as any)?.type ?? 'unknown'}: ${r.error.issues[0]?.message ?? 'invalid'}).`);
  }
  return { commands, dropped };
}

export const VOCABULARY_DOC = `Commands (JSON objects; lengths are numbers in INCHES):
- SELECT_OBJECT { target }
- UPDATE_MATERIAL { target, material, surface? }   surface: exterior|interior (walls), frame|door (openings), floor (rooms)
- UPDATE_COLOR { target, color, surface? }         color: a name (${COLOR_NAMES.join(', ')}) or #rrggbb
- MOVE_OBJECT { target, along?, up? }              windows/doors only. along: + = right, - = left as seen from OUTSIDE the wall. up: raise (+) or lower (-) a window
- RESIZE_OBJECT { target, width?, height?, sill?, depth? }   absolute sizes, windows/doors/components (cabinets, patios)
- ADD_COMPONENT { component: "covered-patio", side?: "back"|"front", width?, depth? }
- REMOVE_COMPONENT { target }                      added components only
- CHANGE_CAMERA { preset: front|back|left|right|top|iso|ground|room|rotate, room?, degrees? }   rotate: + turns the house to the right
- SET_VIEW { mode: exterior|interior|dollhouse|walkthrough|floor|perspective|orthographic, floor? }   dollhouse = roof removed
- TOGGLE_LAYER { layer: roof|exterior-walls|interior-walls|openings|floors|cabinets|site|dimensions|grid, visible }
- SET_LIGHTING { preset: day|sunset|evening }
- GENERATE_RENDER { label? }                       saves a presentation image of the current view to the project
- CREATE_DESIGN_VARIATION { name, commands: [UPDATE_MATERIAL|UPDATE_COLOR ...] }   a separate design to compare (finishes only)
- SAVE_DESIGN {}
Targets: { id } for a specific element from the context, or { kind, face?, floor?, name? } with kind one of ${TARGET_KINDS.join(', ')}.
"exterior-walls" = all siding; "selected" = what the contractor has selected. floor: 1 or 2.
Materials by category: ${Object.entries(MATERIAL_IDS).map(([k, v]) => `${k}: ${v.join(', ')}`).join('; ')}.`;
