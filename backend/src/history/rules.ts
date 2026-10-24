import { DOWNGRADE_READ_ONLY_DAYS, HistoryPlan, historyForPlan } from '../shared/pricing-catalog';

// The rules for saved conversation history, with no database or framework in them so each can be tested alone.
// Saved history is a paid feature: guests and Free accounts save nothing, ever.

export const AUTO_DELETE_DAYS = [30, 90, 365] as const;
export const LOCKED_PURGE_DAYS = 60;   // after the 30-day read-only window, saved data is deleted this many days later (confirm before launch)
export const MAX_MEMORY_SNIPPETS = 3;

export interface EntitlementRow {
  plan_id: string;
  status: 'active' | 'ended';
  ended_at: Date | string | null;
  retention_days: number | null;
  full_text_search: boolean;
  bulk_export: boolean;
  memory: boolean;
}

export interface HistoryAccess {
  allowed: boolean;               // can save new conversations and open old ones
  readOnly: boolean;              // plan ended within the last 30 days: view, search, export and delete only
  readOnlyUntil: string | null;
  retentionDays: number | null;   // null = kept until the person deletes it
  fullTextSearch: boolean;
  bulkExport: boolean;
  memory: boolean;
  planId: string | null;
}

export const NO_HISTORY: HistoryAccess = { allowed: false, readOnly: false, readOnlyUntil: null, retentionDays: 0, fullTextSearch: false, bulkExport: false, memory: false, planId: null };
const DAY = 86_400_000;
const ms = (d: Date | string) => (d instanceof Date ? d : new Date(d)).getTime();

// Row shape for a plan id, straight from the pricing catalog. null = the plan includes no saved history.
export function entitlementColumns(planId: string): Pick<EntitlementRow, 'retention_days' | 'full_text_search' | 'bulk_export' | 'memory'> | null {
  const h: HistoryPlan | null = historyForPlan(planId);
  return h ? { retention_days: h.retentionDays, full_text_search: h.fullTextSearch, bulk_export: h.bulkExport, memory: h.memory } : null;
}

// Several plans can apply at once (for example a website plan and Search Max): the person gets the most generous of each.
function best(rows: EntitlementRow[]): Omit<HistoryAccess, 'allowed' | 'readOnly' | 'readOnlyUntil'> {
  const unlimited = rows.some(r => r.retention_days == null);
  return {
    retentionDays: unlimited ? null : Math.max(...rows.map(r => r.retention_days ?? 0)),
    fullTextSearch: rows.some(r => r.full_text_search),
    bulkExport: rows.some(r => r.bulk_export),
    memory: rows.some(r => r.memory),
    planId: [...rows].sort((a, b) => (a.retention_days == null ? 0 : 1) - (b.retention_days == null ? 0 : 1))[0]?.plan_id ?? null,
  };
}

export function resolveHistoryAccess(rows: EntitlementRow[], now: Date = new Date()): HistoryAccess {
  const active = rows.filter(r => r.status === 'active');
  if (active.length) return { allowed: true, readOnly: false, readOnlyUntil: null, ...best(active) };
  const windowMs = DOWNGRADE_READ_ONLY_DAYS * DAY;
  const recent = rows.filter(r => r.status === 'ended' && r.ended_at && ms(r.ended_at) + windowMs > now.getTime());
  if (!recent.length) return NO_HISTORY;
  const latest = Math.max(...recent.map(r => ms(r.ended_at!)));
  // Read-only keeps view, search, export and delete. Memory stops: it only helps new questions, which are not saved.
  return { allowed: true, readOnly: true, readOnlyUntil: new Date(latest + windowMs).toISOString(), ...best(recent), memory: false };
}

// A new question is saved only on an active paid plan, outside Private mode.
export const shouldSave = (access: HistoryAccess, privateMode: boolean) => access.allowed && !access.readOnly && !privateMode;
// Export: plans with bulk export, and anyone in the read-only window (it is their data and they are leaving).
export const canExport = (access: HistoryAccess) => access.allowed && (access.bulkExport || access.readOnly);
// Memory feeds earlier conversations into new answers: Search Max and All-In-One only, and only when switched on.
export const memoryActive = (access: HistoryAccess, enabled: boolean) => access.allowed && !access.readOnly && access.memory && enabled;

// Conversations last touched before this are removed on plans that keep history for a fixed time.
export const retentionCutoff = (retentionDays: number | null, now: Date = new Date()) => (retentionDays == null ? null : new Date(now.getTime() - retentionDays * DAY));
// Locked data (plan ended more than 30 days ago) is deleted this long after the read-only window closes.
export const purgeCutoff = (now: Date = new Date()) => new Date(now.getTime() - (DOWNGRADE_READ_ONLY_DAYS + LOCKED_PURGE_DAYS) * DAY);

export function parseAutoDelete(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || value === 'never') return null;
  const n = Number(value);
  if (!(AUTO_DELETE_DAYS as readonly number[]).includes(n)) throw new RangeError('Auto-delete can be 30, 90 or 365 days, or never.');
  return n;
}

// The history part of GET /ai-search/me, as the site reads it.
export const publicAccess = (a: HistoryAccess) => ({ allowed: a.allowed, readOnly: a.readOnly, readOnlyUntil: a.readOnlyUntil, retentionDays: a.retentionDays, fullTextSearch: a.fullTextSearch, bulkExport: a.bulkExport, memory: a.memory });
