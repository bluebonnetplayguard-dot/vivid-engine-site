import { Injectable } from '@nestjs/common';
import { AuthUser } from '../auth/guard';
import { Db } from '../db';
import { ApiError, badRequest, notFound } from '../errors';
import { studioEnabled } from '../studio3d/studio3d.service';
import { TakeoffService } from '../takeoff/takeoff.service';
import { CostTableInput, buildEstimate, cleanEstimateSettings, compareAlternate, contractorTable } from './engine';
import { STARTER_COST_TABLE } from './starter-costs';
import { CostTable, EstimateResult } from './types';

const ID_RE = /^[a-f0-9]{24}$/;
const MAX_ALTERNATES = 6;

@Injectable()
export class EstimatingService {
  constructor(private readonly db: Db, private readonly takeoffs: TakeoffService) {}

  private on() { if (!studioEnabled()) throw new ApiError(503, 'The 3D Design Studio isn’t switched on for this site yet.', { code: 'NOT_CONFIGURED' }); }

  private async project(user: AuthUser, id: string) {
    if (!ID_RE.test(id)) throw notFound('Project not found.');
    const p = await this.db.one<{ id: string; name: string }>('SELECT id, name FROM studio_projects WHERE id = $1 AND user_id = $2', [id, user.id]);
    if (!p) throw notFound('Project not found.');
    return p;
  }

  // ---------- cost tables ----------

  async costTable(user: AuthUser, id: string): Promise<CostTable> {
    if (id === 'starter') return STARTER_COST_TABLE;
    if (!ID_RE.test(id)) throw notFound('Cost table not found.');
    const row = await this.db.one<{ data: CostTable }>('SELECT data FROM cost_tables WHERE id = $1 AND user_id = $2', [id, user.id]);
    if (!row) throw notFound('Cost table not found.');
    return row.data;
  }

  async listCostTables(user: AuthUser) {
    this.on();
    const own = await this.db.query<{ id: string; name: string; updated_date: string; items: number }>(
      `SELECT id, name, updated_date, jsonb_array_length(data->'items') AS items FROM cost_tables WHERE user_id = $1 ORDER BY updated_date DESC`, [user.id]);
    return [{ id: 'starter', name: STARTER_COST_TABLE.name, kind: 'starter', items: STARTER_COST_TABLE.items.length, notice: STARTER_COST_TABLE.notice }, ...own.map(r => ({ ...r, kind: 'contractor' }))];
  }

  async getCostTable(user: AuthUser, id: string) { this.on(); return this.costTable(user, id); }

  async saveCostTable(user: AuthUser, body: unknown, id?: string) {
    this.on();
    const r = CostTableInput.safeParse(body);
    if (!r.success) throw badRequest(`Cost table: ${r.error.issues.slice(0, 3).map(i => `${i.path.join('.') || '(root)'} ${i.message}`).join('; ')}`, { code: 'COST_TABLE_INVALID' });
    const now = new Date().toISOString();
    if (id) {
      if (!ID_RE.test(id)) throw notFound('Cost table not found.');
      const table = contractorTable(id, r.data, STARTER_COST_TABLE, now);
      const row = await this.db.one('UPDATE cost_tables SET name = $3, data = $4, updated_date = now() WHERE id = $1 AND user_id = $2 RETURNING id', [id, user.id, table.name, table]);
      if (!row) throw notFound('Cost table not found.');
      return table;
    }
    const n = await this.db.one<{ n: number }>('SELECT count(*)::int AS n FROM cost_tables WHERE user_id = $1', [user.id]);
    if ((n?.n ?? 0) >= 50) throw new ApiError(429, 'You can keep up to 50 cost tables.', { code: 'QUOTA' });
    const row = await this.db.one<{ id: string }>(`INSERT INTO cost_tables(user_id, name, data) VALUES ($1, $2, '{}'::jsonb) RETURNING id`, [user.id, r.data.name]);
    const table = contractorTable(row!.id, r.data, STARTER_COST_TABLE, now);
    await this.db.query('UPDATE cost_tables SET data = $2 WHERE id = $1', [row!.id, table]);
    return table;
  }

