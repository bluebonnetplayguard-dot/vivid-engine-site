import { AlertCenter } from './alerts';
import { DbLike } from './prices';
import { budgetSeverity, evaluateBudget, periodKey, TZ } from './rules';

export interface BudgetRow {
  id: number; scope: 'global' | 'provider' | 'user' | 'workflow'; scope_ref: string; period: 'day' | 'month';
  amount_usd: number; warn_pcts: number[]; hard_stop: boolean; override_until: Date | string | null; enabled: boolean;
}
export interface GuardResult {
  blocked: { message: string; scope: string; ref: string } | null;   // the call must not run
  pausedProviders: string[];                                         // providers at their hard stop: send the call elsewhere
  throttled: boolean;                                                // this account is being slowed down
}

// A call with no price yet counts as this much toward a budget, so unpriced models cannot slip past it.
export const PENDING_ESTIMATE_USD = 0.02;

const START = (p: 'day' | 'month') => `date_trunc('${p}', $1::timestamptz AT TIME ZONE '${TZ}') AT TIME ZONE '${TZ}'`;

// Looks at the spend so far (from ai_usage_logs, America/Chicago periods) against the budgets table before an AI call,
// raises each warning threshold once per period, and applies hard stops.
export class BudgetGuard {
  private budgets: { at: number; rows: BudgetRow[] } = { at: 0, rows: [] };
  private spendCache = new Map<string, { at: number; usd: number }>();

  constructor(private readonly db: DbLike, private readonly alerts: AlertCenter, private readonly o: { cacheMs?: number; clock?: () => number } = {}) {}
  private get clock() { return this.o.clock ?? Date.now; }
  invalidate() { this.budgets.at = 0; this.spendCache.clear(); }

  async list(): Promise<BudgetRow[]> {
    if (this.clock() - this.budgets.at > 30_000) {
      this.budgets = { at: this.clock(), rows: (await this.db.query(`SELECT id, scope, scope_ref, period, amount_usd::float AS amount_usd, warn_pcts, hard_stop, override_until, enabled FROM budgets WHERE enabled`)) as BudgetRow[] };
    }
    return this.budgets.rows;
  }

  async spent(scope: BudgetRow['scope'], ref: string, period: 'day' | 'month', now: Date): Promise<number> {
    const key = `${scope}:${ref}:${period}`;
    const hit = this.spendCache.get(key);
    if (hit && this.clock() - hit.at < (this.o.cacheMs ?? 15_000)) return hit.usd;
    const filter = scope === 'provider' ? 'AND provider = $2' : scope === 'user' ? 'AND user_id = $2' : scope === 'workflow' ? 'AND workflow = $2' : 'AND ($2::text IS NOT NULL)';
    const row = await this.db.one(
      `SELECT COALESCE(sum(cost_usd), 0)::float + count(*) FILTER (WHERE cost_status = 'pending') * ${PENDING_ESTIMATE_USD} AS usd
         FROM ai_usage_logs WHERE ts >= ${START(period)} ${filter}`, [now.toISOString(), ref]);
    const usd = Number(row?.usd ?? 0);
    this.spendCache.set(key, { at: this.clock(), usd });
    return usd;
  }

  private async warn(b: BudgetRow, pct: number, spent: number, crossed: number[], now: Date) {
    const top = crossed[crossed.length - 1];
    if (top == null) return;
    const what = b.scope === 'global' ? 'All AI spend' : b.scope === 'provider' ? `${b.scope_ref} spend` : b.scope === 'user' ? `Account ${b.scope_ref.slice(0, 12)}` : `${b.scope_ref} spend`;
    await this.alerts.raise({
      severity: budgetSeverity(top), kind: 'budget', scope: b.scope, scopeRef: b.scope_ref, value: spent, threshold: b.amount_usd * top / 100,
      message: `${what} is at ${pct.toFixed(0)}% of its ${b.period === 'day' ? 'daily' : 'monthly'} budget ($${spent.toFixed(2)} of $${b.amount_usd.toFixed(2)})${b.hard_stop && top >= 100 ? '. Hard stop is on.' : '.'}`,
      dedupeKey: `budget:${b.scope}:${b.scope_ref}:${b.period}:${periodKey(b.period, now)}:${top}`,
    });
  }

  // Before an AI call.
  async check(ctx: { userId?: string | null; workflow: string; providers: string[] }, now = new Date()): Promise<GuardResult> {
    const out: GuardResult = { blocked: null, pausedProviders: [], throttled: false };
    if (ctx.userId) {
      const t = await this.db.one(`SELECT 1 FROM billing_throttles WHERE user_id = $1 AND until > now()`, [ctx.userId]);
      out.throttled = !!t;
    }
    for (const b of await this.list()) {
      const applies = b.scope === 'global' || (b.scope === 'provider' && ctx.providers.includes(b.scope_ref)) ||
        (b.scope === 'user' && b.scope_ref === ctx.userId) || (b.scope === 'workflow' && b.scope_ref === ctx.workflow);
      if (!applies) continue;
      const spent = await this.spent(b.scope, b.scope_ref, b.period, now);
      const ev = evaluateBudget(b, spent, now);
      if (ev.crossed.length) await this.warn(b, ev.pct, spent, ev.crossed, now).catch(() => {});
      if (ev.blocked) {
        if (b.scope === 'provider') out.pausedProviders.push(b.scope_ref);
        else out.blocked ??= { scope: b.scope, ref: b.scope_ref, message: 'AI search is paused for now because a spending limit was reached. It resumes automatically, or contact us on WhatsApp if you need it right away.' };
      }
    }
    return out;
  }

  // Every 15 minutes: raise any threshold already crossed, even when nobody is asking questions.
  async sweep(now = new Date()): Promise<number> {
    let n = 0;
    this.spendCache.clear();
    for (const b of await this.list()) {
      const spent = await this.spent(b.scope, b.scope_ref, b.period, now);
      const ev = evaluateBudget(b, spent, now);
      if (ev.crossed.length) { await this.warn(b, ev.pct, spent, ev.crossed, now); n++; }
    }
    return n;
  }
}
