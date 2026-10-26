import { createHash } from 'node:crypto';
import { BuildingModel } from '../building-model';
import { CommandModel } from './claude-interpreter';
import { AICommand, CommandError, COMMAND_REGISTRY, Risk, validateBatch } from './command-schema';
import { guardDimensions } from './dimension-guard';
import { validateAgainstModel } from './validators';

// Natural language → validated, safety-checked commands. The pipeline:
//   1. build a compact context of the building (ids, names, faces, finishes; no geometry dumps)
//   2. ask the command model (Claude) for commands + reply (cached for identical requests on the same model state)
//   3. shape-validate every command (schema, registry, supported)
//   4. dimension guard: sizes the contractor didn't say become meta.inferred → confirmation
//   5. validate against the building (targets, surfaces, opening fit, protected elements)
//   6. classify: what runs instantly, what needs a preview/confirmation, what was rejected and why

export interface InterpretInput {
  message: string;
  model: BuildingModel;
  selection: string | null;
  designs: { id: string; title: string; version: number }[];
  history: string[];
  userId: string;
}

export interface PlannedCommand {
  command: AICommand;
  risk: Risk;
  needsConfirmation: boolean;
  confirmReason?: string;
  warnings: string[];
  targets: string[];
}

export interface RejectedCommand { type: string; reason: string; command?: AICommand }

export interface InterpretResult {
  reply: string;
  clarification?: string;
  commands: PlannedCommand[];
  rejected: RejectedCommand[];
  engine: 'claude' | 'cache';
  cacheKey: string;
}

export function buildContext(m: BuildingModel, selection: string | null, designs: InterpretInput['designs']) {
  const faceOf = new Map(m.walls.map(w => [w.id, w.face]));
  const floorOf = new Map(m.walls.map(w => [w.id, w.floor]));
  const sel = selection ? m.find(selection) : null;
  return {
    selection: sel ? { id: selection, kind: sel.kind, name: (sel.el as any).name } : null,
    floors: m.floors.map(f => ({ id: f.id, name: f.name, level: f.level })),
    walls: m.walls.map(w => ({ id: w.id, name: w.name, floor: w.floor, face: w.face, exterior: w.exterior, finish: w.exterior ? w.finishExterior : w.finishInterior })),
    openings: m.openings.map(o => ({ id: o.id, name: o.name, kind: o.kind, face: faceOf.get(o.wall) ?? null, floor: floorOf.get(o.wall) })),
    rooms: m.rooms.map(r => ({ id: r.id, name: r.name, floor: r.floor, floorFinish: r.floorFinish })),
    roofs: m.roofs.map(r => ({ id: r.id, name: r.name, material: r.material, pitch: r.pitch })),
    components: m.components.map(c => ({ id: c.id, name: c.name, kind: c.kind, material: c.material })),
    designs: designs.map(d => ({ id: d.id, title: d.title, version: d.version })),
    modelSource: m.data.meta.source,
  };
}

// Small LRU for repeated requests. The key includes the model state, the selection and the message, so a cached
// answer is only reused for exactly the same situation; it is re-validated every time anyway.
export class InterpretCache {
  private readonly map = new Map<string, { at: number; answer: { reply: string; clarification?: string; commands: unknown[] } }>();
  constructor(private readonly max = 500, private readonly ttlMs = 10 * 60_000) {}
  get(k: string) {
    const hit = this.map.get(k);
    if (!hit) return null;
    if (Date.now() - hit.at > this.ttlMs) { this.map.delete(k); return null; }
    this.map.delete(k); this.map.set(k, hit);
    return hit.answer;
  }
  set(k: string, answer: { reply: string; clarification?: string; commands: unknown[] }) {
    this.map.set(k, { at: Date.now(), answer });
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value!);
  }
  get size() { return this.map.size; }
}

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');

export async function interpret(input: InterpretInput, model: CommandModel, cache: InterpretCache): Promise<InterpretResult> {
  const context = buildContext(input.model, input.selection, input.designs);
  const cacheKey = createHash('sha256').update(JSON.stringify([normalize(input.message), input.selection, input.model.toJSON(), input.designs.map(d => d.id)])).digest('hex');
  let engine: InterpretResult['engine'] = 'cache';
  let answer = input.history.length ? null : cache.get(cacheKey);   // follow-ups depend on history: never cached
  if (!answer) {
    answer = await model.interpret({ message: input.message, context, history: input.history, userId: input.userId });
    engine = 'claude';
    if (!input.history.length) cache.set(cacheKey, { reply: answer.reply, clarification: answer.clarification, commands: answer.commands });
  }

  const { valid, errors } = validateBatch(answer.commands);
  const rejected: RejectedCommand[] = errors.map((e: CommandError) => ({ type: e.type ?? 'unknown', reason: e.message }));
  const commands: PlannedCommand[] = [];
  for (const v of valid) {
    const { command, added } = guardDimensions(v.command, input.message);
    const sem = validateAgainstModel(command, { model: input.model, selection: input.selection, designs: input.designs });
    if (!sem.ok) { rejected.push({ type: command.type, reason: sem.problems.join(' '), command }); continue; }
    const risk = COMMAND_REGISTRY[command.type].risk;
    const inferredSizes = command.meta.inferred.filter(f => ['along', 'up', 'width', 'height', 'depth', 'sill'].includes(f));
    const needsConfirmation = v.needsConfirmation || sem.needsConfirmation;
    const confirmReason = inferredSizes.length
      ? `The assistant chose ${inferredSizes.join(' and ')} without you giving ${inferredSizes.length > 1 ? 'those sizes' : 'a size'}. Check before applying.`
      : sem.confirmReason ?? v.confirmReason;
    const warnings = [...sem.warnings, ...(added.length ? [`Size${added.length > 1 ? 's' : ''} you didn't state: ${added.join(', ')}.`] : [])];
    commands.push({ command, risk, needsConfirmation, confirmReason: needsConfirmation ? confirmReason : undefined, warnings, targets: sem.targets });
  }

  let reply = answer.reply || (commands.length ? 'Done.' : '');
  if (!commands.length && rejected.length && !answer.clarification) reply = `${reply ? `${reply} ` : ''}I couldn't do that: ${rejected[0].reason}`.trim();
  if (!reply && answer.clarification) reply = answer.clarification;
  return { reply, clarification: answer.clarification, commands, rejected, engine, cacheKey };
}
