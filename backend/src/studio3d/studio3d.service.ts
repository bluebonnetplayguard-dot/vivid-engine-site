import { Injectable } from '@nestjs/common';
import { AuthUser } from '../auth/guard';
import { config } from '../config';
import { Db } from '../db';
import { ApiError, badRequest, notFound } from '../errors';
import { InterpreterService } from '../ai-commands/interpreter.service';
import { toStudioCommand } from '../ai-commands/command-schema';
import { BuildingModel, ModelParseError, buildingModelJsonSchema, errorsOnly, validateBuilding } from '../building-model';
import { GeometryReader } from '../geometry-reader';

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
  constructor(private readonly db: Db, private readonly interpreter: InterpreterService) {}

  status() { return { enabled: studioEnabled(), ai: studioEnabled() && this.interpreter.available() }; }

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

  // Measured geometry of a saved design (current version, or ?version=n).
  async geometry(user: AuthUser, id: string, version?: string) {
    this.on();
    const d = await this.design(user, id);
    let data = d.data;
    if (version) {
      const row = await this.db.one('SELECT data FROM studio_design_versions WHERE design_id = $1 AND version = $2', [id, Number(version) || 0]);
      if (!row) throw notFound('That version isn’t saved.');
      data = row.data;
    }
    const model = BuildingModel.parse(data.model);
    return { designId: id, version: version ? Number(version) : d.version, geometry: GeometryReader.read(model) };
  }

  // Measured geometry of an unsaved model (what's on screen right now).
  readGeometry(body: any) {
    this.on();
    let model: BuildingModel;
    try { model = BuildingModel.parse(body?.model); }
    catch (e) { if (e instanceof ModelParseError) throw badRequest(e.message, { code: 'MODEL_INVALID', issues: e.issues.slice(0, 20) }); throw e; }
    return { geometry: GeometryReader.read(model) };
  }

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

  // The studio's assistant endpoint, kept for the 3D Studio UI. It runs the unified interpreter
  // (/api/ai/assistant) and returns the studio's flat command format. Commands the studio can't run itself
  // (estimates, proposals, project loads) are reported, not dropped silently.
  private static readonly STUDIO_RUNNABLE = new Set(['SELECT_OBJECT', 'UPDATE_MATERIAL', 'UPDATE_COLOR', 'MOVE_OBJECT', 'RESIZE_OBJECT', 'ADD_COMPONENT', 'REMOVE_COMPONENT',
    'CHANGE_CAMERA', 'SET_VIEW', 'TOGGLE_LAYER', 'SET_LIGHTING', 'GENERATE_RENDER', 'CREATE_DESIGN_VARIATION', 'SAVE_DESIGN']);
  async interpret(user: AuthUser, body: any) {
    this.on();
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!message) throw badRequest('Say what you’d like to change or see.');
    const ctx = body?.context ?? {};
    const r = await this.interpreter.assistant(user, {
      message, model: body?.model, projectId: body?.projectId, designId: body?.designId,
      selection: typeof ctx?.selection?.id === 'string' ? ctx.selection.id : body?.selection ?? null,
      history: Array.isArray(body?.history) ? body.history : [],
    });
    const runnable = r.commands.filter(c => Studio3dService.STUDIO_RUNNABLE.has(c.command.type));
    const elsewhere = r.commands.filter(c => !Studio3dService.STUDIO_RUNNABLE.has(c.command.type));
    return {
      reply: r.clarification && !runnable.length ? r.clarification : r.reply,
      commands: runnable.map(c => toStudioCommand(c.command)),
      confirm: runnable.map(c => ({ type: c.command.type, needsConfirmation: c.needsConfirmation, reason: c.confirmReason ?? null, warnings: c.warnings })),
      dropped: [...r.rejected.map(x => x.reason), ...elsewhere.map(c => `${c.command.type} runs from the project tools, not the 3D view.`)],
      engine: r.engine === 'cache' ? 'Claude (cached)' : 'Claude',
      logId: r.logId,
    };
  }

}
