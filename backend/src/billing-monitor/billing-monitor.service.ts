import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { config } from '../config';
import { Db } from '../db';
import { Mail } from '../mail';
import { AlertCenter, makeNotify } from './alerts';
import { BudgetGuard } from './budget-guard';
import { BillingJobs } from './jobs';
import { PriceCache } from './prices';
import { BillingReports } from './reports';
import { billingErrorRule, TZ } from './rules';
import { parseGcpBudget, pushTokenOk } from './sync';
import { UsageEntry, UsageLog } from './usage';

const PAUSE_MS = 10 * 60_000;   // matches the router's own pause after a billing error

// The Nest face of the Billing Monitor: builds the pieces from the environment and runs the background jobs.
// Everything with logic is in the plain files next to this one so it can be tested without Nest.
@Injectable()
export class BillingMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Billing');
  readonly prices: PriceCache;
  readonly usage: UsageLog;
  readonly alerts: AlertCenter;
  readonly guard: BudgetGuard;
  readonly jobs: BillingJobs;
  readonly reports: BillingReports;
  private timers: ReturnType<typeof setInterval>[] = [];

  constructor(readonly db: Db, mail: Mail) {
    this.prices = new PriceCache(db);
    this.usage = new UsageLog(db, this.prices, { onError: m => this.log.warn(m) });
    const notify = makeNotify({ sendMail: (to, s, t) => mail.send(to, s, t), emailTo: config.ALERT_EMAIL_TO || config.STAFF_NOTIFY_EMAIL, webhookUrl: config.ALERT_WEBHOOK_URL, origin: config.PUBLIC_ORIGIN });
    this.alerts = new AlertCenter(db, notify);
    this.guard = new BudgetGuard(db, this.alerts);
    this.jobs = new BillingJobs({
      db, prices: this.prices, usage: this.usage, alerts: this.alerts, guard: this.guard,
      cfg: { doToken: config.DO_BILLING_TOKEN, anthropicAdminKey: config.ANTHROPIC_ADMIN_KEY, deepseekKey: config.DEEPSEEK_API_KEY, lowBalanceUsd: config.LOW_BALANCE_USD, abuseHourlyUsd: config.ABUSE_USER_HOURLY_USD, emailTo: config.ALERT_EMAIL_TO || config.STAFF_NOTIFY_EMAIL, origin: config.PUBLIC_ORIGIN },
      sendMail: (to, s, t) => mail.send(to, s, t), log: m => this.log.warn(m),
    });
    this.reports = new BillingReports(db, this.prices);
  }

  onModuleInit() {
    this.prices.load().catch(e => this.log.warn(`Could not load model prices yet: ${e.message}`));
    // Usage rows are written in small batches off the answer path.
    this.timers.push(setInterval(() => this.usage.flush().catch(() => {}), 2000));
    if (config.BILLING_MONITOR_JOBS === 'on') {
      const run = () => this.jobs.tick().then(done => { for (const d of done) this.log.log(`${d.job}: ${d.ok ? d.detail : `FAILED ${d.detail}`}`); }).catch(e => this.log.warn(`Billing jobs failed: ${e.message}`));
      setTimeout(run, 30_000).unref();
      this.timers.push(setInterval(run, 60_000));
    } else this.log.warn('BILLING_MONITOR_JOBS is off: no provider sync, alert rules or digest will run.');
    this.timers.forEach(t => t.unref());
  }
  async onModuleDestroy() {
    this.timers.forEach(clearInterval);
    await this.usage.flush().catch(() => {});
  }

  // One row per call. Returns at once.
  record(e: UsageEntry) { this.usage.record(e); }

  // A one-way fingerprint of the question: lets the Optimize panel see repeats without keeping any text.
  queryHash(question: string): string {
    const norm = question.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
    return createHmac('sha256', config.PUBLIC_CLIENT_SECRET).update(`billing-query:${norm}`).digest('hex').slice(0, 32);
  }

  // A provider refused a call for billing reasons (out of credit, spend cap, bad key): remember it, raise a
  // critical alert, and let the router send the question elsewhere. No retry.
  async billingError(provider: string, message: string) {
    try {
      await this.db.query(
        `INSERT INTO provider_state(provider, status, reason, since, until) VALUES ($1, 'unavailable_billing', $2, now(), now() + ($3 || ' milliseconds')::interval)
         ON CONFLICT (provider) DO UPDATE SET status = 'unavailable_billing', reason = $2, since = now(), until = now() + ($3 || ' milliseconds')::interval`,
        [provider, message.replace(/(sk|key|Bearer)[-_ ]?[A-Za-z0-9._-]{8,}/g, '[hidden]').slice(0, 200), String(PAUSE_MS)]);
      await this.alerts.raise(billingErrorRule(provider, message, new Date()));
    } catch (e) { this.log.warn(`Could not record billing error for ${provider}: ${(e as Error).message}`); }
  }

  // After a restart, engines that were paused for billing stay paused for the rest of their time.
  async pausedProviders(): Promise<{ provider: string; ms: number }[]> {
    try {
      const rows = await this.db.query(`SELECT provider, GREATEST(0, extract(epoch FROM (until - now())) * 1000)::int AS ms FROM provider_state WHERE status = 'unavailable_billing' AND until > now()`);
      return rows.map(r => ({ provider: r.provider, ms: r.ms }));
    } catch { return []; }
  }

  async gcpWebhook(body: unknown, token: string | undefined): Promise<'ok' | 'forbidden' | 'ignored'> {
    if (!pushTokenOk(token, config.GCP_BUDGET_PUSH_TOKEN)) return 'forbidden';
    const n = parseGcpBudget(body);
    if (!n) return 'ignored';
    const c = await this.jobs.gcpNotice(n);
    if (c?.severity === 'critical') await this.billingError('gemini', 'Google Cloud budget reached; a spend cap pauses Gemini until the next period.');
    return 'ok';
  }

  timezone() { return TZ; }
}
