import { AlertCenter } from './alerts';
import { BudgetGuard } from './budget-guard';
import { DbLike, PriceCache } from './prices';
import {
  abuseRule, spikeRule, doBudgetRule, forecastRule, gcpBudgetRule, growthRule, isDue, lowBalanceRule, pendingRule, providerLimitRule, reconcileRule,
  Candidate, RuleLimits, DEFAULT_LIMITS, Schedule, chicagoParts, TZ,
} from './rules';
import { FetchFn, fetchAnthropic, fetchDeepseekBalance, fetchDoBalance, fetchDoInvoicePreview, GcpBudgetNotice, Metric } from './sync';
import { UsageLog } from './usage';

export interface JobConfig {
  doToken?: string; anthropicAdminKey?: string; deepseekKey?: string;
  lowBalanceUsd: number; abuseHourlyUsd: number;
  emailTo?: string; origin: string;
}
export interface JobDeps {
  db: DbLike; prices: PriceCache; usage: UsageLog; alerts: AlertCenter; guard: BudgetGuard; cfg: JobConfig;
  sendMail: (to: string, subject: string, text: string) => Promise<boolean>;
  fetchFn?: FetchFn; log?: (m: string) => void;
}
interface JobDef { name: string; schedule: Schedule; enabled?: (c: JobConfig) => boolean; run: (now: Date) => Promise<string> }

const usd = (n: number | null | undefined) => (n == null ? 'n/a' : `$${n.toFixed(2)}`);

export class BillingJobs {
  private readonly limits: RuleLimits;
  constructor(private readonly d: JobDeps) { this.limits = { ...DEFAULT_LIMITS, lowBalanceUsd: d.cfg.lowBalanceUsd }; }
  private get f() { return this.d.fetchFn ?? fetch; }

  // ---------- snapshots ----------
  async snapshot(provider: string, metrics: Metric[]) {
    for (const m of metrics) await this.d.db.query('INSERT INTO provider_snapshots(provider, metric, value, raw) VALUES ($1, $2, $3, $4)', [provider, m.metric, m.value, m.raw == null ? null : JSON.stringify(m.raw)]);
  }
  async latest(provider: string, metric: string, maxAgeMs?: number): Promise<{ ts: Date; value: number | null; raw: any } | null> {
    const r = await this.d.db.one(`SELECT ts, value::float AS value, raw FROM provider_snapshots WHERE provider = $1 AND metric = $2 ${maxAgeMs ? `AND ts > now() - interval '${Math.round(maxAgeMs / 1000)} seconds'` : ''} ORDER BY ts DESC LIMIT 1`, [provider, metric]);
    return r;
  }
  private async valueAt(provider: string, metric: string, olderThanDays: number): Promise<number | null> {
    const r = await this.d.db.one(`SELECT value::float AS value FROM provider_snapshots WHERE provider = $1 AND metric = $2 AND ts <= now() - ($3 || ' days')::interval AND ts >= date_trunc('month', now()) ORDER BY ts DESC LIMIT 1`, [provider, metric, String(olderThanDays)]);
    return r?.value ?? null;
  }

  // ---------- jobs ----------
  async doBalance() { await this.snapshot('digitalocean', await fetchDoBalance(this.d.cfg.doToken!, this.f)); return 'balance saved'; }
  async doInvoice() { await this.snapshot('digitalocean', await fetchDoInvoicePreview(this.d.cfg.doToken!, this.f)); return 'invoice lines saved'; }

  async anthropic(now: Date) {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const s = await fetchAnthropic(this.d.cfg.anthropicAdminKey!, monthStart, now, this.f);
    await this.snapshot('claude', [{ metric: 'anthropic_mtd_cost_usd', value: s.mtdUsd, raw: { days: s.days, byModel: s.byModel, tokensByModel: s.tokensByModel } }]);
    return `month to date ${usd(s.mtdUsd)}`;
  }
  async deepseek() { await this.snapshot('deepseek', await fetchDeepseekBalance(this.d.cfg.deepseekKey!, this.f)); return 'balance saved'; }

