import { z } from 'zod';
import { ALL_MATERIALS, COLOR_NAMES } from '../studio3d/vocabulary';

// The one command vocabulary for the GC platform. Everything the AI assistant (or a button, or a test) can ask
// the platform to do is an AICommand: { type, payload, meta }. Commands are data. Nothing here or downstream
// ever executes AI-written code.
//
// Families
//   studio        3D Design Studio: selection, finishes, geometry edits, camera, layers, lighting, renders
//   construction  takeoffs, estimates, proposals, and (not yet available) schedules, compliance, change orders
//   project       save/restore designs, load models; (not yet available) drawing exports and blueprints
//
// meta.inferred lists payload fields the AI filled in without the contractor saying them. Geometry commands
// with an inferred size always need the contractor's confirmation, so a guessed dimension can't change the model.

export const STUDIO_TYPES = ['SELECT_OBJECT', 'UPDATE_MATERIAL', 'UPDATE_COLOR', 'MOVE_OBJECT', 'RESIZE_OBJECT', 'ADD_COMPONENT', 'REMOVE_COMPONENT',
  'CHANGE_CAMERA', 'SET_VIEW', 'TOGGLE_LAYER', 'SET_LIGHTING', 'GENERATE_RENDER', 'CREATE_DESIGN_VARIATION'] as const;
export const CONSTRUCTION_TYPES = ['CALCULATE_MATERIALS', 'GENERATE_ESTIMATE', 'PRODUCE_PROPOSAL', 'CREATE_SCHEDULE', 'CHECK_COMPLIANCE', 'CREATE_CHANGE_ORDER'] as const;
export const PROJECT_TYPES = ['SAVE_DESIGN', 'RESTORE_DESIGN', 'LOAD_MODEL', 'EXPORT_DRAWINGS', 'LOAD_BLUEPRINT'] as const;
export const AI_COMMAND_TYPES = [...STUDIO_TYPES, ...CONSTRUCTION_TYPES, ...PROJECT_TYPES] as const;
export type AICommandType = (typeof AI_COMMAND_TYPES)[number];
export type CommandFamily = 'studio' | 'construction' | 'project';

// ---------- shared pieces ----------

const id = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/, 'not a valid id');
const inches = (max: number) => z.number().finite().min(-max).max(max);
const sizeIn = (max: number) => z.number().finite().gt(0).max(max);

export const Target = z.union([
  z.object({ id }).strict(),
  z.object({
    kind: z.enum(['selected', 'roof', 'wall', 'exterior-walls', 'interior-walls', 'window', 'door', 'opening', 'room', 'cabinet', 'countertop', 'component']),
    face: z.enum(['front', 'back', 'left', 'right']).optional(),
    floor: z.union([z.literal(1), z.literal(2), z.literal('f1'), z.literal('f2')]).optional(),
    name: z.string().max(80).optional(),
  }).strict(),
]);
export type Target = z.infer<typeof Target>;

