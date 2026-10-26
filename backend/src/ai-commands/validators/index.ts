import { BuildingModel, OpeningData, checkOpening } from '../../building-model';
import { MATERIAL_IDS } from '../../studio3d/vocabulary';
import { AICommand, COMMAND_REGISTRY, Target } from '../command-schema';
import { resolveTarget } from './targets';

// Semantic validators: check a shape-valid command against the actual building before anything runs.
// Each returns problems (blocking) and warnings (shown in the preview). Mirrors the studio's own rules so the
// server and the browser agree on what is allowed.

export interface ValidationContext { model: BuildingModel; selection: string | null; designs?: { id: string; title: string }[] }
export interface SemanticResult { ok: boolean; problems: string[]; warnings: string[]; targets: string[]; needsConfirmation: boolean; confirmReason?: string }

const SURFACE_CATEGORIES: Record<string, (keyof typeof MATERIAL_IDS)[]> = {
  'wall.exterior': ['siding'], 'wall.interior': ['interior'], 'opening.frame': ['trim'], 'opening.door': ['door'], roof: ['roofing'], 'room.floor': ['flooring'],
  'component.cabinet': ['cabinet'], 'component.countertop': ['countertop'], 'component.patio': ['hardscape'], 'component.slab': ['hardscape'],
  'component.patio-post': ['siding'], 'component.patio-roof': ['roofing'],
};
const categoryOf = (material: string) => (Object.keys(MATERIAL_IDS) as (keyof typeof MATERIAL_IDS)[]).find(k => (MATERIAL_IDS[k] as readonly string[]).includes(material));

function surfacesOf(m: BuildingModel, id: string): string[] {
  const hit = m.find(id);
  if (!hit) return [];
  const el = hit.el as any;
  if (hit.kind === 'wall') return el.exterior ? ['wall.exterior', 'wall.interior'] : ['wall.interior'];
  if (hit.kind === 'opening') return el.door ? ['opening.frame', 'opening.door'] : ['opening.frame'];
  if (hit.kind === 'roof') return ['roof'];
  if (hit.kind === 'room') return ['room.floor'];
  if (hit.kind === 'component') return [`component.${el.kind}`];
  return [];
}

const BULK_CONFIRM = 12;     // appearance changes touching more elements than this ask first

export function validateMaterial(cmd: AICommand, ctx: ValidationContext): SemanticResult {
  const p = cmd.payload as { target: Target; material?: string; color?: string };
  const targets = resolveTarget(ctx.model, p.target, ctx.selection);
  const out: SemanticResult = { ok: true, problems: [], warnings: [], targets, needsConfirmation: false };
  if (!targets.length) return { ...out, ok: false, problems: [p.target && 'kind' in p.target && p.target.kind === 'selected' ? 'Nothing is selected.' : 'That part of the building wasn’t found.'] };
  if (cmd.type === 'UPDATE_MATERIAL') {
    const cat = categoryOf(p.material!);
    const fits = targets.filter(id => surfacesOf(ctx.model, id).some(s => (SURFACE_CATEGORIES[s] ?? []).includes(cat!)));
    if (!fits.length) return { ...out, ok: false, problems: [`${p.material} can’t go on that surface.`] };
    if (fits.length < targets.length) out.warnings.push(`${targets.length - fits.length} of ${targets.length} matched elements can’t take ${p.material} and will be skipped.`);
    out.targets = fits;
  }
  if (out.targets.length > BULK_CONFIRM) { out.needsConfirmation = true; out.confirmReason = `This changes ${out.targets.length} elements at once.`; }
  return out;
}

// Simulates a move/resize on a copy and runs the same opening checks the studio uses.
export function validateGeometry(cmd: AICommand, ctx: ValidationContext): SemanticResult {
  const out: SemanticResult = { ok: true, problems: [], warnings: [], targets: [], needsConfirmation: true, confirmReason: COMMAND_REGISTRY[cmd.type].risk === 'geometry' ? 'Geometry changes are previewed before they are applied.' : undefined };
  if (cmd.type === 'ADD_COMPONENT') {
    const p = cmd.payload as { side?: 'front' | 'back'; width?: number };
    const side = p.side ?? 'back';
    const wall = ctx.model.walls.find(w => w.exterior && w.face === side && w.floor === ctx.model.floorsByLevel()[0]?.id);
    if (!wall) return { ...out, ok: false, problems: [`There’s no ${side} wall to attach a patio to.`] };
    const len = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
    if ((p.width ?? 192) > len) return { ...out, ok: false, problems: [`The patio can be at most as wide as the house (${Math.round(len / 12)} ft).`] };
    return out;
  }
  const p = cmd.payload as { target: Target; along?: number; up?: number; width?: number; height?: number; depth?: number; sill?: number };
  const targets = resolveTarget(ctx.model, p.target, ctx.selection);
  out.targets = targets;
  if (!targets.length) return { ...out, ok: false, problems: ['kind' in p.target && p.target.kind === 'selected' ? 'Select the element first.' : 'That part of the building wasn’t found.'] };
  if (cmd.type === 'REMOVE_COMPONENT') {
    const comps = targets.map(id => ctx.model.find(id)).filter(h => h?.kind === 'component');
    if (!comps.length) return { ...out, ok: false, problems: ['Only added components (like a patio) can be removed. Walls, floors and roofs can’t be deleted by the assistant.'] };
    if (comps.some(h => ['slab', 'floor-deck'].includes((h!.el as any).kind))) return { ...out, ok: false, problems: ['The foundation and floor framing can’t be removed.'] };
    return out;
  }
  if (targets.length > 1) return { ...out, ok: false, problems: [`That matches ${targets.length} elements. Select the one you mean.`] };
  const hit = ctx.model.find(targets[0])!;
  if (hit.kind === 'wall' || hit.kind === 'room') return { ...out, ok: false, problems: ['Moving walls and resizing rooms isn’t available yet. Windows, doors and components can change.'] };
  if (hit.kind === 'roof') return { ...out, ok: false, problems: ['Roof geometry can’t be edited yet; its material and color can.'] };
  if (hit.kind === 'opening') {
    const o = { ...(hit.el as OpeningData) };
    if (cmd.type === 'MOVE_OBJECT') {
      o.offset += p.along ?? 0;
      if (p.up) { if (o.kind === 'door') return { ...out, ok: false, problems: ['Doors stay on the floor; they can only move sideways.'] }; o.sill += p.up; }
    } else {
      if (p.width != null) o.width = p.width; if (p.height != null) o.height = p.height; if (p.sill != null && o.kind === 'window') o.sill = p.sill;
      if (p.depth != null) out.warnings.push('Openings have no depth; it was ignored.');
    }
    const data = ctx.model.toJSON();
    const sim = BuildingModel.parse({ ...data, openings: data.openings.map(x => (x.id === o.id ? o : x)) });
    const problems = checkOpening(sim, o).map(f => f.message);
    if (problems.length) return { ...out, ok: false, problems };
    return out;
  }
  if (hit.kind === 'component') {
    if (cmd.type === 'MOVE_OBJECT') return { ...out, ok: false, problems: ['Moving components isn’t available yet; they can be resized.'] };
    if (['slab', 'floor-deck'].includes((hit.el as any).kind)) return { ...out, ok: false, problems: ['The foundation and floor framing can’t be resized by the assistant.'] };
    return out;
  }
  return { ...out, ok: false, problems: ['That element can’t be edited that way.'] };
}