  // A Google Cloud budget notice (Pub/Sub push). Called by the webhook, not on a schedule.
  async gcpNotice(n: GcpBudgetNotice, now = new Date()) {
    await this.snapshot('gemini', [{ metric: 'gcp_cost_usd', value: n.costUsd, raw: { budget: n.budgetUsd, threshold: n.threshold, forecast: n.forecast, name: n.name } }, { metric: 'gcp_budget_usd', value: n.budgetUsd }]);
    if (n.forecast) return null;     // a forecast notice is informational; only real spend raises alerts
    const c = gcpBudgetRule(n.costUsd, n.budgetUsd, n.threshold, now);
    if (c) await this.d.alerts.raise(c);
    return c;
  }

  // Rules every 15 minutes.
  async alertRules(now: Date): Promise<string> {
    const db = this.d.db; const out: Candidate[] = [];
    const nowIso = now.toISOString();

    // Spike: provider cost in the last hour vs the average of the same hour on each of the last 7 days.
    const spikes = await db.query(
      `WITH cur AS (SELECT provider, sum(cost_usd)::float AS usd FROM ai_usage_logs WHERE ts > $1::timestamptz - interval '1 hour' AND ts <= $1::timestamptz GROUP BY provider),
            past AS (SELECT l.provider, sum(l.cost_usd)::float / 7 AS avg_usd
                       FROM ai_usage_logs l JOIN generate_series(1, 7) k ON l.ts > $1::timestamptz - (k || ' days')::interval - interval '1 hour' AND l.ts <= $1::timestamptz - (k || ' days')::interval
                      GROUP BY l.provider)
       SELECT cur.provider, cur.usd, COALESCE(past.avg_usd, 0) AS avg_usd FROM cur LEFT JOIN past USING (provider)`, [nowIso]);
    for (const r of spikes) { const c = spikeRule(r.provider, r.usd, r.avg_usd, now, this.limits); if (c) out.push(c); }

    // Forecast against the monthly budgets (global and per provider).
    const monthBudgets = await db.query(`SELECT scope, scope_ref, amount_usd::float AS amount FROM budgets WHERE enabled AND period = 'month' AND scope IN ('global', 'provider')`);
    for (const b of monthBudgets) {
      const mtd = await this.d.guard.spent(b.scope, b.scope_ref, 'month', now);
      const c = forecastRule(b.scope, b.scope_ref, mtd, b.amount, now, this.limits); if (c) out.push(c);
    }

    // Prepaid balance (DeepSeek, only when a key is set).
    if (this.d.cfg.deepseekKey) {
      const bal = await this.latest('deepseek', 'deepseek_balance', 3 * 3600_000); const av = await this.latest('deepseek', 'deepseek_available', 3 * 3600_000);
      if (av) { const c = lowBalanceRule('deepseek', bal?.value ?? null, av.value === 1, now, this.limits); if (c) out.push(c); }
    }

    // Anthropic month-to-date against the spend limit saved in budgets (provider 'claude', month).
    const lim = await db.one(`SELECT amount_usd::float AS amount FROM budgets WHERE enabled AND scope = 'provider' AND scope_ref = 'claude' AND period = 'month'`);
    if (lim) {
      const snap = this.d.cfg.anthropicAdminKey ? await this.latest('claude', 'anthropic_mtd_cost_usd', 3 * 3600_000) : null;
      const mtd = snap?.value ?? await this.d.guard.spent('provider', 'claude', 'month', now);
      const c = providerLimitRule('claude', mtd, lim.amount, now, this.limits); if (c) out.push(c);
    }

    // DigitalOcean: usage against its budget; fast-growing bandwidth and storage lines.
    if (this.d.cfg.doToken) {
      const mtd = await this.latest('digitalocean', 'do_month_to_date_usage', 12 * 3600_000);
      const b = await db.one(`SELECT amount_usd::float AS amount, warn_pcts FROM budgets WHERE enabled AND scope = 'provider' AND scope_ref = 'digitalocean' AND period = 'month'`);
      if (mtd?.value != null && b) out.push(...doBudgetRule(mtd.value, b.amount, b.warn_pcts, now));
      for (const [item, metrics] of [['bandwidth', ['do_line_bandwidth']], ['storage', ['do_line_volumes', 'do_line_spaces']]] as const) {
        let now0 = 0, d7 = 0, d14 = 0, ok = true;
        for (const m of metrics) {
          const a = (await this.latest('digitalocean', m))?.value, b7 = await this.valueAt('digitalocean', m, 7), b14 = await this.valueAt('digitalocean', m, 14);
          if (a == null || b7 == null || b14 == null) { ok = false; break; }
          now0 += a; d7 += b7; d14 += b14;
        }
        if (ok) { const c = growthRule(item, now0 - d7, d7 - d14, now); if (c) out.push(c); }
      }
    }

    // Calls still without a price after a day.
    const pend = await db.one(`SELECT count(*)::int AS n FROM ai_usage_logs WHERE cost_status = 'pending' AND ts < now() - interval '24 hours'`);
    if (pend?.n) {
      const models = await db.query(`SELECT DISTINCT provider || '/' || model AS m FROM ai_usage_logs WHERE cost_status = 'pending' AND ts < now() - interval '24 hours' LIMIT 5`);
      const c = pendingRule(pend.n, models.map(m => m.m), now); if (c) out.push(c);
    }

    // Abuse guard: one account's last hour against its own 7-day hourly average.
    const users = await db.query(
      `SELECT user_id, sum(cost_usd) FILTER (WHERE ts > $1::timestamptz - interval '1 hour')::float AS hour_usd,
              (sum(cost_usd) FILTER (WHERE ts <= $1::timestamptz - interval '1 hour')::float / 168) AS avg_usd
         FROM ai_usage_logs WHERE user_id IS NOT NULL AND ts > $1::timestamptz - interval '7 days'
        GROUP BY user_id HAVING sum(cost_usd) FILTER (WHERE ts > $1::timestamptz - interval '1 hour') >= 0.5`, [nowIso]);
    let throttled = 0;
    for (const u of users) {
      const c = abuseRule(u.user_id, u.hour_usd, u.avg_usd ?? 0, this.d.cfg.abuseHourlyUsd, now);
      if (!c) continue;
      out.push(c);
      await db.query(`INSERT INTO billing_throttles(user_id, reason, until) VALUES ($1, $2, now() + interval '1 hour') ON CONFLICT (user_id) DO UPDATE SET reason = $2, until = now() + interval '1 hour'`, [u.user_id, c.message.slice(0, 200)]);
      throttled++;
    }

    let created = 0;
    for (const c of out) if ((await this.d.alerts.raise(c)).created) created++;
    const swept = await this.d.guard.sweep(now);
    return `${out.length} condition(s), ${created} new alert(s), ${swept} budget(s) over a warning level, ${throttled} account(s) slowed`;
  }

