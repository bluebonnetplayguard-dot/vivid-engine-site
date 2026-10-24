import { badRequest } from '../errors';

// Translates the Base44-style filter objects the frontend already sends
// ({ status: 'new' }, { project_id: { $in: [...] } }, { total: { $gte: 100 } })
// into parameterized SQL over the `records` table. Field names are validated
// and passed as parameters, never interpolated.

const FIELD = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const COLUMNS: Record<string, string> = {
  id: 'id', created_date: 'created_date', updated_date: 'updated_date', created_by: 'created_by', created_by_id: 'created_by',
};

export class Sql {
  params: unknown[] = [];
  p(value: unknown): string {
    this.params.push(value);
    return `$${this.params.length}`;
  }
}

function field(name: string) {
  if (!FIELD.test(name)) throw badRequest(`Invalid field name: ${name}`);
}

// Returns a SQL expression for a field: a real column, the JSON value, or its text.
function jsonRef(sql: Sql, name: string) {
  return `data -> ${sql.p(name)}`;
}

function compare(sql: Sql, name: string, op: string, value: unknown): string {
  const ops: Record<string, string> = { $gt: '>', $gte: '>=', $lt: '<', $lte: '<=' };
  if (COLUMNS[name]) {
    const cast = name.endsWith('_date') ? '::timestamptz' : '::text';
    return `${COLUMNS[name]} ${ops[op]} ${sql.p(String(value))}${cast}`;
  }
  if (typeof value === 'number') return `(data ->> ${sql.p(name)})::numeric ${ops[op]} ${sql.p(value)}`;
  return `(data ->> ${sql.p(name)}) ${ops[op]} ${sql.p(String(value))}`;
}

function equals(sql: Sql, name: string, value: unknown, negate = false): string {
  if (COLUMNS[name]) {
    return value === null
      ? `${COLUMNS[name]} IS ${negate ? 'NOT ' : ''}NULL`
      : `${COLUMNS[name]} ${negate ? '<>' : '='} ${sql.p(String(value))}`;
  }
  if (value === null) return `(data -> ${sql.p(name)} IS ${negate ? 'NOT ' : ''}NULL OR data -> ${sql.p(name)} = 'null'::jsonb)`;
  const expr = `data -> ${sql.p(name)} = ${sql.p(JSON.stringify(value))}::jsonb`;
  return negate ? `NOT COALESCE(${expr}, false)` : expr;
}

function inList(sql: Sql, name: string, values: unknown, negate = false): string {
  if (!Array.isArray(values)) throw badRequest(`$in for ${name} must be a list`);
  if (values.length > 500) throw badRequest('Too many values in filter.');
  if (values.length === 0) return negate ? 'true' : 'false';
  const target = COLUMNS[name] ?? jsonRef(sql, name);
  const list = COLUMNS[name]
    ? `ANY(${sql.p(values.map(String))}::text[])`
    : `ANY(ARRAY(SELECT jsonb_array_elements(${sql.p(JSON.stringify(values))}::jsonb)))`;
  return negate ? `NOT COALESCE(${target} = ${list}, false)` : `${target} = ${list}`;
}

export function buildWhere(sql: Sql, filter: unknown): string {
  if (filter == null) return 'true';
  if (typeof filter !== 'object' || Array.isArray(filter)) throw badRequest('Filter must be an object.');
  const parts: string[] = [];
  for (const [key, cond] of Object.entries(filter as Record<string, unknown>)) {
    if (key === '$or' || key === '$and') {
      if (!Array.isArray(cond) || cond.length === 0) throw badRequest(`${key} needs a list of filters`);
      parts.push(`(${cond.map(c => `(${buildWhere(sql, c)})`).join(key === '$or' ? ' OR ' : ' AND ')})`);
      continue;
    }
    field(key);
    if (cond !== null && typeof cond === 'object' && !Array.isArray(cond)) {
      for (const [op, value] of Object.entries(cond as Record<string, unknown>)) {
        if (op === '$in') parts.push(inList(sql, key, value));
        else if (op === '$nin') parts.push(inList(sql, key, value, true));
        else if (op === '$ne') parts.push(equals(sql, key, value, true));
        else if (op === '$eq') parts.push(equals(sql, key, value));
        else if (op === '$exists') parts.push(`${value ? '' : 'NOT '}(data ? ${sql.p(key)})`);
        else if (['$gt', '$gte', '$lt', '$lte'].includes(op)) parts.push(compare(sql, key, op, value));
        else throw badRequest(`Unsupported filter operator: ${op}`);
      }
    } else {
      parts.push(equals(sql, key, cond));
    }
  }
  return parts.length ? parts.join(' AND ') : 'true';
}

// "-created_date" => created_date DESC. Several fields may be comma-separated.
export function buildOrder(sql: Sql, sort: unknown): string {
  const spec = typeof sort === 'string' && sort ? sort : '-created_date';
  const parts = spec.split(',').slice(0, 3).map(raw => {
    const desc = raw.startsWith('-');
    const name = raw.replace(/^[-+]/, '').trim();
    field(name);
    const expr = COLUMNS[name] ?? jsonRef(sql, name);
    return `${expr} ${desc ? 'DESC' : 'ASC'} NULLS LAST`;
  });
  return `${parts.join(', ')}, id`;
}

export function groupColumns(sql: Sql, groupBy: unknown): { select: string; group: string; names: string[] } {
  const names = (Array.isArray(groupBy) ? groupBy : [groupBy]).filter(Boolean).map(String).slice(0, 3);
  if (!names.length) throw badRequest('groupBy is required.');
  const exprs = names.map(n => {
    field(n);
    return COLUMNS[n] ?? `data ->> ${sql.p(n)}`;
  });
  return {
    select: exprs.map((e, i) => `${e} AS g${i}`).join(', '),
    group: exprs.map((_, i) => `g${i}`).join(', '),
    names,
  };
}
