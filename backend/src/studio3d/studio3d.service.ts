import { Injectable } from '@nestjs/common';
import { AuthUser } from '../auth/guard';
import { config } from '../config';
import { Db } from '../db';
import { ApiError, badRequest, notFound } from '../errors';
import { BillingMonitorService } from '../billing-monitor/billing-monitor.service';
import { Studio3dAi } from './studio3d-ai';
import { BuildingModel, ModelParseError, buildingModelJsonSchema, errorsOnly, validateBuilding } from '../building-model';

const ID_RE = /^[a-f0-9]{24}$/;
const LIMITS = { projects: 200, designsPerProject: 60, versionsKept: 100, imagesPerProject: 300, dataBytes: 500_000, imageBytes: 1_000_000 };

export const studioEnabled = () => config.STUDIO3D_ENABLED === 'true' || (config.STUDIO3D_ENABLED !== 'false' && config.NODE_ENV !== 'production');

const text = (v: unknown, max: number, fallback = '') => (typeof v === 'string' ? v.trim().slice(0, max) : fallback);

// Checks the saved design document: the structured model (full schema + the same placement rules the
// studio enforces) plus view settings. A model the studio can produce always passes.
function cleanData(data: any) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw badRequest('Design data is missing.');
  let model: BuildingModel;
  try { model = BuildingModel.parse(data.model); }
  catch (e) { if (e instanceof ModelParseError) throw badRequest(e.message, { code: 'MODEL_INVALID', issues: e.issues.slice(0, 20) }); throw e; }
  const errors = errorsOnly(validateBuilding(model));
  if (errors.length) throw badRequest(`The building model has problems: ${errors.slice(0, 3).map(f => f.message).join(' ')}`, { code: 'MODEL_INVALID', findings: errors.slice(0, 20) });
  const out = { model: model.toJSON(), view: data.view && typeof data.view === 'object' ? data.view : {} };
  if (Buffer.byteLength(JSON.stringify(out)) > LIMITS.dataBytes) throw badRequest('That design is too large to save.');
  return out;
}

@Injectable()
export class Studio3dService {
  readonly ai: Studio3dAi;
  constructor(private readonly db: Db, private readonly billing: BillingMonitorService) { this.ai = new Studio3dAi(billing); }

  status() { return { enabled: studioEnabled(), ai: studioEnabled() && this.ai.configured() }; }

  schema() { this.on(); return buildingModelJsonSchema(); }

  // Full check of a model without saving it: parse errors, or every finding (errors and warnings).
  validate(body: any) {
    this.on();
    const { model, error } = BuildingModel.tryParse(body?.model);
    if (!model) return { ok: false, issues: error!.issues.slice(0, 50), findings: [] };
    const findings = validateBuilding(model);
    return { ok: !errorsOnly(findings).length, issues: [], findings };
  }
  private on() { if (!studioEnabled()) throw new ApiError(503, 'The 3D Design Studio isn’t switched on for this site yet.', { code: 'NOT_CONFIGURED' }); }

  private async project(user: AuthUser, id: string) {
    if (!ID_RE.test(id)) throw notFound('Project not found.');
    const p = await this.db.one('SELECT id, name, created_date, updated_date FROM studio_projects WHERE id = $1 AND user_id = $2', [id, user.id]);
    if (!p) throw notFound('Project not found.');
    return p;
  }
  private async design(user: AuthUser, id: string) {
    if (!ID_RE.test(id)) throw notFound('Design not found.');
    const d = await this.db.one('SELECT id, project_id, title, version, data, updated_date FROM studio_designs WHERE id = $1 AND user_id = $2', [id, user.id]);
    if (!d) throw notFound('Design not found.');
    return d;
  }

  listProjects(user: AuthUser) {
    this.on();
    return this.db.query(`SELECT p.id, p.name, p.updated_date, (SELECT count(*)::int FROM studio_designs d WHERE d.project_id = p.id) AS designs
      FROM studio_projects p WHERE p.user_id = $1 ORDER BY p.updated_date DESC LIMIT 200`, [user.id]);
  }

