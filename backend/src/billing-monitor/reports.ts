import { DbLike, PriceCache } from './prices';
import { chicagoParts, daysInMonth, TZ } from './rules';

export type Period = 'day' | 'week' | 'month';
export const parsePeriod = (v: unknown): Period => (v === 'day' || v === 'week' || v === 'month' ? v : 'month');

// SQL for "the start of this period" in America/Chicago (constants only, never user text).
const NOW_LOCAL = `(now() AT TIME ZONE '${TZ}')`;
export const START_SQL: Record<Period, string> = {
  day: `date_trunc('day', ${NOW_LOCAL}) AT TIME ZONE '${TZ}'`,
  week: `(date_trunc('day', ${NOW_LOCAL}) - interval '6 days') AT TIME ZONE '${TZ}'`,
  month: `date_trunc('month', ${NOW_LOCAL}) AT TIME ZONE '${TZ}'`,
};
const num = (v: unknown) => Number(v ?? 0);

export class BillingReports {
  constructor(private readonly db: DbLike, private readonly prices: PriceCache) {}

  private async total(p: Period): Promise<number> {
    const r = await this.db.one(`SELECT COALESCE(sum(cost_usd), 0)::float AS usd FROM ai_usage_logs WHERE ts >= ${START_SQL[p]}`);
    return num(r?.usd);
  }

  async summary(now = new Date()) {
    const [today, week, month] = await Promise.all([this.total('day'), this.total('week'), this.total('month')]);
    const c = chicagoParts(now);
    const elapsed = (c.d - 1) + (c.h + c.min / 60) / 24;
    const forecast = elapsed >= 1 ? month * (daysInMonth(c.y, c.m) / elapsed) : null;
    const budget = await this.db.one(`SELECT amount_usd::float AS amount FROM budgets WHERE enabled AND scope = 'global' AND period = 'month'`);
    const pending = await this.db.one(`SELECT count(*)::int AS n FROM ai_usage_logs WHERE cost_status = 'pending'`);
    const failed = await this.db.one(`SELECT count(*)::int AS n FROM ai_usage_logs WHERE ts >= ${START_SQL.day} AND http_status >= 400`);
    const daily = await this.db.query(
      `SELECT day::text, provider, sum(cost_usd)::float AS usd, sum(requests)::int AS requests FROM billing_summary WHERE day >= (${NOW_LOCAL}::date - 29) GROUP BY day, provider ORDER BY day`);
    const byModel = await this.db.query(
      `SELECT provider, model, sum(cost_usd)::float AS usd, sum(requests)::int AS requests FROM billing_summary WHERE day >= (${NOW_LOCAL}::date - 29) GROUP BY provider, model ORDER BY usd DESC LIMIT 12`);
    return {
      cards: { today, week, month, forecast, budget_month: budget?.amount ?? null, budget_remaining: budget ? budget.amount - month : null, pending_calls: num(pending?.n), failed_today: num(failed?.n) },
      daily, byModel, timezone: TZ,
    };
  }

  // Cost grouped one way. Keys are fixed expressions, never request text.
  async breakdown(dim: 'model' | 'user' | 'workflow' | 'feature' | 'command', p: Period) {
    const sel: Record<string, { key: string; join?: string; group: string }> = {
      model: { key: `l.provider || ' / ' || l.model`, group: `l.provider, l.model` },
      user: { key: `COALESCE(u.email, CASE WHEN l.user_id LIKE 'guest:%' THEN 'Guests (not signed in)' ELSE l.user_id END, 'unknown')`, join: 'LEFT JOIN users u ON u.id = l.user_id', group: `l.user_id, u.email` },
      workflow: { key: `COALESCE(l.workflow, 'unknown')`, group: `l.workflow` },
      feature: { key: `COALESCE(l.workflow, 'unknown') || ' / ' || COALESCE(l.feature, 'unknown')`, group: `l.workflow, l.feature` },
      command: { key: `COALESCE(l.command, 'unknown')`, group: `l.command` },
    };
    const s = sel[dim];
    const rows = await this.db.query(
      `SELECT ${s.key} AS key, count(*)::int AS requests, COALESCE(sum(l.cost_usd), 0)::float AS usd,
              COALESCE(sum(l.input_tokens), 0)::bigint AS input_tokens, COALESCE(sum(l.output_tokens), 0)::bigint AS output_tokens,
              count(*) FILTER (WHERE l.cost_status = 'pending')::int AS pending, count(*) FILTER (WHERE l.http_status >= 400)::int AS failed
         FROM ai_usage_logs l ${s.join ?? ''} WHERE l.ts >= ${START_SQL[p]} GROUP BY ${s.group} ORDER BY usd DESC, requests DESC LIMIT 50`);
    return rows.map(r => ({ ...r, input_tokens: num(r.input_tokens), output_tokens: num(r.output_tokens), usd_per_request: r.requests ? r.usd / r.requests : 0 }));
  }