  // Our log against what the provider billed, for each of the last 3 finished UTC days.
  async reconcile(now: Date): Promise<string> {
    const snap = await this.latest('claude', 'anthropic_mtd_cost_usd');
    const days: Record<string, number> = snap?.raw?.days ?? {};
    let flagged = 0;
    for (let k = 1; k <= 3; k++) {
      const day = new Date(now.getTime() - k * 86400_000).toISOString().slice(0, 10);
      if (days[day] == null) continue;
      const ours = await this.d.db.one(`SELECT COALESCE(sum(cost_usd), 0)::float AS usd FROM ai_usage_logs WHERE provider = 'claude' AND ts >= $1::date AND ts < $1::date + 1`, [day]);
      const c = reconcileRule('claude', day, ours?.usd ?? 0, days[day]);
      if (c && (await this.d.alerts.raise(c)).created) flagged++;
    }
    return `${flagged} day(s) more than 10% apart`;
  }

  // Yesterday's cost by provider, top users and commands, budgets and balances: one email at 8:00 a.m. Chicago.
  async digest(now: Date): Promise<string> {
    const db = this.d.db;
    const yday = chicagoParts(new Date(now.getTime() - 86400_000)).date;
    const win = `(ts AT TIME ZONE '${TZ}')::date = $1::date`;
    const byProvider = await db.query(`SELECT provider, count(*)::int AS n, COALESCE(sum(cost_usd), 0)::float AS usd FROM ai_usage_logs WHERE ${win} GROUP BY provider ORDER BY usd DESC`, [yday]);
    const users = await db.query(`SELECT COALESCE(u.email, l.user_id) AS who, count(*)::int AS n, COALESCE(sum(l.cost_usd), 0)::float AS usd FROM ai_usage_logs l LEFT JOIN users u ON u.id = l.user_id WHERE ${win.replace(/\bts\b/g, 'l.ts')} AND l.user_id IS NOT NULL GROUP BY 1 ORDER BY usd DESC LIMIT 5`, [yday]);
    const commands = await db.query(`SELECT COALESCE(command, 'unknown') AS command, count(*)::int AS n, COALESCE(sum(cost_usd), 0)::float AS usd FROM ai_usage_logs WHERE ${win} GROUP BY 1 ORDER BY usd DESC LIMIT 5`, [yday]);
    const total = byProvider.reduce((s, r) => s + r.usd, 0);
    const budgets = await db.query(`SELECT scope, scope_ref, period, amount_usd::float AS amount, hard_stop FROM budgets WHERE enabled ORDER BY scope, period`);
    const budgetLines: string[] = [];
    for (const b of budgets) { const spent = await this.d.guard.spent(b.scope, b.scope_ref, b.period, now); budgetLines.push(`  ${b.scope === 'global' ? 'All AI' : b.scope_ref} ${b.period}: ${usd(spent)} of ${usd(b.amount)} (${(spent / b.amount * 100).toFixed(0)}%)${b.hard_stop ? ', hard stop on' : ''}`); }
    const bal: string[] = [];
    const ds = await this.latest('deepseek', 'deepseek_balance'); if (ds && this.d.cfg.deepseekKey) bal.push(`  DeepSeek balance: ${usd(ds.value)}`);
    const an = await this.latest('claude', 'anthropic_mtd_cost_usd'); if (an) bal.push(`  Claude month to date (Anthropic): ${usd(an.value)}`);
    const dd = await this.latest('digitalocean', 'do_month_to_date_usage'); if (dd) bal.push(`  DigitalOcean month to date: ${usd(dd.value)}`);
    const open = await this.d.alerts.openCounts();
    const text = [
      `Vivid Engine billing digest for ${yday}`,
      `Total AI cost: ${usd(total)}`, '',
      'By provider:', ...(byProvider.length ? byProvider.map(r => `  ${r.provider}: ${usd(r.usd)} (${r.n} calls)`) : ['  no calls']), '',
      'Top accounts:', ...(users.length ? users.map(r => `  ${r.who}: ${usd(r.usd)} (${r.n} calls)`) : ['  none']), '',
      'Top commands:', ...(commands.length ? commands.map(r => `  ${r.command}: ${usd(r.usd)} (${r.n} calls)`) : ['  none']), '',
      'Budgets:', ...(budgetLines.length ? budgetLines : ['  none set']), '',
      'Provider balances:', ...(bal.length ? bal : ['  no provider sync is set up yet']), '',
      `Open alerts: ${open.critical} critical, ${open.warn} warning, ${open.info} info`,
      `Dashboard: ${this.d.cfg.origin}/admin/billing`,
    ].join('\n');
    const ok = this.d.cfg.emailTo ? await this.d.sendMail(this.d.cfg.emailTo, `Vivid billing digest ${yday}: ${usd(total)}`, text) : false;
    return ok ? `digest sent (${usd(total)})` : 'digest built, not emailed (no ALERT_EMAIL_TO or SMTP)';
  }