  async createProject(user: AuthUser, body: any) {
    this.on();
    const name = text(body?.name, 120) || 'Untitled project';
    const data = cleanData(body?.design?.data);
    const n = await this.db.one<{ n: number }>('SELECT count(*)::int AS n FROM studio_projects WHERE user_id = $1', [user.id]);
    if ((n?.n ?? 0) >= LIMITS.projects) throw new ApiError(429, `You can keep up to ${LIMITS.projects} projects. Delete one first.`, { code: 'QUOTA' });
    return this.db.tx(async c => {
      const p = (await c.query('INSERT INTO studio_projects(user_id, name) VALUES ($1, $2) RETURNING id, name', [user.id, name])).rows[0];
      const d = (await c.query('INSERT INTO studio_designs(project_id, user_id, title, data) VALUES ($1, $2, $3, $4) RETURNING id, title, version', [p.id, user.id, text(body?.design?.title, 80) || 'Base design', data])).rows[0];
      await c.query('INSERT INTO studio_design_versions(design_id, version, data, note) VALUES ($1, 1, $2, $3)', [d.id, data, 'Created']);
      return { project: p, design: d };
    });
  }

  async getProject(user: AuthUser, id: string) {
    this.on();
    const project = await this.project(user, id);
    const designs = await this.db.query('SELECT id, title, version, updated_date FROM studio_designs WHERE project_id = $1 ORDER BY created_date ASC', [id]);
    const images = await this.db.query('SELECT id, design_id, kind, label, mime, octet_length(bytes)::int AS size, meta, created_date FROM studio_images WHERE project_id = $1 ORDER BY created_date DESC LIMIT 300', [id]);
    return { project, designs, images };
  }

  async createDesign(user: AuthUser, projectId: string, body: any) {
    this.on();
    await this.project(user, projectId);
    const data = cleanData(body?.data);
    const n = await this.db.one<{ n: number }>('SELECT count(*)::int AS n FROM studio_designs WHERE project_id = $1', [projectId]);
    if ((n?.n ?? 0) >= LIMITS.designsPerProject) throw new ApiError(429, `A project can hold up to ${LIMITS.designsPerProject} designs.`, { code: 'QUOTA' });
    return this.db.tx(async c => {
      const d = (await c.query('INSERT INTO studio_designs(project_id, user_id, title, data) VALUES ($1, $2, $3, $4) RETURNING id, project_id, title, version', [projectId, user.id, text(body?.title, 80) || 'Variation', data])).rows[0];
      await c.query('INSERT INTO studio_design_versions(design_id, version, data, note) VALUES ($1, 1, $2, $3)', [d.id, data, 'Created']);
      await c.query('UPDATE studio_projects SET updated_date = now() WHERE id = $1', [projectId]);
      return d;
    });
  }

  async getDesign(user: AuthUser, id: string) { this.on(); return this.design(user, id); }

  // Save = new version. baseVersion guards against two tabs overwriting each other.
  async saveDesign(user: AuthUser, id: string, body: any) {
    this.on();
    const cur = await this.design(user, id);
    const data = cleanData(body?.data);
    if (body?.baseVersion != null && Number(body.baseVersion) !== cur.version) {
      throw new ApiError(409, `This design was saved somewhere else (now version ${cur.version}). Reload it before saving.`, { code: 'VERSION_CONFLICT', version: cur.version });
    }
    const version = cur.version + 1;
    await this.db.tx(async c => {
      const r = await c.query('UPDATE studio_designs SET data = $2, version = $3, title = COALESCE($4, title), updated_date = now() WHERE id = $1 AND version = $5', [id, data, version, text(body?.title, 80) || null, cur.version]);
      if (!r.rowCount) throw new ApiError(409, 'This design changed while saving. Reload it and try again.', { code: 'VERSION_CONFLICT' });
      await c.query('INSERT INTO studio_design_versions(design_id, version, data, note) VALUES ($1, $2, $3, $4)', [id, version, data, text(body?.note, 200) || null]);
      await c.query('DELETE FROM studio_design_versions WHERE design_id = $1 AND version <= $2', [id, version - LIMITS.versionsKept]);
      await c.query('UPDATE studio_projects SET updated_date = now() WHERE id = $1', [cur.project_id]);
    });
    return { id, version, updated_date: new Date().toISOString() };
  }

  async versions(user: AuthUser, id: string) {
    this.on(); await this.design(user, id);
    return this.db.query('SELECT version, note, created_date FROM studio_design_versions WHERE design_id = $1 ORDER BY version DESC LIMIT 100', [id]);
  }

  async version(user: AuthUser, id: string, v: string) {
    this.on(); await this.design(user, id);
    const row = await this.db.one('SELECT version, data, note, created_date FROM studio_design_versions WHERE design_id = $1 AND version = $2', [id, Number(v) || 0]);
    if (!row) throw notFound('That version isn’t saved.');
    return row;
  }

