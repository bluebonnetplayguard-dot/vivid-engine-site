import { RouterError } from './types';

// Credits are a way to show an allowance: 1 credit = $0.001 of what the engines cost us.
// The site shows a percentage; the ledger keeps exact dollars.
export const CREDITS_PER_USD = 1000;
export const creditsOf = (usd: number) => Math.max(0, Math.ceil(usd * CREDITS_PER_USD - 1e-9));
export const WARN_AT = 0.8;

export type Level = 'ok' | 'warn' | 'limit';
export interface Allowance { capUsd: number; spentUsd: number; remainingUsd: number; pct: number; level: Level; credits: { cap: number; used: number; left: number } }

export function allowance(capUsd: number, spentUsd: number): Allowance {
  const pct = capUsd > 0 ? Math.min(1, spentUsd / capUsd) : 1;
  const level: Level = spentUsd >= capUsd ? 'limit' : pct >= WARN_AT ? 'warn' : 'ok';
  return { capUsd, spentUsd, remainingUsd: Math.max(0, capUsd - spentUsd), pct, level, credits: { cap: creditsOf(capUsd), used: creditsOf(spentUsd), left: Math.max(0, creditsOf(capUsd) - creditsOf(spentUsd)) } };
}

// Which notices a new charge triggers (each is sent once a month).
export function crossed(before: number, after: number, capUsd: number): ('warn80' | 'limit100')[] {
  const out: ('warn80' | 'limit100')[] = [];
  if (capUsd <= 0) return out;
  if (before < capUsd * WARN_AT && after >= capUsd * WARN_AT) out.push('warn80');
  if (before < capUsd && after >= capUsd) out.push('limit100');
  return out;
}

// Margin guard: the price must be at least `multiplier` times what the engines cost us.
export function marginCheck(priceUsd: number, costUsd: number, multiplier: number) {
  const ratio = costUsd > 0 ? priceUsd / costUsd : Infinity;
  return { ok: ratio >= multiplier, ratio, requiredPriceUsd: Math.ceil(costUsd * multiplier * 100) / 100 };
}

// Refuses a question that would push the account past its cap. Same rule for the whole platform's monthly cap.
export function assertWithinCap(spentUsd: number, estimateUsd: number, capUsd: number, who: 'account' | 'platform' = 'account') {
  if (spentUsd + estimateUsd <= capUsd) return;
  if (who === 'platform') throw new RouterError('AI Search is taking a short break because of high demand. Please try again later.', 503, 'PLATFORM_CAP');
  throw new RouterError(spentUsd >= capUsd
    ? "You've used this month's AI allowance. It resets on the 1st, or you can upgrade for more."
    : "This question could use more than what's left of this month's AI allowance. Try Quick depth, one engine, or upgrade for more.", 429, 'CREDITS_EXHAUSTED');
}

// ---------- the ledger (database) ----------
export interface Db { query<T = any>(text: string, params?: unknown[]): Promise<T[]>; one<T = any>(text: string, params?: unknown[]): Promise<T | null> }
export const periodOf = (d: Date = new Date()) => d.toISOString().slice(0, 7);

export interface LedgerEntry { userId: string; subscriptionId?: string | null; planId: string; provider: string; model: string; costUsd: number; costStatus: string; requestId?: string; kind?: 'usage' | 'grant'; note?: string }

export class CreditLedger {
  constructor(private readonly db: Db) {}

  // Spend this month. Business seats share the subscription's pool.
  async spent(scope: { userId: string; subscriptionId?: string | null }, period = periodOf()): Promise<number> {
    const row = scope.subscriptionId
      ? await this.db.one<{ s: string }>(`SELECT COALESCE(sum(cost_usd), 0) AS s FROM ai_credit_ledger WHERE subscription_id = $1 AND period = $2 AND kind = 'usage'`, [scope.subscriptionId, period])
      : await this.db.one<{ s: string }>(`SELECT COALESCE(sum(cost_usd), 0) AS s FROM ai_credit_ledger WHERE user_id = $1 AND subscription_id IS NULL AND period = $2 AND kind = 'usage'`, [scope.userId, period]);
    return Number(row?.s ?? 0);
  }
  async platformSpent(period = periodOf()): Promise<number> {
    return Number((await this.db.one<{ s: string }>(`SELECT COALESCE(sum(cost_usd), 0) AS s FROM ai_credit_ledger WHERE period = $1 AND kind = 'usage'`, [period]))?.s ?? 0);
  }

  // Writes one charge and says what the account's spend was before and after.
  async record(e: LedgerEntry, now = new Date()): Promise<{ before: number; after: number }> {
    const period = periodOf(now);
    const scopeSql = e.subscriptionId ? 'subscription_id = $1' : `user_id = $1 AND subscription_id IS NULL`;
    const row = await this.db.one<{ before: string; after: string }>(
      `WITH b AS (SELECT COALESCE(sum(cost_usd), 0) AS s FROM ai_credit_ledger WHERE ${scopeSql} AND period = $2 AND kind = 'usage'),
            i AS (INSERT INTO ai_credit_ledger(user_id, subscription_id, plan_id, period, kind, provider, model, cost_usd, credits, cost_status, request_id, note)
                  VALUES ($3, $4, $5, $2, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING cost_usd)
       SELECT b.s AS before, b.s + (SELECT cost_usd FROM i) AS after FROM b`,
      [e.subscriptionId ?? e.userId, period, e.userId, e.subscriptionId ?? null, e.planId, e.kind ?? 'usage', e.provider, e.model, e.costUsd.toFixed(5), creditsOf(e.costUsd), e.costStatus, e.requestId ?? null, e.note ?? null]);
    return { before: Number(row!.before), after: Number(row!.after) };
  }

  // True the first time a notice is raised for this account this month.
  async firstNotice(userId: string, level: 'warn80' | 'limit100', period = periodOf()): Promise<boolean> {
    const row = await this.db.one(`INSERT INTO ai_credit_notices(user_id, period, level) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING level`, [userId, period, level]);
    return !!row;
  }

  // Records that an account's price no longer covers 2.5x cost this month (once per account per month).
  async flagMargin(f: { userId: string; planId: string; priceUsd: number; costUsd: number; multiplier: number }, period = periodOf()): Promise<boolean> {
    const row = await this.db.one(
      `INSERT INTO ai_margin_flags(user_id, period, plan_id, price_usd, cost_usd, multiplier) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (user_id, period) DO UPDATE SET cost_usd = EXCLUDED.cost_usd RETURNING user_id`,
      [f.userId, period, f.planId, f.priceUsd.toFixed(2), f.costUsd.toFixed(5), f.multiplier]);
    return !!row;
  }
}