const Color = z.string().max(30).refine(c => /^#[0-9a-fA-F]{6}$/.test(c) || COLOR_NAMES.includes(c.toLowerCase()), 'unknown color');
const Surface = z.enum(['exterior', 'interior', 'frame', 'door', 'floor']);

// ---------- payloads ----------

export const SelectPayload = z.object({ target: Target }).strict();
export const MaterialPayload = z.object({ target: Target, material: z.enum(ALL_MATERIALS as [string, ...string[]]), surface: Surface.optional() }).strict();
export const ColorPayload = z.object({ target: Target, color: Color, surface: Surface.optional() }).strict();
export const MovePayload = z.object({ target: Target, along: inches(600).optional(), up: inches(120).optional() }).strict()
  .refine(p => (p.along ?? 0) !== 0 || (p.up ?? 0) !== 0, 'a move needs along and/or up (inches)');
export const ResizePayload = z.object({ target: Target, width: sizeIn(1200).optional(), height: sizeIn(1200).optional(), depth: sizeIn(1200).optional(), sill: z.number().finite().min(0).max(480).optional() }).strict()
  .refine(p => [p.width, p.height, p.depth, p.sill].some(v => v != null), 'a resize needs width, height, depth or sill (inches)');
export const AddComponentPayload = z.object({ component: z.literal('covered-patio'), side: z.enum(['front', 'back']).optional(), width: z.number().min(96).max(480).optional(), depth: z.number().min(72).max(240).optional() }).strict();
export const RemoveComponentPayload = z.object({ target: Target }).strict();
export const CameraPayload = z.object({ preset: z.enum(['front', 'back', 'left', 'right', 'top', 'iso', 'aerial', 'ground', 'room', 'rotate']), room: z.string().max(60).optional(), degrees: z.number().min(-360).max(360).optional() }).strict()
  .refine(p => p.preset !== 'rotate' || typeof p.degrees === 'number', 'rotate needs degrees')
  .refine(p => p.preset !== 'room' || !!p.room, 'room view needs a room name');
export const ViewPayload = z.object({ mode: z.enum(['exterior', 'interior', 'dollhouse', 'walkthrough', 'floor', 'perspective', 'orthographic']), floor: z.union([z.literal(1), z.literal(2)]).optional() }).strict();
export const LayerPayload = z.object({ layer: z.enum(['roof', 'exterior-walls', 'interior-walls', 'openings', 'floors', 'cabinets', 'site', 'dimensions', 'grid']), visible: z.boolean() }).strict();
export const LightingPayload = z.object({ preset: z.enum(['day', 'sunset', 'evening']) }).strict();
export const RenderPayload = z.object({ label: z.string().max(120).optional() }).strict();
const AppearanceCommand = z.discriminatedUnion('type', [
  z.object({ type: z.literal('UPDATE_MATERIAL'), payload: MaterialPayload }).strict(),
  z.object({ type: z.literal('UPDATE_COLOR'), payload: ColorPayload }).strict(),
]);
export const VariationPayload = z.object({ name: z.string().trim().min(1).max(80), commands: z.array(AppearanceCommand).max(20).default([]) }).strict();

export const TakeoffPayload = z.object({ designId: id.optional(), settings: z.record(z.string(), z.unknown()).optional() }).strict();
export const EstimatePayload = z.object({ designId: id.optional(), alternates: z.array(id).max(6).optional(), alternateNames: z.array(z.string().max(80)).max(6).optional(), settings: z.record(z.string(), z.unknown()).optional(), note: z.string().max(500).optional() }).strict();
export const ProposalPayload = z.object({ estimateVersion: z.number().int().positive().optional(), tone: z.enum(['friendly', 'formal']).optional(), includeAlternates: z.boolean().optional() }).strict();
export const SchedulePayload = z.object({ startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), crews: z.number().int().min(1).max(20).optional() }).strict();
export const CompliancePayload = z.object({ topics: z.array(z.enum(['stairs', 'egress', 'guards', 'smoke-alarms', 'energy', 'general'])).max(6).optional() }).strict();
export const ChangeOrderPayload = z.object({ description: z.string().trim().min(1).max(1000), fromVersion: z.number().int().positive().optional() }).strict();

export const SavePayload = z.object({ note: z.string().max(200).optional() }).strict();
export const RestorePayload = z.object({ version: z.number().int().positive(), designId: id.optional() }).strict();
export const LoadModelPayload = z.object({ designId: id.optional(), designName: z.string().max(80).optional(), projectId: id.optional() }).strict()
  .refine(p => p.designId || p.designName || p.projectId, 'say which design or project to open');
export const ExportDrawingsPayload = z.object({ format: z.enum(['pdf', 'dxf']), scale: z.string().max(20).optional(), sheets: z.array(z.enum(['floor-plans', 'elevations', 'roof-plan', 'site-plan'])).max(4).optional() }).strict();
export const LoadBlueprintPayload = z.object({ uploadId: id.optional() }).strict();

export type GeometryPayload = z.infer<typeof MovePayload> | z.infer<typeof ResizePayload> | z.infer<typeof AddComponentPayload> | z.infer<typeof RemoveComponentPayload>;
export type MaterialPayload = z.infer<typeof MaterialPayload> | z.infer<typeof ColorPayload>;
export type CameraPayload = z.infer<typeof CameraPayload> | z.infer<typeof ViewPayload> | z.infer<typeof LayerPayload> | z.infer<typeof LightingPayload>;
export type TakeoffPayload = z.infer<typeof TakeoffPayload>;
export type EstimatePayload = z.infer<typeof EstimatePayload>;

// ---------- registry ----------

// risk decides how a command runs:
//   view        instant, not saved (camera, layers, lighting, selection)
//   appearance  instant, undoable, saved with the design (materials, colors)
//   geometry    previewed; applied only after the contractor approves
//   compute     runs a job and returns results (takeoff, estimate, proposal)
//   project     changes which design is open or saves it
//   destructive replaces the current design state; always confirmed
export type Risk = 'view' | 'appearance' | 'geometry' | 'compute' | 'project' | 'destructive';

export interface CommandSpec { family: CommandFamily; payload: z.ZodTypeAny; risk: Risk; supported: boolean; summary: string; unsupportedReason?: string }