  async saveImage(user: AuthUser, projectId: string, body: unknown, mime: string, q: Record<string, unknown>) {
    this.on();
    await this.project(user, projectId);
    if (!Buffer.isBuffer(body) || !body.length) throw badRequest('Send the image as image/jpeg or image/png.');
    if (body.length > LIMITS.imageBytes) throw badRequest('That image is too large (1 MB max).');
    const isJpeg = body[0] === 0xff && body[1] === 0xd8, isPng = body[0] === 0x89 && body[1] === 0x50;
    if (!(isJpeg && mime === 'image/jpeg') && !(isPng && mime === 'image/png')) throw badRequest('That isn’t a JPEG or PNG image.');
    const n = await this.db.one<{ n: number }>('SELECT count(*)::int AS n FROM studio_images WHERE project_id = $1', [projectId]);
    if ((n?.n ?? 0) >= LIMITS.imagesPerProject) throw new ApiError(429, `A project can hold up to ${LIMITS.imagesPerProject} images.`, { code: 'QUOTA' });
    const designId = typeof q.designId === 'string' && ID_RE.test(q.designId) ? q.designId : null;
    if (designId && !(await this.db.one('SELECT 1 FROM studio_designs WHERE id = $1 AND project_id = $2', [designId, projectId]))) throw badRequest('That design isn’t in this project.');
    let meta: Record<string, unknown> = {};
    try { meta = typeof q.meta === 'string' ? JSON.parse(q.meta) : {}; } catch { meta = {}; }
    if (JSON.stringify(meta).length > 4000) meta = {};
    const label = text(q.label, 120) || 'Presentation image';
    const row = await this.db.one(`INSERT INTO studio_images(project_id, user_id, design_id, kind, label, mime, bytes, meta) VALUES ($1, $2, $3, 'viewport', $4, $5, $6, $7)
      RETURNING id, design_id, kind, label, mime, octet_length(bytes)::int AS size, meta, created_date`, [projectId, user.id, designId, label, mime, body, { ...meta, conceptual: true }]);
    await this.db.query('UPDATE studio_projects SET updated_date = now() WHERE id = $1', [projectId]);
    return row;
  }

  async image(user: AuthUser, id: string) {
    this.on();
    if (!ID_RE.test(id)) throw notFound('Image not found.');
    const row = await this.db.one<{ mime: string; bytes: Buffer }>('SELECT mime, bytes FROM studio_images WHERE id = $1 AND user_id = $2', [id, user.id]);
    if (!row) throw notFound('Image not found.');
    return row;
  }

  async interpret(user: AuthUser, body: any) {
    this.on();
    if (!this.ai.configured()) throw new ApiError(503, 'The AI interpreter needs ANTHROPIC_API_KEY on the server.', { code: 'NOT_CONFIGURED' });
    const message = text(body?.message, 1000);
    if (!message) throw badRequest('Say what you’d like to change or see.');
    const used = await this.db.one<{ n: number }>(`SELECT count(*)::int AS n FROM studio_ai_usage WHERE user_id = $1 AND at > now() - interval '1 day'`, [user.id]);
    if ((used?.n ?? 0) >= config.STUDIO3D_AI_PER_DAY) throw new ApiError(429, 'You’ve reached today’s limit for AI design requests. Buttons and simple requests still work.', { code: 'QUOTA_DAY' });
    const guard = await this.billing.guard.check({ userId: user.id, workflow: 'studio3d', providers: ['claude'] });
    if (guard.blocked || guard.pausedProviders.includes('claude')) throw new ApiError(503, 'AI design requests are paused for now because a spending limit was reached. Buttons and simple requests still work.', { code: 'BUDGET' });
    const history = (Array.isArray(body?.history) ? body.history : []).filter((h: unknown) => typeof h === 'string').slice(-4).map((h: string) => h.slice(0, 300));
    await this.db.query('INSERT INTO studio_ai_usage(user_id) VALUES ($1)', [user.id]);
    try {
      return await this.ai.interpret({ message, context: body?.context ?? {}, history, userId: user.id });
    } catch (e: any) {
      throw new ApiError(502, 'The AI interpreter didn’t answer. Try again, or use the buttons.', { code: 'AI_ERROR', detail: e?.status ?? undefined });
    }
  }
}