  // ---------- estimates ----------

  // Body: { designId, alternates?: designId[], settings?: EstimateSettings, note? }
  async create(user: AuthUser, projectId: string, body: any) {
    this.on();
    await this.project(user, projectId);
    let settings;
    try { settings = cleanEstimateSettings(body?.settings); } catch (e: any) { throw badRequest(e.message, { code: 'SETTINGS_INVALID' }); }
    const table = await this.costTable(user, settings.costTableId);
    const designId = typeof body?.designId === 'string' ? body.designId : '';
    const alternates: string[] = Array.isArray(body?.alternates) ? [...new Set(body.alternates.filter((x: unknown) => typeof x === 'string' && x !== designId))] as string[] : [];
    if (alternates.length > MAX_ALTERNATES) throw badRequest(`Compare at most ${MAX_ALTERNATES} alternates at once.`);

    const price = async (id: string): Promise<{ estimate: EstimateResult; takeoffId: string; hash: string; version: number }> => {
      const t = await this.takeoffs.ensureFor(user.id, projectId, id);
      return { estimate: buildEstimate({ takeoff: t.result, takeoffHash: t.hash, design: { id, title: t.title, version: t.version }, costTable: table, settings }), takeoffId: t.id, hash: t.hash, version: t.version };
    };
    const base = await price(designId);
    for (const alt of alternates) {
      const other = await price(alt);
      base.estimate.alternates.push(compareAlternate(base.estimate, other.estimate));
    }
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 500) || null : null;
    // Versions count up per project; a unique index guards concurrent creates (retry once on conflict).
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await this.db.one(`INSERT INTO estimates(project_id, user_id, version, design_id, design_version, takeoff_id, takeoff_hash, cost_table_id, settings, result, price, note)
          VALUES ($1, $2, COALESCE((SELECT max(version) FROM estimates WHERE project_id = $1), 0) + 1, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id, project_id, version, design_id, design_version, takeoff_id, cost_table_id, price, note, created_date, result`,
          [projectId, user.id, designId, base.version, base.takeoffId, base.hash, table.id, settings, base.estimate, base.estimate.totals.price, note]);
      } catch (e: any) { if (e?.code !== '23505' || attempt) throw e; }
    }
    throw new ApiError(409, 'Another estimate was saved at the same moment. Try again.');
  }

  async list(user: AuthUser, projectId: string) {
    this.on();
    await this.project(user, projectId);
    const rows = await this.db.query(`SELECT e.id, e.version, e.design_id, d.title AS design_title, e.design_version, d.version AS current_version, e.cost_table_id,
        e.price, e.note, e.created_date, jsonb_array_length(e.result->'alternates') AS alternates, e.result->'totals'->'pricePerSqFt' AS price_per_sq_ft
      FROM estimates e JOIN studio_designs d ON d.id = e.design_id WHERE e.project_id = $1 ORDER BY e.version DESC LIMIT 200`, [projectId]);
    return rows.map(({ current_version, ...r }: any) => ({ ...r, price: Number(r.price), stale: r.design_version < current_version }));
  }

  async get(user: AuthUser, projectId: string, version: string) {
    this.on();
    await this.project(user, projectId);
    const v = Number(version);
    if (!Number.isInteger(v) || v < 1) throw notFound('Estimate not found.');
    const row: any = await this.db.one(`SELECT e.id, e.version, e.design_id, e.design_version, d.version AS current_version, e.takeoff_id, e.cost_table_id, e.price, e.note, e.created_date, e.result
      FROM estimates e JOIN studio_designs d ON d.id = e.design_id WHERE e.project_id = $1 AND e.version = $2`, [projectId, v]);
    if (!row) throw notFound('Estimate not found.');
    const { current_version, ...r } = row;
    return { ...r, price: Number(r.price), stale: r.design_version < current_version };
  }
}