const S = (payload: z.ZodTypeAny, risk: Risk, summary: string): CommandSpec => ({ family: 'studio', payload, risk, supported: true, summary });
const C = (payload: z.ZodTypeAny, risk: Risk, summary: string, supported = true, unsupportedReason?: string): CommandSpec => ({ family: 'construction', payload, risk, supported, summary, unsupportedReason });
const P = (payload: z.ZodTypeAny, risk: Risk, summary: string, supported = true, unsupportedReason?: string): CommandSpec => ({ family: 'project', payload, risk, supported, summary, unsupportedReason });

export const COMMAND_REGISTRY: Record<AICommandType, CommandSpec> = {
  SELECT_OBJECT: S(SelectPayload, 'view', 'Select an element'),
  UPDATE_MATERIAL: S(MaterialPayload, 'appearance', 'Change a finish material'),
  UPDATE_COLOR: S(ColorPayload, 'appearance', 'Change a color'),
  MOVE_OBJECT: S(MovePayload, 'geometry', 'Move a window or door along its wall'),
  RESIZE_OBJECT: S(ResizePayload, 'geometry', 'Resize a window, door or component'),
  ADD_COMPONENT: S(AddComponentPayload, 'geometry', 'Add a covered patio'),
  REMOVE_COMPONENT: S(RemoveComponentPayload, 'geometry', 'Remove an added component'),
  CHANGE_CAMERA: S(CameraPayload, 'view', 'Move the camera'),
  SET_VIEW: S(ViewPayload, 'view', 'Switch view mode'),
  TOGGLE_LAYER: S(LayerPayload, 'view', 'Show or hide a layer'),
  SET_LIGHTING: S(LightingPayload, 'view', 'Change lighting'),
  GENERATE_RENDER: S(RenderPayload, 'compute', 'Save a presentation image'),
  CREATE_DESIGN_VARIATION: S(VariationPayload, 'project', 'Create a design variation'),
  CALCULATE_MATERIALS: C(TakeoffPayload, 'compute', 'Run a material takeoff'),
  GENERATE_ESTIMATE: C(EstimatePayload, 'compute', 'Price the design'),
  PRODUCE_PROPOSAL: C(ProposalPayload, 'compute', 'Write a customer proposal'),
  CREATE_SCHEDULE: C(SchedulePayload, 'compute', 'Build a schedule', false, 'Scheduling isn’t available yet.'),
  CHECK_COMPLIANCE: C(CompliancePayload, 'compute', 'Check code topics', false, 'Code checks aren’t available yet, and the platform never gives code-compliance determinations.'),
  CREATE_CHANGE_ORDER: C(ChangeOrderPayload, 'compute', 'Draft a change order', false, 'Change orders aren’t available yet.'),
  SAVE_DESIGN: P(SavePayload, 'project', 'Save the design'),
  RESTORE_DESIGN: P(RestorePayload, 'destructive', 'Restore a saved version'),
  LOAD_MODEL: P(LoadModelPayload, 'project', 'Open a design or project'),
  EXPORT_DRAWINGS: P(ExportDrawingsPayload, 'compute', 'Export drawings', false, 'Drawing export comes with the QCAD milestone.'),
  LOAD_BLUEPRINT: P(LoadBlueprintPayload, 'project', 'Load a blueprint', false, 'Blueprint conversion comes in a later release.'),
};

export const familyOf = (t: AICommandType) => COMMAND_REGISTRY[t].family;

// ---------- the command ----------

export const CommandMeta = z.object({
  inferred: z.array(z.string().max(40)).max(20).default([]),         // payload fields the AI chose without being told
  reason: z.string().max(300).optional(),                            // why the AI chose this command (shown in previews)
}).strict().default({ inferred: [] });

export interface AICommand<T extends AICommandType = AICommandType> {
  type: T;
  payload: Record<string, unknown>;
  meta: { inferred: string[]; reason?: string };
}

export type CommandErrorCode = 'NOT_AN_OBJECT' | 'UNKNOWN_TYPE' | 'BAD_PAYLOAD' | 'BAD_META' | 'UNSUPPORTED' | 'TOO_MANY';
export interface CommandError { code: CommandErrorCode; message: string; type?: string; path?: string }

export type Validated = { ok: true; command: AICommand; spec: CommandSpec; needsConfirmation: boolean; confirmReason?: string } | { ok: false; error: CommandError };

const GEOMETRY_SIZE_FIELDS = ['along', 'up', 'width', 'height', 'depth', 'sill'];

