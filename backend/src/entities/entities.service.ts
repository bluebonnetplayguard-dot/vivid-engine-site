import { Injectable } from '@nestjs/common';
import { AuthUser } from '../auth/guard';
import { Db } from '../db';
import { badRequest, forbidden, notFound } from '../errors';
import { EntityDef, PROJECT_SCOPED, getEntity, ruleAllows, ruleSql, validate } from './definitions';
import { Sql, buildOrder, buildWhere, groupColumns } from './query';
import { Realtime } from './realtime';

export interface RecordRow {
  id: string;
  entity: string;
  data: Record<string, unknown>;
  created_by: string | null;
  created_date: string;
  updated_date: string;
}

export type Rec = Record<string, any> & { id: string; created_date: string; updated_date: string; created_by_id: string | null };

// Same record shape the Base44 SDK returned: fields at the top level plus system fields.
export const toRecord = (r: RecordRow): Rec => ({
  ...r.data, id: r.id, created_date: r.created_date, updated_date: r.updated_date, created_by_id: r.created_by,
});

export const isId = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);

export interface ListOptions { sort?: string; limit?: number; skip?: number; cursor?: string }

@Injectable()
export class EntitiesService {
  constructor(private readonly db: Db, private readonly realtime: Realtime) {}

  def(name: string): EntityDef {
    const def = getEntity(name);
    if (!def) throw notFound(`Unknown collection: ${name}`);
    return def;
  }

  // SQL condition limiting rows to what this user may read.
  private readScope(sql: Sql, def: EntityDef, user: AuthUser | null): string {
    if (user?.role === 'admin') return 'true';
    if (PROJECT_SCOPED.has(def.name)) {
      const projectRule = ruleSql(this.def('Project').rls.read, user, v => sql.p(v));
      return user ? `data ->> 'project_id' IN (SELECT id FROM records WHERE entity = 'Project' AND (${projectRule}))` : 'false';
    }
    return ruleSql(def.rls.read, user, v => sql.p(v));
  }

