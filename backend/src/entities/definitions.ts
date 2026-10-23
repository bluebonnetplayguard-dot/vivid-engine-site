import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

// Collections are defined by the JSON schema files in ./schemas, copied verbatim
// from the Base44 project (base44/entities/*.jsonc). Each file carries its fields,
// required list, defaults and its row-level security rules ("rls"), so the API
// enforces exactly what Base44 enforced. To add or change a collection, edit its file.

type Rule = null | undefined | Record<string, any>;

interface JsonProp {
  type?: string; enum?: string[]; maxLength?: number; format?: string; default?: unknown;
  items?: JsonProp; properties?: Record<string, JsonProp>;
}

export interface EntityDef {
  name: string;
  properties: Record<string, JsonProp>;
  required: string[];
  rls: { create?: Rule; read?: Rule; update?: Rule; delete?: Rule };
  createSchema: z.ZodTypeAny;
  updateSchema: z.ZodTypeAny;
}

export interface Viewer { id: string; email: string; role: 'user' | 'admin' }

// Places where the original rules are tightened on purpose:
//  - Task.read was public (null) in Base44, which exposed every client's task list
//    to anyone. Tasks and Messages are now visible to admins and to the client the
//    parent project is assigned to.
export const PROJECT_SCOPED = new Set(['Task', 'Message']);

const blankToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

function propSchema(p: JsonProp): z.ZodTypeAny {
  let s: z.ZodTypeAny;
  if (p.enum?.length) s = z.enum(p.enum as [string, ...string[]]);
  else if (p.type === 'number' || p.type === 'integer') s = z.preprocess(v => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v), z.number().finite());
  else if (p.type === 'boolean') s = z.preprocess(v => (v === 'true' ? true : v === 'false' ? false : v), z.boolean());
  else if (p.type === 'array') s = z.array(p.items ? propSchema(p.items) : z.any()).max(1000);
  else if (p.type === 'object') s = p.properties
    ? z.object(Object.fromEntries(Object.entries(p.properties).map(([k, v]) => [k, propSchema(v).optional()]))).passthrough()
    : z.record(z.string(), z.any());
  else s = z.string().max(p.maxLength ?? 100_000);
  return s;
}

function build(file: string): EntityDef {
  const json = JSON.parse(readFileSync(file, 'utf8'));
  const properties: Record<string, JsonProp> = json.properties ?? {};
  const required: string[] = json.required ?? [];
  const shapeCreate: Record<string, z.ZodTypeAny> = {};
  const shapeUpdate: Record<string, z.ZodTypeAny> = {};
  for (const [key, prop] of Object.entries(properties)) {
    const base = propSchema(prop);
    const field = required.includes(key) ? base : base.optional();
    shapeCreate[key] = prop.default !== undefined
      ? z.preprocess(v => (v === undefined || v === null || v === '' ? prop.default : v), base)
      : z.preprocess(blankToUndefined, field);
    shapeUpdate[key] = z.preprocess(v => (v === null ? undefined : v), base.optional());
  }
  // Unknown fields are dropped, as Base44 did.
  return {
    name: json.name,
    properties,
    required,
    rls: json.rls ?? {},
    createSchema: z.object(shapeCreate).strip(),
    updateSchema: z.object(shapeUpdate).strip(),
  };
}

const dir = join(__dirname, 'schemas');
export const entities: Record<string, EntityDef> = Object.fromEntries(
  readdirSync(dir).filter(f => f.endsWith('.json')).map(f => {
    const def = build(join(dir, f));
    return [def.name, def];
  }),
);

export function getEntity(name: string): EntityDef | null {
  return Object.prototype.hasOwnProperty.call(entities, name) ? entities[name] : null;
}

export function validate(def: EntityDef, input: unknown, mode: 'create' | 'update'): Record<string, unknown> {
  const parsed = (mode === 'create' ? def.createSchema : def.updateSchema).parse(input ?? {}) as Record<string, unknown>;
  for (const k of Object.keys(parsed)) if (parsed[k] === undefined) delete parsed[k];
  return parsed;
}

// ---- Row-level security, interpreted from the Base44 "rls" rules ----
// Supported forms (all that the project uses):
//   null                                   -> anyone
//   { user_condition: { role: 'admin' } }  -> signed-in user with that role
//   { created_by_id: '{{user.id}}' }       -> the record's creator
//   { 'data.<field>': '{{user.id}}' }      -> record field equals the user's id (or {{user.email}})
//   { $or: [...] } / { $and: [...] }
// Anything else denies access (fails closed).

function templateValue(value: unknown, user: Viewer | null): string | null {
  if (!user || typeof value !== 'string') return null;
  if (value === '{{user.id}}') return user.id;
  if (value === '{{user.email}}') return user.email.toLowerCase();
  return null;
}

// SQL condition for list/get/update/delete. `p` adds a bound parameter.
export function ruleSql(rule: Rule, user: Viewer | null, p: (v: unknown) => string): string {
  if (rule === null || rule === undefined) return 'true';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(rule)) {
    if (key === '$or' || key === '$and') {
      const subs = (Array.isArray(value) ? value : []).map(r => `(${ruleSql(r, user, p)})`);
      parts.push(subs.length ? `(${subs.join(key === '$or' ? ' OR ' : ' AND ')})` : 'false');
    } else if (key === 'user_condition') {
      parts.push(user && value?.role && user.role === value.role ? 'true' : 'false');
    } else if (key === 'created_by_id') {
      const v = templateValue(value, user);
      parts.push(v ? `created_by = ${p(v)}` : 'false');
    } else if (key.startsWith('data.')) {
      const v = templateValue(value, user);
      parts.push(v ? `data ->> ${p(key.slice(5))} = ${p(v)}` : 'false');
    } else {
      parts.push('false');
    }
  }
  return parts.length ? parts.join(' AND ') : 'true';
}

// Same rule evaluated in code against one record (create checks and live events).
export function ruleAllows(rule: Rule, user: Viewer | null, record: { created_by?: string | null; data: Record<string, unknown> }): boolean {
  if (rule === null || rule === undefined) return true;
  return Object.entries(rule).every(([key, value]) => {
    if (key === '$or') return Array.isArray(value) && value.some(r => ruleAllows(r, user, record));
    if (key === '$and') return Array.isArray(value) && value.every(r => ruleAllows(r, user, record));
    if (key === 'user_condition') return !!user && !!value?.role && user.role === value.role;
    if (key === 'created_by_id') { const v = templateValue(value, user); return !!v && record.created_by === v; }
    if (key.startsWith('data.')) { const v = templateValue(value, user); return !!v && String(record.data[key.slice(5)] ?? '') === v; }
    return false;
  });
}