  // ---------- schedule ----------
  jobs(): JobDef[] {
    const m = 60_000, h = 3600_000;
    return [
      { name: 'do-balance', schedule: { every: 6 * h }, enabled: c => !!c.doToken, run: () => this.doBalance() },
      { name: 'do-invoice', schedule: { every: 24 * h }, enabled: c => !!c.doToken, run: () => this.doInvoice() },
      { name: 'anthropic', schedule: { every: h }, enabled: c => !!c.anthropicAdminKey, run: n => this.anthropic(n) },
      { name: 'deepseek', schedule: { every: 15 * m }, enabled: c => !!c.deepseekKey, run: () => this.deepseek() },
      { name: 'reprice-pending', schedule: { every: 15 * m }, run: async () => `${await this.d.usage.repricePending()} call(s) priced` },
      { name: 'refresh-summary', schedule: { every: 15 * m }, run: async () => { await this.d.db.query('REFRESH MATERIALIZED VIEW CONCURRENTLY billing_summary'); return 'refreshed'; } },
      { name: 'alert-rules', schedule: { every: 15 * m }, run: n => this.alertRules(n) },
      { name: 'renotify-critical', schedule: { every: 30 * m }, run: async () => `${await this.d.alerts.renotifyCritical()} reminder(s)` },
      { name: 'reconcile', schedule: { dailyAt: 3 }, enabled: c => !!c.anthropicAdminKey, run: n => this.reconcile(n) },
      { name: 'digest', schedule: { dailyAt: 8 }, run: n => this.digest(n) },
    ];
  }

