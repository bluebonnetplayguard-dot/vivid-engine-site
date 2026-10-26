import { Injectable, Logger } from '@nestjs/common';
import { AuthUser } from '../../auth/guard';
import { BuildingModel } from '../../building-model';
import { Db } from '../../db';
import { ApiError, badRequest } from '../../errors';
import { EstimatingService } from '../../estimating/estimating.service';
import { ProposalService } from '../../proposal/proposal.service';
import { Studio3dService } from '../../studio3d/studio3d.service';
import { TakeoffService } from '../../takeoff/takeoff.service';
import { AICommand, COMMAND_REGISTRY, toStudioCommand, validateAICommand } from '../command-schema';
import { InterpreterService } from '../interpreter.service';
import { validateAgainstModel } from '../validators';
import { loadStudioCore } from './studio-core';

// Routes validated commands to the module that executes them.
//
//   studio appearance / geometry  → applied to the design with the studio's own code; saved as ONE new version
//   studio view (camera, layers, lighting, selection), GENERATE_RENDER → run in the browser ("client")
//   CREATE_DESIGN_VARIATION       → new design in the project
//   SAVE_DESIGN / RESTORE_DESIGN / LOAD_MODEL → project system
//   CALCULATE_MATERIALS           → takeoff job (progress stream URL returned)
//   GENERATE_ESTIMATE             → estimating engine (new estimate version)
//   PRODUCE_PROPOSAL              → proposal generator
//
// The client's plan is never trusted: every command is validated again here against the saved design, and a command
// whose validation says it needs confirmation only runs with confirmed: true.

export type ResultStatus = 'applied' | 'previewed' | 'client' | 'queued' | 'done' | 'needs-confirmation' | 'needs-input' | 'rejected' | 'failed';
export interface CommandResult { index: number; type: string; status: ResultStatus; message: string; changes?: string[]; data?: Record<string, unknown> }
export interface ExecuteRequest {
  projectId: string; designId: string; mode?: 'preview' | 'apply'; baseVersion?: number; logId?: string; message?: string;
  selection?: string | null;
  company?: { name: string; phone?: string; email?: string; address?: string; license?: string };
  commands: { command: unknown; confirmed?: boolean }[];
}
export interface ExecuteResponse { mode: 'preview' | 'apply'; designId: string; version: number; savedVersion: number | null; results: CommandResult[]; summary: string }

const MODEL_CHANGING = new Set(['UPDATE_MATERIAL', 'UPDATE_COLOR', 'MOVE_OBJECT', 'RESIZE_OBJECT', 'ADD_COMPONENT', 'REMOVE_COMPONENT']);
const CLIENT_ONLY = new Set(['SELECT_OBJECT', 'CHANGE_CAMERA', 'SET_VIEW', 'TOGGLE_LAYER', 'SET_LIGHTING', 'GENERATE_RENDER']);
const COMPUTE = new Set(['CALCULATE_MATERIALS', 'GENERATE_ESTIMATE', 'PRODUCE_PROPOSAL']);

@Injectable()
export class CommandRouterService {
  private readonly log = new Logger('CommandRouter');
  constructor(
    private readonly db: Db,
    private readonly studio: Studio3dService,
    private readonly takeoffs: TakeoffService,
    private readonly estimates: EstimatingService,
    private readonly proposals: ProposalService,
    private readonly interpreter: InterpreterService,
  ) {}