  async list(name: string, user: AuthUser | null, filter: unknown, opts: ListOptions) {
    const def = this.def(name);
    const sql = new Sql();
    const where = `entity = ${sql.p(def.name)} AND (${this.readScope(sql, def, user)}) AND (${buildWhere(sql, filter)})`;
    const order = buildOrder(sql, opts.sort);
    const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 500);
    const offset = opts.cursor ? decodeCursor(opts.cursor) : Math.max(Number(opts.skip) || 0, 0);
    const rows = await this.db.query<RecordRow>(
      `SELECT * FROM records WHERE ${where} ORDER BY ${order} LIMIT ${sql.p(limit + 1)} OFFSET ${sql.p(offset)}`,
      sql.params,
    );
    const has_more = rows.length > limit;
    return { items: rows.slice(0, limit).map(toRecord), has_more, next_cursor: has_more ? encodeCursor(offset + limit) : null };
  }

  async get(name: string, user: AuthUser | null, id: string) {
    const def = this.def(name);
    if (!isId(id)) throw notFound();
    const sql = new Sql();
    const row = await this.db.one<RecordRow>(
      `SELECT * FROM records WHERE entity = ${sql.p(def.name)} AND id = ${sql.p(id)} AND (${this.readScope(sql, def, user)})`,
      sql.params,
    );
    if (!row) throw notFound();
    return toRecord(row);
  }

  async create(name: string, user: AuthUser | null, input: unknown) {
    const def = this.def(name);
    const data = validate(def, input, 'create');
    if (user?.role !== 'admin' && !ruleAllows(def.rls.create, user, { created_by: user?.id ?? null, data })) {
      throw user ? forbidden() : forbidden('Sign in to continue.');
    }
    return this.insert(def.name, data, user?.id ?? null);
  }

  async update(name: string, user: AuthUser | null, id: string, input: unknown) {
    const def = this.def(name);
    if (!isId(id)) throw notFound();
    const sql = new Sql();
    const allowed = user?.role === 'admin' ? 'true' : ruleSql(def.rls.update, user, v => sql.p(v));
    const data = validate(def, input, 'update');
    const row = await this.db.one<RecordRow>(
      `UPDATE records SET data = data || ${sql.p(JSON.stringify(data))}::jsonb, updated_date = now()
       WHERE entity = ${sql.p(def.name)} AND id = ${sql.p(id)} AND (${allowed}) RETURNING *`,
      sql.params,
    );
    if (!row) throw notFound();
    return this.emitted('update', row);
  }

  async remove(name: string, user: AuthUser | null, id: string) {
    const def = this.def(name);
    if (!isId(id)) throw notFound();
    const sql = new Sql();
    const allowed = user?.role === 'admin' ? 'true' : ruleSql(def.rls.delete, user, v => sql.p(v));
    const row = await this.db.one<RecordRow>(
      `DELETE FROM records WHERE entity = ${sql.p(def.name)} AND id = ${sql.p(id)} AND (${allowed}) RETURNING *`, sql.params,
    );
    if (!row) throw notFound();
    this.realtime.emit({ entity: def.name, type: 'delete', id, data: null });
    return { success: true };
  }

  async aggregate(name: string, user: AuthUser | null, body: { query?: unknown; groupBy?: unknown }) {
    const def = this.def(name);
    const sql = new Sql();
    const where = `entity = ${sql.p(def.name)} AND (${this.readScope(sql, def, user)}) AND (${buildWhere(sql, body?.query)})`;
    const g = groupColumns(sql, body?.groupBy);
    const rows = await this.db.query(`SELECT ${g.select}, count(*)::int AS count FROM records WHERE ${where} GROUP BY ${g.group}`, sql.params);
    return {
      rows: rows.map(r => {
        const out: Record<string, unknown> = { count: r.count };
        g.names.forEach((n, i) => { out[n] = r[`g${i}`]; });
        return out;
      }),
    };
  }

  // ---- server-side helpers (callers have already checked permissions) ----

  async insert(entity: string, data: Record<string, unknown>, createdBy: string | null) {
    const def = this.def(entity);
    const row = await this.db.one<RecordRow>(
      'INSERT INTO records(entity, data, created_by) VALUES ($1, $2, $3) RETURNING *',
      [def.name, JSON.stringify(validate(def, data, 'create')), createdBy],
    );
    return this.emitted('create', row);
  }

  async patch(entity: string, id: string, data: Record<string, unknown>) {
    const def = this.def(entity);
    const row = await this.db.one<RecordRow>(
      `UPDATE records SET data = data || $3::jsonb, updated_date = now() WHERE entity = $1 AND id = $2 RETURNING *`,
      [def.name, id, JSON.stringify(validate(def, data, 'update'))],
    );
    if (!row) throw notFound();
    return this.emitted('update', row);
  }

  async findTrusted(entity: string, id: string) {
    if (!isId(id)) return null;
    const row = await this.db.one<RecordRow>('SELECT * FROM records WHERE entity = $1 AND id = $2', [entity, id]);
    return row ? toRecord(row) : null;
  }

  async filterTrusted(entity: string, filter: Record<string, unknown>, sort = '-created_date', limit = 50) {
    const sql = new Sql();
    const rows = await this.db.query<RecordRow>(
      `SELECT * FROM records WHERE entity = ${sql.p(entity)} AND (${buildWhere(sql, filter)}) ORDER BY ${buildOrder(sql, sort)} LIMIT ${sql.p(limit)}`,
      sql.params,
    );
    return rows.map(toRecord);
  }

  private emitted(type: 'create' | 'update', row: RecordRow) {
    const record = toRecord(row);
    this.realtime.emit({ entity: row.entity, type, id: row.id, data: record, createdBy: row.created_by });
    return record;
  }

  // Whether a live change event may be sent to this user.
  async canSee(user: AuthUser, entity: string, record: Record<string, any> | null, createdBy: string | null): Promise<boolean> {
    if (user.role === 'admin') return true;
    const def = getEntity(entity);
    if (!def || !record) return false;
    if (PROJECT_SCOPED.has(entity)) {
      const project = await this.findTrusted('Project', String(record.project_id ?? ''));
      return !!project && ruleAllows(this.def('Project').rls.read, user, { created_by: project.created_by_id, data: project });
    }
    return ruleAllows(def.rls.read, user, { created_by: createdBy, data: record });
  }
}

function encodeCursor(offset: number) {
  return Buffer.from(JSON.stringify({ o: offset })).toString('base64url');
}
function decodeCursor(cursor: string) {
  try {
    const o = JSON.parse(Buffer.from(cursor, 'base64url').toString()).o;
    if (Number.isInteger(o) && o >= 0) return o;
  } catch { /* fall through */ }
  throw badRequest('Invalid page cursor.');
}