  // One pass: runs whatever is due. Each job is claimed with a compare-and-set on last_run, so two copies of the
  // app (or a restart in the middle of a pass) never run the same job twice.
  async tick(now = new Date()): Promise<{ job: string; ok: boolean; detail: string }[]> {
    const done: { job: string; ok: boolean; detail: string }[] = [];
    const rows = await this.d.db.query('SELECT job, last_run FROM billing_job_runs');
    const last = new Map<string, Date | null>(rows.map(r => [r.job, r.last_run ? new Date(r.last_run) : null]));
    for (const j of this.jobs()) {
      if (j.enabled && !j.enabled(this.d.cfg)) continue;
      const lastRun = last.get(j.name) ?? null;
      if (!isDue(j.schedule, now, lastRun)) continue;
      const claimed = await this.d.db.one(
        `INSERT INTO billing_job_runs(job, last_run, runs) VALUES ($1, $2, 1)
         ON CONFLICT (job) DO UPDATE SET last_run = $2, runs = billing_job_runs.runs + 1 WHERE billing_job_runs.last_run IS NOT DISTINCT FROM $3 RETURNING job`,
        [j.name, now.toISOString(), lastRun ? lastRun.toISOString() : null]);
      if (!claimed) continue;
      try {
        const detail = await j.run(now);
        await this.d.db.query('UPDATE billing_job_runs SET last_ok = $2, last_error = NULL WHERE job = $1', [j.name, now.toISOString()]);
        done.push({ job: j.name, ok: true, detail });
      } catch (e) {
        const msg = String((e as Error).message ?? e).replace(/(sk|key|Bearer)[-_ ]?[A-Za-z0-9._-]{8,}/g, '[hidden]').slice(0, 200);
        await this.d.db.query('UPDATE billing_job_runs SET last_error = $2 WHERE job = $1', [j.name, msg]);
        this.d.log?.(`Billing job ${j.name} failed: ${msg}`);
        done.push({ job: j.name, ok: false, detail: msg });
      }
    }
    return done;
  }

  async health() {
    const rows = await this.d.db.query('SELECT job, last_run, last_ok, last_error, runs FROM billing_job_runs ORDER BY job');
    const byName = new Map(rows.map(r => [r.job, r]));
    return this.jobs().map(j => ({
      job: j.name, configured: !j.enabled || j.enabled(this.d.cfg),
      last_run: byName.get(j.name)?.last_run ?? null, last_ok: byName.get(j.name)?.last_ok ?? null, last_error: byName.get(j.name)?.last_error ?? null,
    }));
  }
}