export function validateCamera(cmd: AICommand, ctx: ValidationContext): SemanticResult {
  const out: SemanticResult = { ok: true, problems: [], warnings: [], targets: [], needsConfirmation: false };
  if (cmd.type === 'CHANGE_CAMERA') {
    const p = cmd.payload as { preset: string; room?: string };
    if (p.preset === 'room') {
      const q = String(p.room).toLowerCase();
      const room = ctx.model.rooms.find(r => r.name.toLowerCase() === q) ?? ctx.model.rooms.find(r => r.name.toLowerCase().includes(q) || r.type === q);
      if (!room) return { ...out, ok: false, problems: [`There’s no room called “${p.room}”. Rooms: ${ctx.model.rooms.map(r => r.name).join(', ')}.`] };
      out.targets = [room.id];
    }
  }
  if (cmd.type === 'SET_VIEW') {
    const p = cmd.payload as { mode: string; floor?: number };
    if (p.mode === 'floor' && p.floor && !ctx.model.floors.some(f => f.level === p.floor)) return { ...out, ok: false, problems: [`This building has no floor ${p.floor}.`] };
  }
  if (cmd.type === 'SELECT_OBJECT') {
    out.targets = resolveTarget(ctx.model, (cmd.payload as { target: Target }).target, ctx.selection);
    if (!out.targets.length) return { ...out, ok: false, problems: ['That part of the building wasn’t found.'] };
  }
  return out;
}

export function validateProject(cmd: AICommand, ctx: ValidationContext): SemanticResult {
  const out: SemanticResult = { ok: true, problems: [], warnings: [], targets: [], needsConfirmation: false };
  if (cmd.type === 'LOAD_MODEL') {
    const p = cmd.payload as { designId?: string; designName?: string };
    if (p.designName && ctx.designs && !ctx.designs.some(d => d.title.toLowerCase().includes(p.designName!.toLowerCase()))) return { ...out, ok: false, problems: [`There’s no design called “${p.designName}” in this project.`] };
  }
  if (cmd.type === 'RESTORE_DESIGN') { out.needsConfirmation = true; out.confirmReason = 'Restoring replaces what’s on screen with the saved version (you can undo).'; }
  if (cmd.type === 'GENERATE_ESTIMATE') {
    const p = cmd.payload as { alternateNames?: string[] };
    for (const n of p.alternateNames ?? []) if (ctx.designs && !ctx.designs.some(d => d.title.toLowerCase().includes(n.toLowerCase()))) out.warnings.push(`No design called “${n}”; it won’t be compared.`);
  }
  return out;
}

// One entry point: picks the validator by command type.
export function validateAgainstModel(cmd: AICommand, ctx: ValidationContext): SemanticResult {
  switch (cmd.type) {
    case 'UPDATE_MATERIAL': case 'UPDATE_COLOR': return validateMaterial(cmd, ctx);
    case 'MOVE_OBJECT': case 'RESIZE_OBJECT': case 'ADD_COMPONENT': case 'REMOVE_COMPONENT': return validateGeometry(cmd, ctx);
    case 'CHANGE_CAMERA': case 'SET_VIEW': case 'SELECT_OBJECT': return validateCamera(cmd, ctx);
    case 'CREATE_DESIGN_VARIATION': {
      const p = cmd.payload as { commands: { type: 'UPDATE_MATERIAL' | 'UPDATE_COLOR'; payload: Record<string, unknown> }[] };
      const results = p.commands.map(c => validateMaterial({ type: c.type, payload: c.payload, meta: { inferred: [] } }, ctx));
      const problems = results.flatMap(r => r.problems);
      return { ok: !problems.length, problems, warnings: results.flatMap(r => r.warnings), targets: [], needsConfirmation: false };
    }
    default: return validateProject(cmd, ctx);
  }
}

export { resolveTarget };