  async execute(user: AuthUser, req: ExecuteRequest): Promise<ExecuteResponse> {
    const mode = req?.mode === 'preview' ? 'preview' : 'apply';
    if (!req || typeof req.projectId !== 'string' || typeof req.designId !== 'string') throw badRequest('Send projectId and designId.');
    if (!Array.isArray(req.commands) || !req.commands.length) throw badRequest('Send at least one command.');
    if (req.commands.length > 25) throw badRequest('At most 25 commands at once.');
    const design = await this.studio.getDesign(user, req.designId);            // ownership + flag + 404
    if (design.project_id !== req.projectId) throw badRequest('That design isn’t in this project.');
    if (req.baseVersion != null && req.baseVersion !== design.version) {
      throw new ApiError(409, `The design was saved since (now version ${design.version}). Reload it and try again.`, { code: 'VERSION_CONFLICT', version: design.version });
    }
    const designs = await this.db.query<{ id: string; title: string; version: number }>('SELECT id, title, version FROM studio_designs WHERE project_id = $1 ORDER BY created_date', [req.projectId]);
    let working: any = design.data.model;
    let changed = false;
    const changeNotes: string[] = [];
    const results: CommandResult[] = [];
    const deferred: { index: number; command: AICommand }[] = [];
    const core = await loadStudioCore();

    for (let index = 0; index < req.commands.length; index++) {
      const item = req.commands[index];
      const v = validateAICommand(item?.command);
      if (v.ok !== true) { const e = (v as Extract<typeof v, { ok: false }>).error; results.push({ index, type: e.type ?? 'unknown', status: 'rejected', message: e.message }); continue; }
      const cmd = v.command;
      const model = BuildingModel.parse(working);
      const sem = validateAgainstModel(cmd, { model, selection: req.selection ?? null, designs });
      if (!sem.ok) { results.push({ index, type: cmd.type, status: 'rejected', message: sem.problems.join(' ') }); continue; }
      const needsConfirm = v.needsConfirmation || sem.needsConfirmation;
      if (mode === 'apply' && needsConfirm && item.confirmed !== true) {
        results.push({ index, type: cmd.type, status: 'needs-confirmation', message: sem.confirmReason ?? v.confirmReason ?? 'Confirm this change first.', data: { warnings: sem.warnings } });
        continue;
      }

      if (MODEL_CHANGING.has(cmd.type)) {
        const r = core.applyModelCommand(working, toStudioCommand(cmd), { selection: req.selection ?? null });
        if (r.error) { results.push({ index, type: cmd.type, status: 'rejected', message: r.error }); continue; }
        working = r.model; changed = true; changeNotes.push(...(r.changes ?? []));
        results.push({ index, type: cmd.type, status: mode === 'preview' ? 'previewed' : 'applied', message: (r.changes ?? []).join('; ') || 'Changed.', changes: r.changes, data: { ids: r.ids ?? [] } });
      } else if (CLIENT_ONLY.has(cmd.type)) {
        results.push({ index, type: cmd.type, status: 'client', message: cmd.type === 'GENERATE_RENDER' ? 'Capture this in the 3D view (Render saves it to the project).' : 'Runs in the 3D view.', data: { studioCommand: toStudioCommand(cmd) } });
      } else if (cmd.type === 'RESTORE_DESIGN') {
        const p = cmd.payload as { version: number; designId?: string };
        if (p.designId && p.designId !== req.designId) { results.push({ index, type: cmd.type, status: 'rejected', message: 'Restore works on the open design.' }); continue; }
        const row = await this.studio.version(user, req.designId, String(p.version)).catch(() => null);
        if (!row) { results.push({ index, type: cmd.type, status: 'rejected', message: `Version ${p.version} isn’t saved.` }); continue; }
        working = row.data.model; changed = true; changeNotes.push(`Restored version ${p.version}`);
        results.push({ index, type: cmd.type, status: mode === 'preview' ? 'previewed' : 'applied', message: `Restored version ${p.version}.` });
      } else if (cmd.type === 'LOAD_MODEL') {
        const p = cmd.payload as { designId?: string; designName?: string };
        const d = designs.find(x => x.id === p.designId) ?? designs.find(x => p.designName && x.title.toLowerCase().includes(p.designName.toLowerCase()));
        results.push(d ? { index, type: cmd.type, status: 'client', message: `Open “${d.title}”.`, data: { designId: d.id } } : { index, type: cmd.type, status: 'rejected', message: 'That design isn’t in this project.' });
      } else {
        deferred.push({ index, command: cmd });   // variations, saves and compute run after the edits are saved
      }
    }

    // Save the edits as one new version (apply mode), so takeoffs and estimates below see them.
    let version = design.version;
    let savedVersion: number | null = null;
    if (changed && mode === 'apply') {
      const note = `AI: ${(req.message ?? changeNotes.join('; ')).slice(0, 180)}`;
      const saved = await this.studio.saveDesign(user, req.designId, { data: { model: working, view: design.data.view ?? {} }, baseVersion: design.version, note });
      version = savedVersion = saved.version;
    }

    for (const { index, command: cmd } of deferred) {
      try {
        if (mode === 'preview') { results.push({ index, type: cmd.type, status: 'previewed', message: `${COMMAND_REGISTRY[cmd.type].summary} (runs when applied).` }); continue; }
        results.push({ index, ...(await this.runDeferred(user, req, cmd, working, version)) });
      } catch (e: any) {
        const message = e instanceof ApiError ? e.message : 'That step failed. Try again.';
        if (!(e instanceof ApiError)) this.log.error(`${cmd.type} failed: ${e?.stack || e}`);
        results.push({ index, type: cmd.type, status: 'failed', message });
      }
    }
    results.sort((a, b) => a.index - b.index);

    if (mode === 'apply' && req.logId) {
      const ran = results.filter(r => ['applied', 'client', 'queued', 'done'].includes(r.status)).length;
      const waiting = results.some(r => r.status === 'needs-confirmation' || r.status === 'needs-input');
      const status = ran === 0 ? (waiting ? null : 'rejected') : ran === results.length ? 'executed' : 'partially-executed';
      if (status) await this.interpreter.setStatus(user, req.logId, { status, ...(savedVersion ? { version: savedVersion } : {}) }).catch(e => this.log.warn(`log ${req.logId}: ${e?.message}`));
    }
    const count = (s: ResultStatus) => results.filter(r => r.status === s).length;
    const summary = [
      count('applied') && `${count('applied')} change${count('applied') > 1 ? 's' : ''} applied${savedVersion ? ` (saved as version ${savedVersion})` : ''}`,
      count('previewed') && `${count('previewed')} previewed`,
      count('client') && `${count('client')} for the 3D view`,
      (count('queued') + count('done')) && `${count('queued') + count('done')} run`,
      count('needs-confirmation') && `${count('needs-confirmation')} waiting for your confirmation`,
      count('needs-input') && `${count('needs-input')} need more information`,
      (count('rejected') + count('failed')) && `${count('rejected') + count('failed')} not done`,
    ].filter(Boolean).join(', ') || 'Nothing to do.';
    return { mode, designId: req.designId, version, savedVersion, results, summary };
  }