// Shape check + safety classification for one raw command (from Claude or a client).
export function validateAICommand(raw: unknown): Validated {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: { code: 'NOT_AN_OBJECT', message: 'A command must be an object.' } };
  const r = raw as Record<string, unknown>;
  const type = r.type;
  if (typeof type !== 'string' || !(AI_COMMAND_TYPES as readonly string[]).includes(type)) {
    return { ok: false, error: { code: 'UNKNOWN_TYPE', message: `Unknown command “${String(type).slice(0, 40)}”.`, type: String(type).slice(0, 40) } };
  }
  const extra = Object.keys(r).filter(k => !['type', 'payload', 'meta'].includes(k));
  if (extra.length) return { ok: false, error: { code: 'BAD_PAYLOAD', message: `Unexpected field “${extra[0]}”.`, type } };
  const spec = COMMAND_REGISTRY[type as AICommandType];
  const p = spec.payload.safeParse(r.payload ?? {});
  if (!p.success) {
    const i = p.error.issues[0];
    return { ok: false, error: { code: 'BAD_PAYLOAD', message: `${spec.summary}: ${i?.message ?? 'invalid'}${i?.path?.length ? ` (${i.path.join('.')})` : ''}.`, type, path: i?.path?.join('.') } };
  }
  const m = CommandMeta.safeParse(r.meta ?? undefined);
  if (!m.success) return { ok: false, error: { code: 'BAD_META', message: 'Invalid command meta.', type } };
  if (!spec.supported) return { ok: false, error: { code: 'UNSUPPORTED', message: spec.unsupportedReason ?? 'That isn’t available yet.', type } };

  const command: AICommand = { type: type as AICommandType, payload: p.data as Record<string, unknown>, meta: m.data };
  // Confirmation rules: destructive always; geometry when the AI inferred a size or the change is large.
  let needsConfirmation = spec.risk === 'destructive';
  let confirmReason = needsConfirmation ? 'This replaces the current design with a saved version.' : undefined;
  if (spec.risk === 'geometry') {
    const guessed = command.meta.inferred.filter(f => GEOMETRY_SIZE_FIELDS.includes(f));
    needsConfirmation = true;   // geometry is always previewed; the reason says why it matters
    confirmReason = guessed.length ? `The assistant chose ${guessed.join(' and ')} without you giving a size. Check it before applying.` : 'Geometry changes are previewed before they are applied.';
  }
  return { ok: true, command, spec, needsConfirmation, confirmReason };
}

// Validates a batch; stops collecting after `max` commands. Invalid commands are reported, not executed.
export function validateBatch(raw: unknown, max = 25): { valid: Extract<Validated, { ok: true }>[]; errors: CommandError[] } {
  const list = Array.isArray(raw) ? raw : [];
  const valid: Extract<Validated, { ok: true }>[] = [], errors: CommandError[] = [];
  if (list.length > max) errors.push({ code: 'TOO_MANY', message: `Only the first ${max} instructions were considered.` });
  for (const c of list.slice(0, max)) { const v = validateAICommand(c); if (v.ok === true) valid.push(v); else errors.push((v as Extract<Validated, { ok: false }>).error); }
  return { valid, errors };
}

// ---------- compatibility with the 3D Studio's flat command format ----------
// The studio (site/.../core/commands.js) uses { type, ...fields }. These convert both ways for studio commands.

export function fromStudioCommand(flat: Record<string, unknown>): Record<string, unknown> {
  const { type, ...rest } = flat;
  if (type === 'CREATE_DESIGN_VARIATION') {
    const { commands, ...v } = rest as { commands?: Record<string, unknown>[] };
    return { type, payload: { ...v, commands: (commands ?? []).map(c => fromStudioCommand(c)).map(c => ({ type: c.type, payload: c.payload })) } };
  }
  return { type, payload: rest };
}

export function toStudioCommand(cmd: AICommand): Record<string, unknown> {
  if (cmd.type === 'CREATE_DESIGN_VARIATION') {
    const p = cmd.payload as { name: string; commands: { type: string; payload: Record<string, unknown> }[] };
    return { type: cmd.type, name: p.name, commands: p.commands.map(c => ({ type: c.type, ...c.payload })) };
  }
  return { type: cmd.type, ...cmd.payload };
}

// JSON Schema of one command, for Claude's tool definition.
export function aiCommandJsonSchema() {
  const variants = AI_COMMAND_TYPES.filter(t => COMMAND_REGISTRY[t].supported).map(t => z.object({ type: z.literal(t), payload: unwrapRefine(COMMAND_REGISTRY[t].payload), meta: CommandMeta.optional() }));
  return z.toJSONSchema(z.union(variants as unknown as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]), { unrepresentable: 'any' });
}

// Refinements can't be expressed in JSON Schema; the tool schema uses the plain object and validation re-checks.
function unwrapRefine(s: z.ZodTypeAny): z.ZodTypeAny {
  const def = (s as any)._zod?.def;
  if (def?.type === 'pipe') return unwrapRefine(def.in);
  return s;
}
