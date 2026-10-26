import { Injectable } from '@nestjs/common';
import { AuthUser } from '../auth/guard';
import { BillingMonitorService } from '../billing-monitor/billing-monitor.service';
import { BuildingModel } from '../building-model';
import { config } from '../config';
import { Db } from '../db';
import { ApiError, badRequest, notFound } from '../errors';
import { ClaudeCommandModel, CommandModel } from './claude-interpreter';
import { InterpretCache, InterpretResult, interpret } from './interpreter';

const ID_RE = /^[a-f0-9]{24}$/;
const STATUS = ['executed', 'partially-executed', 'rejected', 'undone', 'redone'] as const;
type Status = (typeof STATUS)[number] | 'proposed';
// Allowed transitions for the audit trail (undo/redo hooks).
const NEXT: Record<Status, Status[]> = {
  proposed: ['executed', 'partially-executed', 'rejected'],
  executed: ['undone'], 'partially-executed': ['undone'], undone: ['redone'], redone: ['undone'], rejected: [],
};

export interface AssistantRequest {
  message: string;
  projectId?: string;
  designId?: string;
  model?: unknown;          // the model on screen (unsaved edits included); otherwise the saved design is used
  selection?: string | null;
  history?: string[];
}

@Injectable()
export class InterpreterService {
  readonly cache = new InterpretCache();
  model: CommandModel;

  constructor(private readonly db: Db, private readonly billing: BillingMonitorService) { this.model = new ClaudeCommandModel(billing); }

  available() { return this.model.available(); }

  private async project(user: AuthUser, id: string) {
    if (!ID_RE.test(id)) throw notFound('Project not found.');
    const p = await this.db.one('SELECT id FROM studio_projects WHERE id = $1 AND user_id = $2', [id, user.id]);
    if (!p) throw notFound('Project not found.');
  }

  // POST /api/ai/assistant
  async assistant(user: AuthUser, body: AssistantRequest): Promise<InterpretResult & { logId: string }> {
    const message = typeof body?.message === 'string' ? body.message.trim().slice(0, 1000) : '';
    if (!message) throw badRequest('Say what you’d like to do.');
    if (!this.model.available()) throw new ApiError(503, 'The AI assistant needs ANTHROPIC_API_KEY on the server. Buttons and common requests still work.', { code: 'NOT_CONFIGURED' });

    // The building: what's on screen when the client sends it, else the saved design.
    let designs: { id: string; title: string; version: number }[] = [];
    let designVersion: number | null = null;
    const projectId = typeof body.projectId === 'string' ? body.projectId : null;
    const designId = typeof body.designId === 'string' ? body.designId : null;
    if (projectId) {
      await this.project(user, projectId);
      designs = await this.db.query('SELECT id, title, version FROM studio_designs WHERE project_id = $1 ORDER BY created_date', [projectId]);
      if (designId && !designs.some(d => d.id === designId)) throw notFound('Design not found.');
      designVersion = designs.find(d => d.id === designId)?.version ?? null;
    } else if (designId) throw badRequest('Send projectId with designId.');
    let raw = body.model;
    if (raw == null && designId) raw = (await this.db.one<{ data: any }>('SELECT data FROM studio_designs WHERE id = $1', [designId]))?.data?.model;
    if (raw == null) throw badRequest('Open a design first.');
    const parsed = BuildingModel.tryParse(raw);
    if (!parsed.model) throw badRequest(parsed.error!.message, { code: 'MODEL_INVALID' });
    const selection = typeof body.selection === 'string' && parsed.model.find(body.selection) ? body.selection : null;
    const history = (Array.isArray(body.history) ? body.history : []).filter((h): h is string => typeof h === 'string').slice(-4).map(h => h.slice(0, 300));

    // Limits: per-user daily cap and the Billing Monitor's budgets (only for real model calls).
    const used = await this.db.one<{ n: number }>(`SELECT count(*)::int AS n FROM ai_command_log WHERE user_id = $1 AND engine = 'claude' AND created_date > now() - interval '1 day'`, [user.id]);
    if ((used?.n ?? 0) >= config.STUDIO3D_AI_PER_DAY) throw new ApiError(429, 'You’ve reached today’s limit for AI requests. Buttons and common requests still work.', { code: 'QUOTA_DAY' });
    const guard = await this.billing.guard.check({ userId: user.id, workflow: 'ai_assistant', providers: ['claude'] });
    if (guard.blocked || guard.pausedProviders.includes('claude')) throw new ApiError(503, 'AI requests are paused for now because a spending limit was reached. Buttons and common requests still work.', { code: 'BUDGET' });

    let result: InterpretResult;
    try {
      result = await interpret({ message, model: parsed.model, selection, designs, history, userId: user.id }, this.model, this.cache);
    } catch (e: any) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(502, 'The AI assistant didn’t answer. Try again, or use the buttons.', { code: 'AI_ERROR' });
    }
    const row = await this.db.one<{ id: string }>(`INSERT INTO ai_command_log(user_id, project_id, design_id, design_version, message, engine, reply, commands, rejected, status, history)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [user.id, projectId, designId, designVersion, message, result.engine, result.reply, JSON.stringify(result.commands), JSON.stringify(result.rejected),
        result.commands.length ? 'proposed' : 'rejected', JSON.stringify([{ status: result.commands.length ? 'proposed' : 'rejected', at: new Date().toISOString() }])]);
    return { ...result, logId: row!.id };
  }

  // POST /api/ai/commands/:id/status { status, version?, note?, executed?: number } — undo/redo hooks.
  async setStatus(user: AuthUser, id: string, body: any) {
    if (!ID_RE.test(id)) throw notFound('Command log entry not found.');
    const status = body?.status as Status;
    if (!(STATUS as readonly string[]).includes(status)) throw badRequest(`status must be one of ${STATUS.join(', ')}.`);
    const row = await this.db.one<{ status: Status }>('SELECT status FROM ai_command_log WHERE id = $1 AND user_id = $2', [id, user.id]);
    if (!row) throw notFound('Command log entry not found.');
    if (!NEXT[row.status].includes(status)) throw new ApiError(409, `A ${row.status} entry can’t become ${status}.`, { code: 'BAD_TRANSITION' });
    const entry = { status, at: new Date().toISOString(), ...(Number.isInteger(body?.version) ? { version: body.version } : {}), ...(typeof body?.note === 'string' ? { note: body.note.slice(0, 200) } : {}) };
    return this.db.one(`UPDATE ai_command_log SET status = $3, history = history || $4::jsonb, updated_date = now() WHERE id = $1 AND user_id = $2
      RETURNING id, status, history, updated_date`, [id, user.id, status, JSON.stringify([entry])]);
  }

  // GET /api/ai/commands?projectId=&limit= — the audit trail.
  async log(user: AuthUser, projectId?: string, limit = 50) {
    if (projectId) await this.project(user, projectId);
    const n = Math.min(200, Math.max(1, Number(limit) || 50));
    return this.db.query(`SELECT id, project_id, design_id, design_version, message, engine, reply, commands, rejected, status, history, created_date
      FROM ai_command_log WHERE user_id = $1 AND ($2::text IS NULL OR project_id = $2) ORDER BY created_date DESC LIMIT $3`, [user.id, projectId ?? null, n]);
  }
}
