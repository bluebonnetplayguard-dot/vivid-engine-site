import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AuthUser } from '../auth/guard';
import { BuildingModel } from '../building-model';
import { Db } from '../db';
import { ApiError, badRequest, notFound } from '../errors';
import { GeometryReader } from '../geometry-reader';
import { studioEnabled } from '../studio3d/studio3d.service';
import { buildTakeoff, cleanSettings } from './engine';
import { TakeoffResult } from './types';

const ID_RE = /^[a-f0-9]{24}$/;
const ENGINE_VERSION = 'gc-takeoff/1';
const STALE_AFTER_MS = 10 * 60_000;      // a job still "running" after this is treated as lost (server restart)

export interface TakeoffRow {
  id: string; project_id: string; design_id: string; design_version: number; status: 'queued' | 'running' | 'done' | 'failed';
  progress: number; stage: string | null; result?: TakeoffResult | null; error: string | null;
  created_date: string; finished_date: string | null; cached?: boolean; stale?: boolean;
}

// Runs takeoffs as background jobs in this process. Jobs live in the takeoffs table, so a restart resumes
// whatever was queued. Results are cached by a hash of (engine version, model, settings).
@Injectable()
export class TakeoffService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Takeoffs');
  private readonly queue: string[] = [];
  private running = false;
  private stopped = false;

  constructor(private readonly db: Db) {}

  async onModuleInit() {
    try {
      await this.db.query(`UPDATE takeoffs SET status = 'queued', progress = 0, stage = 'Requeued after restart' WHERE status = 'running' AND started_date < now() - $1::interval`, [`${STALE_AFTER_MS / 1000} seconds`]);
      const pending = await this.db.query<{ id: string }>(`SELECT id FROM takeoffs WHERE status = 'queued' ORDER BY created_date LIMIT 200`);
      for (const r of pending) this.enqueue(r.id);
    } catch (e: any) { this.log.warn(`Couldn't resume takeoff jobs: ${e?.message}`); }
  }
  onModuleDestroy() { this.stopped = true; }

  private on() { if (!studioEnabled()) throw new ApiError(503, 'The 3D Design Studio isn’t switched on for this site yet.', { code: 'NOT_CONFIGURED' }); }

  private async project(user: AuthUser, id: string) {
    if (!ID_RE.test(id)) throw notFound('Project not found.');
    const p = await this.db.one('SELECT id, name FROM studio_projects WHERE id = $1 AND user_id = $2', [id, user.id]);
    if (!p) throw notFound('Project not found.');
    return p;
  }

  // Loads the design's model at a version (current when omitted). Throws 400 when the model can't be read.
  private async loadModel(projectId: string, designId: string, version?: number) {
    if (!ID_RE.test(designId)) throw notFound('Design not found.');
    const d = await this.db.one<{ id: string; version: number; data: any }>('SELECT id, version, data FROM studio_designs WHERE id = $1 AND project_id = $2', [designId, projectId]);
    if (!d) throw notFound('Design not found.');
    let data = d.data, v = d.version;
    if (version != null && version !== d.version) {
      const row = await this.db.one<{ data: any }>('SELECT data FROM studio_design_versions WHERE design_id = $1 AND version = $2', [designId, version]);
      if (!row) throw notFound('That version isn’t saved.');
      data = row.data; v = version;
    }
    const parsed = BuildingModel.tryParse(data?.model);
    if (!parsed.model) throw badRequest(`This design's model can't be read: ${parsed.error!.message}`, { code: 'MODEL_INVALID' });
    return { model: parsed.model, version: v, currentVersion: d.version };
  }

  async start(user: AuthUser, projectId: string, body: any): Promise<TakeoffRow> {
    this.on();
    await this.project(user, projectId);
    const designId = typeof body?.designId === 'string' ? body.designId : '';
    const version = body?.version == null ? undefined : Number(body.version);
    if (version != null && !(Number.isInteger(version) && version > 0)) throw badRequest('version must be a positive whole number.');
    const settings = cleanSettings(body?.settings);
    const { model, version: v } = await this.loadModel(projectId, designId, version);
    const hash = createHash('sha256').update(JSON.stringify([ENGINE_VERSION, model.toJSON(), settings])).digest('hex');

    // Cached: an identical takeoff already finished for this user → record a new run that points at the same result.
    const hit = await this.db.one<{ result: TakeoffResult }>(`SELECT result FROM takeoffs WHERE user_id = $1 AND input_hash = $2 AND status = 'done' ORDER BY finished_date DESC LIMIT 1`, [user.id, hash]);
    if (hit && body?.force !== true) {
      const row = await this.db.one<TakeoffRow>(`INSERT INTO takeoffs(project_id, design_id, design_version, user_id, status, progress, stage, input_hash, settings, result, started_date, finished_date)
        VALUES ($1, $2, $3, $4, 'done', 100, 'Cached', $5, $6, $7, now(), now()) RETURNING id, project_id, design_id, design_version, status, progress, stage, error, created_date, finished_date`,
        [projectId, designId, v, user.id, hash, settings, hit.result]);
      return { ...row!, cached: true };
    }
    const running = await this.db.one<{ n: number }>(`SELECT count(*)::int AS n FROM takeoffs WHERE user_id = $1 AND status IN ('queued', 'running')`, [user.id]);
    if ((running?.n ?? 0) >= 5) throw new ApiError(429, 'Five takeoffs are already running. Wait for one to finish.', { code: 'BUSY' });
    const row = await this.db.one<TakeoffRow>(`INSERT INTO takeoffs(project_id, design_id, design_version, user_id, input_hash, settings, stage)
      VALUES ($1, $2, $3, $4, $5, $6, 'Queued') RETURNING id, project_id, design_id, design_version, status, progress, stage, error, created_date, finished_date`,
      [projectId, designId, v, user.id, hash, settings]);
    this.enqueue(row!.id);
    return row!;
  }

  private enqueue(id: string) {
    this.queue.push(id);
    if (!this.running) setImmediate(() => this.drain());
  }

  private async drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length && !this.stopped) await this.runOne(this.queue.shift()!);
    } finally { this.running = false; }
  }

  private async progress(id: string, progress: number, stage: string) {
    await this.db.query('UPDATE takeoffs SET progress = $2, stage = $3 WHERE id = $1', [id, progress, stage]);
  }

  // One job: load model → read geometry → build takeoff → store. Each stage records progress for the UI.
  async runOne(id: string) {
    const job = await this.db.one<{ project_id: string; design_id: string; design_version: number; settings: any; status: string }>(
      `UPDATE takeoffs SET status = 'running', started_date = now(), progress = 5, stage = 'Loading the model' WHERE id = $1 AND status = 'queued'
       RETURNING project_id, design_id, design_version, settings, status`, [id]);
    if (!job) return;
    const started = Date.now();
    try {
      const { model } = await this.loadModel(job.project_id, job.design_id, job.design_version);
      await this.progress(id, 30, 'Reading geometry');
      const geometry = GeometryReader.read(model);
      await this.progress(id, 65, 'Calculating quantities');
      const result = buildTakeoff(model, cleanSettings(job.settings), geometry);
      await this.db.query(`UPDATE takeoffs SET status = 'done', progress = 100, stage = 'Done', result = $2, finished_date = now() WHERE id = $1`, [id, result]);
      this.log.log(`Takeoff ${id}: ${result.lines.length} lines in ${Date.now() - started} ms`);
    } catch (e: any) {
      const message = e instanceof ApiError ? String((e.getResponse() as any)?.error ?? e.message) : 'The takeoff failed unexpectedly. Try again.';
      if (!(e instanceof ApiError)) this.log.error(`Takeoff ${id} failed: ${e?.stack || e}`);
      await this.db.query(`UPDATE takeoffs SET status = 'failed', stage = 'Failed', error = $2, finished_date = now() WHERE id = $1`, [id, message.slice(0, 500)]).catch(() => {});
    }
  }

  async list(user: AuthUser, projectId: string, designId?: string) {
    this.on();
    await this.project(user, projectId);
    const rows = await this.db.query<TakeoffRow & { current_version: number; summary: any }>(
      `SELECT t.id, t.project_id, t.design_id, t.design_version, t.status, t.progress, t.stage, t.error, t.created_date, t.finished_date,
              t.result->'summary' AS summary, d.version AS current_version, d.title AS design_title
         FROM takeoffs t JOIN studio_designs d ON d.id = t.design_id
        WHERE t.project_id = $1 AND ($2::text IS NULL OR t.design_id = $2) ORDER BY t.created_date DESC LIMIT 100`, [projectId, designId ?? null]);
    return rows.map(({ current_version, ...r }) => ({ ...r, stale: r.status === 'done' && r.design_version < current_version }));
  }

  async get(user: AuthUser, projectId: string, takeoffId: string) {
    this.on();
    await this.project(user, projectId);
    if (!ID_RE.test(takeoffId)) throw notFound('Takeoff not found.');
    const row = await this.db.one<TakeoffRow & { current_version: number }>(
      `SELECT t.id, t.project_id, t.design_id, t.design_version, t.status, t.progress, t.stage, t.error, t.result, t.created_date, t.finished_date, d.version AS current_version
         FROM takeoffs t JOIN studio_designs d ON d.id = t.design_id WHERE t.id = $1 AND t.project_id = $2`, [takeoffId, projectId]);
    if (!row) throw notFound('Takeoff not found.');
    const { current_version, ...r } = row;
    return { ...r, stale: r.status === 'done' && r.design_version < current_version };
  }

  // Latest finished takeoff for a design (used by the estimating engine).
  async latestDone(projectId: string, designId: string): Promise<TakeoffRow | null> {
    return this.db.one<TakeoffRow>(`SELECT id, project_id, design_id, design_version, status, progress, stage, error, result, created_date, finished_date
      FROM takeoffs WHERE project_id = $1 AND design_id = $2 AND status = 'done' ORDER BY design_version DESC, finished_date DESC LIMIT 1`, [projectId, designId]);
  }

  // Progress for the events stream: status, progress and stage only (no result).
  async status(user: AuthUser, projectId: string, takeoffId: string) {
    await this.project(user, projectId);
    if (!ID_RE.test(takeoffId)) throw notFound('Takeoff not found.');
    const row = await this.db.one<Pick<TakeoffRow, 'id' | 'status' | 'progress' | 'stage' | 'error'>>('SELECT id, status, progress, stage, error FROM takeoffs WHERE id = $1 AND project_id = $2', [takeoffId, projectId]);
    if (!row) throw notFound('Takeoff not found.');
    return row;
  }
}