  private async runDeferred(user: AuthUser, req: ExecuteRequest, cmd: AICommand, working: any, version: number): Promise<Omit<CommandResult, 'index'>> {
    const p = cmd.payload as any;
    switch (cmd.type) {
      case 'CREATE_DESIGN_VARIATION': {
        const core = await loadStudioCore();
        const flat = toStudioCommand(cmd) as { name: string; commands: Record<string, unknown>[] };
        const r = core.applyAll(working, flat.commands, { selection: req.selection ?? null });
        if (r.error) return { type: cmd.type, status: 'rejected', message: r.error };
        const d = await this.studio.createDesign(user, req.projectId, { title: flat.name, data: { model: r.model, view: {} } });
        return { type: cmd.type, status: 'done', message: `Created “${flat.name}”.`, changes: r.changes, data: { designId: d.id } };
      }
      case 'SAVE_DESIGN':
        return { type: cmd.type, status: 'done', message: `The design is saved (version ${version}).`, data: { version } };
      case 'CALCULATE_MATERIALS': {
        const run = await this.takeoffs.start(user, req.projectId, { designId: p.designId ?? req.designId, settings: p.settings });
        return { type: cmd.type, status: run.status === 'done' ? 'done' : 'queued', message: run.status === 'done' ? 'Takeoff ready.' : 'Takeoff started.',
          data: { takeoffId: run.id, cached: !!run.cached, progressUrl: `/api/projects/${req.projectId}/takeoffs/${run.id}/events`, resultUrl: `/api/projects/${req.projectId}/takeoffs/${run.id}` } };
      }
      case 'GENERATE_ESTIMATE': {
        const designs = await this.db.query<{ id: string; title: string }>('SELECT id, title FROM studio_designs WHERE project_id = $1', [req.projectId]);
        const byName = (n: string) => designs.find(d => d.title.toLowerCase().includes(n.toLowerCase()))?.id;
        const alternates = [...(p.alternates ?? []), ...((p.alternateNames ?? []) as string[]).map(byName).filter(Boolean)];
        const e: any = await this.estimates.create(user, req.projectId, { designId: p.designId ?? req.designId, alternates, settings: p.settings, note: p.note ?? 'Requested from the AI assistant' });
        const price = Number(e.price);
        return { type: cmd.type, status: 'done', message: `Estimate version ${e.version}: $${Math.round(price).toLocaleString('en-US')}${e.result.alternates.length ? `, with ${e.result.alternates.length} option${e.result.alternates.length > 1 ? 's' : ''}` : ''}.`,
          data: { estimateVersion: e.version, price, flags: e.result.flags.map((f: any) => f.message) } };
      }
      case 'PRODUCE_PROPOSAL': {
        let estimateVersion = p.estimateVersion as number | undefined;
        if (!estimateVersion) estimateVersion = (await this.db.one<{ version: number }>('SELECT max(version) AS version FROM estimates WHERE project_id = $1', [req.projectId]))?.version ?? undefined;
        if (!estimateVersion) return { type: cmd.type, status: 'needs-input', message: 'Price the design first (create an estimate), then I can write the proposal.' };
        const last = await this.db.one<{ options: any }>('SELECT options FROM proposal_exports WHERE project_id = $1 ORDER BY created_date DESC LIMIT 1', [req.projectId]);
        const company = req.company ?? last?.options?.company;
        if (!company?.name) return { type: cmd.type, status: 'needs-input', message: 'Add your company name (and any contact details) for the proposal.', data: { needs: ['company'] } };
        const r = await this.proposals.generate(user, req.projectId, String(estimateVersion), {
          company, customer: last?.options?.customer ?? { name: '' }, tone: p.tone ?? last?.options?.tone ?? 'friendly',
          includeAlternates: p.includeAlternates ?? true, ...(last?.options?.terms ? { terms: last.options.terms } : {}),
        });
        return { type: cmd.type, status: 'done', message: `Proposal written from estimate version ${estimateVersion} ($${r.proposal.total.toLocaleString('en-US')}).`,
          data: { proposalId: r.id, notices: r.proposal.notices, markdownUrl: `/api/projects/${req.projectId}/proposals/${r.id}/markdown` } };
      }
      default:
        return { type: cmd.type, status: 'rejected', message: COMMAND_REGISTRY[cmd.type].unsupportedReason ?? 'That isn’t available.' };
    }
  }
}