  // The latest numbers each provider reported, plus our own month to date and any billing pause.
  async providers() {
    const snaps = await this.db.query(
      `SELECT DISTINCT ON (provider, metric) provider, metric, value::float AS value, ts, raw FROM provider_snapshots ORDER BY provider, metric, ts DESC`);
    const ours = await this.db.query(`SELECT provider, sum(cost_usd)::float AS usd, count(*)::int AS requests FROM ai_usage_logs WHERE ts >= ${START_SQL.month} GROUP BY provider`);
    const state = await this.db.query(`SELECT provider, status, reason, since, until FROM provider_state WHERE status <> 'ok' AND (until IS NULL OR until > now())`);
    const budgets = await this.db.query(`SELECT id, scope_ref, period, amount_usd::float AS amount, hard_stop FROM budgets WHERE enabled AND scope = 'provider'`);
    const ids = new Set<string>([...snaps.map(s => s.provider), ...ours.map(o => o.provider), ...budgets.map(b => b.scope_ref), ...state.map(s => s.provider), 'digitalocean', 'claude', 'gemini', 'perplexity']);
    return [...ids].sort().map(id => {
      const m: Record<string, { value: number | null; ts: Date; raw: any }> = {};
      for (const s of snaps.filter(x => x.provider === id)) m[s.metric] = { value: s.value, ts: s.ts, raw: s.raw };
      const mine = ours.find(o => o.provider === id);
      const budget = budgets.find(b => b.scope_ref === id && b.period === 'month') ?? null;
      const pct = budget ? (num(mine?.usd) / budget.amount) * 100 : null;
      const st = state.find(s => s.provider === id) ?? null;
      return {
        id, ours_month_usd: num(mine?.usd), ours_requests: num(mine?.requests), snapshots: m,
        budget: budget && { amount: budget.amount, hard_stop: budget.hard_stop, pct },
        paused: st && { reason: st.reason, since: st.since, until: st.until },
        level: st ? 'red' : pct == null ? 'none' : pct >= 100 ? 'red' : pct >= 80 ? 'amber' : 'green',
      };
    });
  }

  // Hints, not promises: what the last 30 days would have cost on the cheapest model of the same provider, how well
  // prompt caching is working, questions asked again and again, and tiny follow-up calls that could ride along.
  async optimize() {
    await this.prices.load();
    const since = `now() - interval '30 days'`;
    const groups = await this.db.query(
      `SELECT provider, model, COALESCE(command, 'unknown') AS command, count(*)::int AS requests,
              COALESCE(sum(input_tokens), 0)::bigint AS input_tokens, COALESCE(sum(output_tokens), 0)::bigint AS output_tokens,
              COALESCE(sum(cache_read_tokens), 0)::bigint AS cache_read, COALESCE(sum(cost_usd), 0)::float AS usd
         FROM ai_usage_logs WHERE ts >= ${since} AND (http_status IS NULL OR http_status < 400) AND cost_status = 'final' AND model <> '' GROUP BY 1, 2, 3`);
    const rows = this.prices.list();
    const unit = (provider: string, model: string) => {
      const get = (t: string) => rows.filter(r => r.provider === provider && r.model === model && r.token_type === t && r.unit === 'mtok').map(r => Number(r.price_usd))[0];
      return { input: get('input'), output: get('output') };
    };
    const cheaper: { provider: string; command: string; from: string; to: string; actual: number; would: number; saves: number; requests: number }[] = [];
    for (const g of groups) {
      const mine = unit(g.provider, g.model); if (mine.input == null || mine.output == null) continue;
      const alts = [...new Set(rows.filter(r => r.provider === g.provider && r.model !== '*' && r.model !== g.model).map(r => r.model))]
        .map(m => ({ m, ...unit(g.provider, m) })).filter(a => a.input != null && a.output != null && a.input! + a.output! < mine.input! + mine.output!)
        .sort((a, b) => (a.input! + a.output!) - (b.input! + b.output!));
      const alt = alts[0]; if (!alt) continue;
      const would = (num(g.input_tokens) * alt.input! + num(g.output_tokens) * alt.output!) / 1e6;
      const actual = (num(g.input_tokens) * mine.input! + num(g.output_tokens) * mine.output!) / 1e6;
      if (actual - would >= 0.05) cheaper.push({ provider: g.provider, command: g.command, from: g.model, to: alt.m, actual, would, saves: actual - would, requests: g.requests });
    }
    cheaper.sort((a, b) => b.saves - a.saves);

    const cache = groups.filter(g => g.provider === 'claude' && num(g.input_tokens) + num(g.cache_read) > 20000).map(g => ({
      model: g.model, command: g.command, hit_rate: num(g.cache_read) / Math.max(1, num(g.input_tokens) + num(g.cache_read)), input_tokens: num(g.input_tokens), cache_read: num(g.cache_read),
    })).filter(c => c.hit_rate < 0.3).sort((a, b) => b.input_tokens - a.input_tokens).slice(0, 5);

    const repeats = await this.db.query(
      `SELECT count(*)::int AS times, COALESCE(sum(cost_usd), 0)::float AS usd, min(command) AS command
         FROM ai_usage_logs WHERE ts >= now() - interval '7 days' AND query_hash IS NOT NULL AND feature = 'answer' AND cost_status = 'final'
        GROUP BY query_hash HAVING count(*) >= 3 ORDER BY usd DESC LIMIT 20`);
    const repeatSavings = repeats.reduce((s, r) => s + r.usd * (r.times - 1) / r.times, 0);

    const small = await this.db.one(
      `SELECT count(*)::int AS n, COALESCE(sum(cost_usd), 0)::float AS usd FROM ai_usage_logs WHERE ts >= ${since} AND feature = 'followups'`);
    return {
      cheaper_model: cheaper.slice(0, 6),
      low_cache_hit: cache,
      repeated_questions: { groups: repeats.length, calls_repeated: repeats.reduce((s, r) => s + r.times - 1, 0), could_save_usd: repeatSavings },
      batchable: { followup_calls: num(small?.n), followup_usd: num(small?.usd), note: 'Follow-up suggestions are a separate small call after every long answer. Asking for them in the answer call itself would remove these calls.' },
      caveat: 'Savings assume the cheaper model answers as well. Check quality before switching.',
    };
  }
}
