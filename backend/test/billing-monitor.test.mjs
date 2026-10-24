// Billing Monitor: cost math, alert rules and dedupe, provider fetchers, budgets, scheduling, and the database jobs.
// Pure tests need nothing. Database tests need TEST_DATABASE_URL (an empty scratch database), like history.test.mjs.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { openTestDb, makeUser, skipDb } from './helpers/db.mjs';

const require = createRequire(import.meta.url);
const dist = process.env.VE_DIST || new URL('../dist/', import.meta.url).pathname;
const cost = require(dist + 'billing-monitor/cost.js');
const rules = require(dist + 'billing-monitor/rules.js');
const sync = require(dist + 'billing-monitor/sync.js');
const { PriceCache } = require(dist + 'billing-monitor/prices.js');
const { UsageLog } = require(dist + 'billing-monitor/usage.js');
const { AlertCenter, makeNotify } = require(dist + 'billing-monitor/alerts.js');
const { BudgetGuard } = require(dist + 'billing-monitor/budget-guard.js');
const { BillingJobs } = require(dist + 'billing-monitor/jobs.js');
const { BillingReports } = require(dist + 'billing-monitor/reports.js');

const row = (provider, model, token_type, price_usd, extra = {}) => ({ provider, model, token_type, price_usd, unit: 'mtok', price_window: 'any', effective_from: '2000-01-01', effective_to: null, ...extra });
const at = new Date('2026-10-23T15:00:00Z');

// ---------- cost math ----------
test('cost: tokens are priced per million, from the table', () => {
  const rows = [row('claude', 'm1', 'input', 2), row('claude', 'm1', 'output', 10), row('claude', 'm1', 'cache_read', 0.2)];
  const r = cost.computeCost(rows, 'claude', 'm1', { input: 1000, output: 500, cacheRead: 10000 }, at);
  assert.equal(r.status, 'final'); assert.equal(r.source, 'computed');
  assert.equal(r.costUsd, 0.009);
});
test('cost: a model with no price is pending with no cost, never zero', () => {
  const r = cost.computeCost([row('claude', 'm1', 'input', 2)], 'claude', 'unknown-model', { input: 1000, output: 500 }, at);
  assert.equal(r.status, 'pending'); assert.equal(r.costUsd, null); assert.deepEqual(r.missing, ['input', 'output']);
});
test('cost: a missing price for one billed kind makes the whole call pending', () => {
  const r = cost.computeCost([row('claude', 'm1', 'input', 2)], 'claude', 'm1', { input: 1000, output: 500 }, at);
  assert.equal(r.status, 'pending'); assert.deepEqual(r.missing, ['output']);
});
test('cost: missing usage is pending, not free', () => {
  const r = cost.computeCost([row('claude', 'm1', 'input', 2)], 'claude', 'm1', {}, at);
  assert.equal(r.status, 'pending'); assert.equal(r.costUsd, null);
});
test('cost: a cost the provider reported wins; a failed call costs nothing and is final', () => {
  assert.deepEqual(cost.computeCost([], 'perplexity', 'x', { input: 5 }, at, { reportedUsd: 0.0123 }), { costUsd: 0.0123, status: 'final', source: 'reported', missing: [] });
  const f = cost.computeCost([], 'claude', 'm1', {}, at, { failed: true });
  assert.equal(f.costUsd, 0); assert.equal(f.status, 'final'); assert.equal(f.source, 'failed');
});
test('cost: per-call price stands in when a provider has no token prices', () => {
  const rows = [row('gemini', '*', 'call', 0.04, { unit: 'unit' })];
  const r = cost.computeCost(rows, 'gemini', 'gemini-x', { input: 900, output: 300 }, at);
  assert.equal(r.status, 'final'); assert.equal(r.costUsd, 0.04);
});
test('cost: searches are priced per search', () => {
  const rows = [row('claude', 'm1', 'input', 1), row('claude', 'm1', 'output', 1), row('claude', 'm1', 'search', 0.01, { unit: 'unit' })];
  assert.equal(cost.computeCost(rows, 'claude', 'm1', { input: 0, output: 1_000_000, searches: 3 }, at).costUsd, 1.03);
});
test('cost: exact model beats wildcard, and a newer price starts on its date', () => {
  const rows = [
    row('claude', '*', 'input', 9), row('claude', 'm1', 'input', 2),
    row('claude', 'm2', 'input', 1, { effective_to: '2026-10-01T00:00:00Z' }), row('claude', 'm2', 'input', 3, { effective_from: '2026-10-01T00:00:00Z' }),
  ];
  assert.equal(cost.pickPrice(rows, 'claude', 'm1', 'input', at).price_usd, 2);
  assert.equal(cost.pickPrice(rows, 'claude', 'other', 'input', at).price_usd, 9);
  assert.equal(cost.pickPrice(rows, 'claude', 'm2', 'input', at).price_usd, 3);
  assert.equal(cost.pickPrice(rows, 'claude', 'm2', 'input', new Date('2026-09-15T00:00:00Z')).price_usd, 1);
});
test('cost: DeepSeek peak and off-peak windows', () => {
  assert.equal(cost.deepseekWindow(new Date('2026-10-23T02:30:00Z')), 'peak');      // Friday 02:30 UTC
  assert.equal(cost.deepseekWindow(new Date('2026-10-23T07:00:00Z')), 'peak');
  assert.equal(cost.deepseekWindow(new Date('2026-10-23T12:00:00Z')), 'offpeak');
  assert.equal(cost.deepseekWindow(new Date('2026-10-24T02:30:00Z')), 'offpeak');   // Saturday
  const rows = [row('deepseek', 'd', 'input', 0.4, { price_window: 'peak' }), row('deepseek', 'd', 'input', 0.2, { price_window: 'offpeak' })];
  assert.equal(cost.computeCost(rows, 'deepseek', 'd', { input: 1_000_000 }, new Date('2026-10-23T02:30:00Z')).costUsd, 0.4);
  assert.equal(cost.computeCost(rows, 'deepseek', 'd', { input: 1_000_000 }, new Date('2026-10-23T12:00:00Z')).costUsd, 0.2);
});
test('cost: money is parsed from decimal strings without float error', () => {
  assert.equal(cost.parseMoneyMicros('0.1') + cost.parseMoneyMicros('0.2'), cost.parseMoneyMicros('0.3'));
  assert.equal(cost.parseMoneyMicros('110.00'), 110_000_000);
  assert.equal(cost.parseMoneyMicros('12.3456789'), 12_345_679);
  assert.equal(cost.parseMoneyMicros('abc'), null);
  assert.equal(cost.parseMoney('-1.5'), -1.5);
});
test('cost: model ids with a vendor prefix price by their last part', () => {
  assert.equal(PriceCache.modelKey('perplexity:anthropic/claude-sonnet-5-5'), 'claude-sonnet-5-5');
  assert.equal(PriceCache.modelKey('claude-opus-5-5'), 'claude-opus-5-5');
});

// ---------- rules ----------
test('rules: spike needs more than 3x the usual and a minimum spend', () => {
  assert.equal(rules.spikeRule('claude', 0.5, 0.01, at), null);                   // under the minimum
  assert.equal(rules.spikeRule('claude', 2.9, 1, at), null);                      // under 3x
  const c = rules.spikeRule('claude', 3.5, 1, at);
  assert.equal(c.severity, 'warn'); assert.match(c.dedupeKey, /^spike:claude:2026-10-23T10$/);   // Chicago hour, so each hour alerts once
  assert.ok(rules.spikeRule('claude', 4, 0, at));                                 // no history at all but real money
});
test('rules: forecast compares month-to-date pace with the monthly budget', () => {
  const day10 = new Date('2026-10-10T17:00:00Z');   // about 9.5 days in
  const c = rules.forecastRule('global', '', 100, 200, day10);
  assert.ok(c && c.value > 300 && c.threshold === 200);
  assert.equal(rules.forecastRule('global', '', 50, 200, day10), null);
  assert.equal(rules.forecastRule('global', '', 100, 200, new Date('2026-10-01T18:00:00Z')), null);   // too early to project
  assert.equal(c.dedupeKey, 'forecast:global::2026-10');
});
test('rules: low balance warns, unavailable is critical, both once a day', () => {
  assert.equal(rules.lowBalanceRule('deepseek', 12, true, at), null);
  assert.equal(rules.lowBalanceRule('deepseek', 3, true, at).severity, 'warn');
  const crit = rules.lowBalanceRule('deepseek', 0, false, at);
  assert.equal(crit.severity, 'critical');
  assert.notEqual(crit.dedupeKey, rules.lowBalanceRule('deepseek', 3, true, at).dedupeKey);
});
test('rules: Anthropic limit at 80% warns and at 100% is critical', () => {
  assert.equal(rules.providerLimitRule('claude', 30, 50, at), null);
  assert.equal(rules.providerLimitRule('claude', 40, 50, at).severity, 'warn');
  assert.equal(rules.providerLimitRule('claude', 55, 50, at).severity, 'critical');
});
test('rules: DigitalOcean budget and growth', () => {
  const c = rules.doBudgetRule(52, 60, [50, 80, 100], at);
  assert.equal(c.length, 1); assert.match(c[0].dedupeKey, /:80$/);                // only the highest level crossed
  assert.equal(rules.growthRule('bandwidth', 6, 5, at), null);                    // 20% < 50%
  assert.ok(rules.growthRule('bandwidth', 8, 5, at));                             // 60% > 50%
  assert.equal(rules.growthRule('storage', 5.9, 5, at), null);                    // 18% < 20%
  assert.ok(rules.growthRule('storage', 6.1, 5, at));                             // 22% > 20%
});
test('rules: pending prices, abuse, reconcile', () => {
  assert.equal(rules.pendingRule(0, [], at), null);
  assert.equal(rules.pendingRule(3, ['claude/new-model'], at).severity, 'info');
  assert.ok(rules.abuseRule('u1', 3, 0.1, 2, at));                                // over the fixed limit
  assert.ok(rules.abuseRule('u1', 1, 0.1, 0, at));                                // 10x their usual
  assert.equal(rules.abuseRule('u1', 0.2, 0.1, 2, at), null);
  assert.equal(rules.reconcileRule('claude', '2026-10-22', 10, 10.5), null);
  const r = rules.reconcileRule('claude', '2026-10-22', 5, 10);
  assert.ok(r); assert.match(r.message, /Something other than this app/);
});
test('rules: budget evaluation, hard stop and override', () => {
  const b = { amount_usd: 100, warn_pcts: [50, 80, 100], hard_stop: true, override_until: null };
  assert.deepEqual(rules.evaluateBudget(b, 49, at).crossed, []);
  assert.deepEqual(rules.evaluateBudget(b, 85, at).crossed, [50, 80]);
  assert.equal(rules.evaluateBudget(b, 85, at).blocked, false);
  assert.equal(rules.evaluateBudget(b, 100, at).blocked, true);
  assert.equal(rules.evaluateBudget({ ...b, hard_stop: false }, 150, at).blocked, false);
  assert.equal(rules.evaluateBudget({ ...b, override_until: '2026-10-24T00:00:00Z' }, 150, at).blocked, false);
  assert.equal(rules.evaluateBudget({ ...b, override_until: '2026-10-22T00:00:00Z' }, 150, at).blocked, true);
});
test('rules: schedules run on an interval or once a day after a Chicago hour', () => {
  const t = (s) => new Date(s);
  assert.equal(rules.isDue({ every: 900_000 }, t('2026-10-23T15:00:00Z'), t('2026-10-23T14:50:00Z')), false);
  assert.equal(rules.isDue({ every: 900_000 }, t('2026-10-23T15:00:00Z'), t('2026-10-23T14:44:00Z')), true);
  assert.equal(rules.isDue({ every: 900_000 }, t('2026-10-23T15:00:00Z'), null), true);
  // 8 a.m. Chicago in October (CDT, UTC-5) is 13:00 UTC
  assert.equal(rules.isDue({ dailyAt: 8 }, t('2026-10-23T12:59:00Z'), t('2026-10-22T13:00:00Z')), false);
  assert.equal(rules.isDue({ dailyAt: 8 }, t('2026-10-23T13:01:00Z'), t('2026-10-22T13:00:00Z')), true);
  assert.equal(rules.isDue({ dailyAt: 8 }, t('2026-10-23T20:00:00Z'), t('2026-10-23T13:05:00Z')), false);   // already ran today
  assert.equal(rules.periodKey('month', t('2026-11-01T03:00:00Z')), '2026-10');                              // still Oct 31 in Chicago
});

// ---------- provider fetchers (fake fetch) ----------
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
test('sync: DigitalOcean balance and invoice lines', async () => {
  const f = async (url, init) => {
    assert.match(init.headers.Authorization, /^Bearer /);
    if (url.endsWith('/balance')) return json({ month_to_date_balance: '23.44', account_balance: '12.23', month_to_date_usage: '11.21', generated_at: 'now' });
    return json({ invoice_items: [
      { product: 'Droplets', amount: '12.00' }, { product: 'Droplets', description: 'backups', amount: '2.40' }, { product: 'Block Storage Volumes', amount: '1.10' },
      { product: 'Spaces', amount: '5.00' }, { product: 'Bandwidth', description: 'Droplet outbound transfer overage', amount: '0.35' }, { product: 'Reserved IP', amount: '0.60' },
    ], links: { pages: {} } });
  };
  const bal = await sync.fetchDoBalance('tok', f);
  assert.deepEqual(bal.map(m => [m.metric, m.value]), [['do_month_to_date_usage', 11.21], ['do_month_to_date_balance', 23.44], ['do_account_balance', 12.23]]);
  const inv = Object.fromEntries((await sync.fetchDoInvoicePreview('tok', f)).map(m => [m.metric, m.value]));
  assert.deepEqual(inv, { do_line_droplets: 14.4, do_line_volumes: 1.1, do_line_spaces: 5, do_line_bandwidth: 0.35, do_line_other: 0.6 });
});
test('sync: Anthropic cost report converts cents to dollars and pages', async () => {
  const seen = [];
  const f = async (url, init) => {
    seen.push(url); assert.equal(init.headers['x-api-key'], 'adminkey'); assert.equal(init.headers['anthropic-version'], '2023-06-01');
    if (url.includes('cost_report')) return url.includes('page=p2')
      ? json({ data: [{ starting_at: '2026-10-02T00:00:00Z', results: [{ amount: '250.5', model: 'claude-opus-5-5' }] }], has_more: false })
      : json({ data: [{ starting_at: '2026-10-01T00:00:00Z', results: [{ amount: '1000', model: 'claude-haiku-5-5' }, { amount: '50', model: 'claude-opus-5-5' }] }], has_more: true, next_page: 'p2' });
    return json({ data: [{ results: [{ model: 'claude-opus-5-5', uncached_input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 5000 }] }], has_more: false });
  };
  const s = await sync.fetchAnthropic('adminkey', new Date('2026-10-01T00:00:00Z'), new Date('2026-10-03T00:00:00Z'), f);
  assert.equal(s.mtdUsd, 13.005);
  assert.deepEqual(s.days, { '2026-10-01': 10.5, '2026-10-02': 2.505 });
  assert.deepEqual(s.tokensByModel['claude-opus-5-5'], { in: 1000, out: 200, cacheRead: 5000 });
  assert.ok(seen.some(u => u.includes('usage_report/messages') && u.includes('group_by[]=api_key_id')));
});
test('sync: DeepSeek balance; a non-dollar balance is never treated as dollars', async () => {
  const usd = await sync.fetchDeepseekBalance('k', async () => json({ is_available: true, balance_infos: [{ currency: 'USD', total_balance: '110.00', granted_balance: '10.00', topped_up_balance: '100.00' }] }));
  assert.deepEqual(usd.map(m => [m.metric, m.value]), [['deepseek_balance', 110], ['deepseek_granted', 10], ['deepseek_topped_up', 100], ['deepseek_available', 1]]);
  const cny = await sync.fetchDeepseekBalance('k', async () => json({ is_available: false, balance_infos: [{ currency: 'CNY', total_balance: '50.00' }] }));
  assert.equal(cny[0].value, null); assert.equal(cny[3].value, 0);
});
test('sync: errors say the status, never the key', async () => {
  await assert.rejects(sync.fetchDeepseekBalance('sk-secret-123456789', async () => json({}, 402)), e => e.status === 402 && !/secret/.test(e.message));
  await assert.rejects(sync.fetchDoBalance('tok', async () => { throw new Error('boom tok'); }), e => !/tok\b/.test(e.message.replace('DigitalOcean', '')));
});
test('sync: Google Cloud budget notice and push token', () => {
  const body = { message: { data: Buffer.from(JSON.stringify({ budgetDisplayName: 'Gemini', alertThresholdExceeded: 0.8, costAmount: 40, budgetAmount: 50, currencyCode: 'USD' })).toString('base64') } };
  assert.deepEqual(sync.parseGcpBudget(body), { costUsd: 40, budgetUsd: 50, threshold: 0.8, forecast: false, name: 'Gemini' });
  assert.equal(sync.parseGcpBudget({ message: { data: 'not-json' } }), null);
  assert.equal(sync.parseGcpBudget({ message: { data: Buffer.from(JSON.stringify({ costAmount: 1, budgetAmount: 2, currencyCode: 'EUR' })).toString('base64') } }), null);
  assert.equal(sync.pushTokenOk('abc', 'abc'), true);
  assert.equal(sync.pushTokenOk('abd', 'abc'), false);
  assert.equal(sync.pushTokenOk('abc', undefined), false);
  assert.equal(sync.pushTokenOk(undefined, 'abc'), false);
});

// ---------- notifications ----------
test('notify: email and webhook, and a failing webhook does not hide the email', async () => {
  const sent = [];
  const n = makeNotify({ sendMail: async (to, s, t) => { sent.push([to, s, t]); return true; }, emailTo: 'me@example.com', webhookUrl: 'https://hooks.example.com/x', origin: 'https://example.com',
    fetchFn: async () => { throw new Error('down'); } });
  const channels = await n({ id: 1, ts: new Date(), severity: 'critical', kind: 'billing_error', message: 'Claude is out of credit' }, false);
  assert.deepEqual(channels, ['email']);
  assert.match(sent[0][1], /CRITICAL/); assert.match(sent[0][2], /repeats every 6 hours/); assert.match(sent[0][2], /\/admin\/billing/);
});

// ---------- database ----------
let db, prices, usage, notified, alerts, guard, jobs, reports, cfg;
const mails = [];
before(async () => {
  if (skipDb) return;
  db = await openTestDb();
});
after(async () => { if (db) await db.close(); });
beforeEach(async () => {
  if (skipDb) return;
  await db.query('TRUNCATE ai_usage_logs, alerts, provider_snapshots, billing_throttles, billing_job_runs, provider_state RESTART IDENTITY');
  await db.query(`UPDATE budgets SET enabled = true, hard_stop = false, override_until = NULL, amount_usd = CASE period WHEN 'month' THEN 200 ELSE 25 END WHERE scope = 'global'`);
  await db.query(`DELETE FROM budgets WHERE scope <> 'global'`);
  prices = new PriceCache(db, 0);
  usage = new UsageLog(db, prices);
  notified = [];
  alerts = new AlertCenter(db, async (a, repeat) => { notified.push([a.kind, a.severity, repeat]); return ['email']; });
  guard = new BudgetGuard(db, alerts, { cacheMs: 0 });
  mails.length = 0;
  cfg = { lowBalanceUsd: 5, abuseHourlyUsd: 2, emailTo: 'owner@example.com', origin: 'https://example.com' };
  jobs = new BillingJobs({ db, prices, usage, alerts, guard, cfg, sendMail: async (to, s, t) => { mails.push([to, s, t]); return true; } });
  reports = new BillingReports(db, prices);
});
const dbtest = (name, fn) => test(`db: ${name}`, { skip: skipDb }, fn);
const insertLog = (o) => db.query(
  `INSERT INTO ai_usage_logs(ts, provider, model, user_id, command, workflow, feature, input_tokens, output_tokens, cache_read_tokens, cost_usd, cost_status, http_status, query_hash)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
  [o.ts ?? new Date(), o.provider ?? 'claude', o.model ?? 'claude-sonnet-5-5', o.user ?? null, o.command ?? 'search', o.workflow ?? 'ai_search', o.feature ?? 'answer',
    o.input ?? 1000, o.output ?? 200, o.cacheRead ?? 0, o.cost === undefined ? 0.01 : o.cost, o.status ?? 'final', o.http ?? 200, o.hash ?? null]);

dbtest('migration seeds prices as unconfirmed, with sources, and starter budgets', async () => {
  const p = await db.query('SELECT confirmed, source_url FROM model_prices');
  assert.ok(p.length >= 10); assert.ok(p.every(r => r.confirmed === false && /^https:\/\//.test(r.source_url)));
  const b = await db.query(`SELECT period, hard_stop FROM budgets WHERE scope = 'global' ORDER BY period`);
  assert.deepEqual(b.map(x => x.period), ['day', 'month']); assert.ok(b.every(x => x.hard_stop === false));
});

dbtest('usage log: a call is priced from the table; unpriced and failed calls are handled', async () => {
  usage.record({ provider: 'claude', model: 'claude-sonnet-5-5', userId: 'u1', command: 'search', workflow: 'ai_search', feature: 'answer', usage: { input: 10000, output: 2000, searches: 2 }, latencyMs: 900, httpStatus: 200 });
  usage.record({ provider: 'claude', model: 'claude-brand-new', usage: { input: 10, output: 10 }, httpStatus: 200 });
  usage.record({ provider: 'perplexity', model: 'perplexity/sonar', usage: { input: 10, output: 10 }, reportedUsd: 0.0071, httpStatus: 200 });
  usage.record({ provider: 'gemini', model: 'gemini-x', failed: true, httpStatus: 503, errorCode: 'temporary' });
  assert.equal(await usage.flush(), 4);
  const rows = await db.query('SELECT provider, model, cost_usd::float AS usd, cost_status, cost_source FROM ai_usage_logs ORDER BY id');
  assert.deepEqual(rows[0], { provider: 'claude', model: 'claude-sonnet-5-5', usd: 0.02 + 0.02 + 0.02, cost_status: 'final', cost_source: 'computed' });   // 10k in @2, 2k out @10, 2 searches @0.01
  assert.deepEqual(rows[1], { provider: 'claude', model: 'claude-brand-new', usd: null, cost_status: 'pending', cost_source: 'computed' });
  assert.deepEqual(rows[2], { provider: 'perplexity', model: 'perplexity/sonar', usd: 0.0071, cost_status: 'final', cost_source: 'reported' });
  assert.deepEqual(rows[3], { provider: 'gemini', model: 'gemini-x', usd: 0, cost_status: 'final', cost_source: 'failed' });
});

dbtest('usage log: a failed write keeps the entries and the next flush writes them', async () => {
  const broken = new UsageLog({ query: async () => { throw new Error('db down'); }, one: async () => null }, { load: async () => {}, cost: () => ({ costUsd: 0, status: 'final', source: 'computed', missing: [] }) });
  broken.record({ provider: 'claude', model: 'm' });
  assert.equal(await broken.flush(), 0); assert.equal(broken.pending, 1);
});

dbtest('usage log: pending calls are priced once the price exists', async () => {
  usage.record({ provider: 'claude', model: 'claude-future-1', usage: { input: 1_000_000, output: 1_000_000 }, httpStatus: 200 });
  await usage.flush();
  assert.equal((await db.one(`SELECT cost_status FROM ai_usage_logs`)).cost_status, 'pending');
  await db.query(`INSERT INTO model_prices(provider, model, token_type, price_usd, unit) VALUES ('claude','claude-future-1','input',1,'mtok'),('claude','claude-future-1','output',5,'mtok')`);
  assert.equal(await usage.repricePending(), 1);
  const r = await db.one(`SELECT cost_usd::float AS usd, cost_status FROM ai_usage_logs`);
  assert.deepEqual(r, { usd: 6, cost_status: 'final' });
});

dbtest('price book for the router follows the table, and an unknown model is pending (null)', async () => {
  await prices.load(true);
  const book = prices.asPriceBook(() => ({ input: 99 }));
  assert.deepEqual(book('claude', 'claude-haiku-5-5'), { input: 0.1, output: 0.5, cacheRead: 0.01, perSearch: 0.01, perCall: undefined });
  assert.equal(book('claude', 'perplexity:anthropic/claude-haiku-5-5').input, 0.1);
  assert.equal(book('claude', 'no-such-model'), null);
  assert.equal(book('gemini', 'anything').perCall, 0.04);
});

dbtest('alerts: the same condition in the same period raises one alert and one notification', async () => {
  const c = rules.spikeRule('claude', 5, 1, at);
  assert.equal((await alerts.raise(c)).created, true);
  assert.equal((await alerts.raise(c)).created, false);
  assert.equal((await alerts.raise(c)).created, false);
  assert.equal((await db.one('SELECT count(*)::int AS n FROM alerts')).n, 1);
  assert.equal(notified.length, 1);
  const next = rules.spikeRule('claude', 5, 1, new Date(at.getTime() + 3600_000));     // the next hour is a new alert
  assert.equal((await alerts.raise(next)).created, true);
  assert.equal((await db.one(`SELECT notified_channels, notify_count FROM alerts WHERE id = 1`)).notify_count, 1);
});

dbtest('alerts: info stays in the dashboard; critical repeats every 6 hours until acknowledged', async () => {
  await alerts.raise(rules.pendingRule(2, ['x'], at));
  assert.equal(notified.length, 0);                                                    // info: bell only
  const crit = await alerts.raise(rules.billingErrorRule('claude', 'credit balance is too low', at));
  assert.equal(notified.length, 1);
  assert.equal(await alerts.renotifyCritical(), 0);                                    // just sent
  await db.query(`UPDATE alerts SET last_notified_at = now() - interval '7 hours' WHERE id = $1`, [crit.id]);
  assert.equal(await alerts.renotifyCritical(), 1);
  assert.deepEqual(notified[1], ['billing_error', 'critical', true]);
  assert.ok(await alerts.ack(crit.id, 'owner@example.com'));
  await db.query(`UPDATE alerts SET last_notified_at = now() - interval '7 hours' WHERE id = $1`, [crit.id]);
  assert.equal(await alerts.renotifyCritical(), 0);                                    // acknowledged: quiet
  assert.equal(await alerts.ack(crit.id, 'x'), null);
  assert.deepEqual(await alerts.openCounts(), { info: 1, warn: 0, critical: 0 });
});

dbtest('alerts: billing error messages never carry a key', async () => {
  await alerts.raise(rules.billingErrorRule('claude', 'invalid x-api-key sk-ant-api03-abcdefghijklmnop', at));
  assert.doesNotMatch((await db.one('SELECT message FROM alerts')).message, /abcdefghijkl/);
});

dbtest('budgets: each warning level alerts once per period; a hard stop blocks; an override lifts it', async () => {
  await db.query(`UPDATE budgets SET amount_usd = 10, hard_stop = true WHERE scope = 'global' AND period = 'day'`);
  const now = new Date();
  const check = () => guard.check({ userId: 'u1', workflow: 'ai_search', providers: ['claude'] }, now);
  await insertLog({ cost: 5.5 });
  assert.equal((await check()).blocked, null);
  const a1 = (await db.query(`SELECT dedupe_key FROM alerts`)).map(r => r.dedupe_key);
  assert.equal(a1.length, 1); assert.match(a1[0], /:day:.*:50$/);
  await check(); await check();
  assert.equal((await db.one('SELECT count(*)::int AS n FROM alerts')).n, 1);           // still one
  await insertLog({ cost: 3 });                                                         // 8.5 -> 85%
  await check();
  assert.equal((await db.one('SELECT count(*)::int AS n FROM alerts')).n, 2);
  await insertLog({ cost: 2 });                                                         // 10.5 -> over
  const stop = await check();
  assert.ok(stop.blocked); assert.match(stop.blocked.message, /paused/);
  assert.equal((await db.one(`SELECT severity FROM alerts WHERE dedupe_key LIKE '%:100'`)).severity, 'critical');
  await db.query(`UPDATE budgets SET override_until = now() + interval '1 hour' WHERE scope = 'global' AND period = 'day'`);
  guard.invalidate();
  assert.equal((await check()).blocked, null);
});

dbtest('budgets: a provider at its hard stop is paused (calls go elsewhere), a user budget blocks only that user', async () => {
  await db.query(`INSERT INTO budgets(scope, scope_ref, period, amount_usd, hard_stop) VALUES ('provider','claude','month',5,true),('user','u2','day',1,true)`);
  await insertLog({ cost: 6, user: 'u2' });
  const now = new Date();
  const forU1 = await guard.check({ userId: 'u1', workflow: 'ai_search', providers: ['claude', 'gemini'] }, now);
  assert.deepEqual(forU1.pausedProviders, ['claude']); assert.equal(forU1.blocked, null);
  const forU2 = await guard.check({ userId: 'u2', workflow: 'ai_search', providers: ['gemini'] }, now);
  assert.ok(forU2.blocked); assert.deepEqual(forU2.pausedProviders, []);
});

dbtest('budgets: calls with no price yet still count toward a budget', async () => {
  await db.query(`UPDATE budgets SET amount_usd = 0.1 WHERE scope = 'global' AND period = 'day'`);
  for (let i = 0; i < 4; i++) await insertLog({ cost: null, status: 'pending' });
  assert.ok(await guard.spent('global', '', 'day', new Date()) >= 0.08);
});

dbtest('guard: a throttled account is reported', async () => {
  await db.query(`INSERT INTO billing_throttles(user_id, reason, until) VALUES ('u9', 'test', now() + interval '1 hour')`);
  assert.equal((await guard.check({ userId: 'u9', workflow: 'ai_search', providers: [] })).throttled, true);
  assert.equal((await guard.check({ userId: 'u8', workflow: 'ai_search', providers: [] })).throttled, false);
});

dbtest('jobs: a job runs once per due time, even if two copies tick together', async () => {
  const now = new Date('2026-10-23T15:00:00Z');
  const [a, b] = await Promise.all([jobs.tick(now), jobs.tick(now)]);
  const ran = (r) => r.map(x => x.job);
  const all = [...ran(a), ...ran(b)];
  assert.equal(new Set(all).size, all.length, 'no job ran twice');
  assert.ok(all.includes('alert-rules') && all.includes('refresh-summary') && all.includes('digest'));
  assert.ok(!all.includes('deepseek') && !all.includes('anthropic') && !all.includes('do-balance'));   // no keys: skipped
  assert.deepEqual(await jobs.tick(new Date(now.getTime() + 60_000)), []);                              // nothing due a minute later
  const h = await jobs.health();
  assert.equal(h.find(j => j.job === 'anthropic').configured, false);
  assert.ok(h.find(j => j.job === 'alert-rules').last_ok);
});

dbtest('jobs: a failing sync is recorded and does not stop the others', async () => {
  const bad = new BillingJobs({ db, prices, usage, alerts, guard, cfg: { ...cfg, deepseekKey: 'sk-secret-abcdefghijk' }, sendMail: async () => true,
    fetchFn: async () => json({ error: 'nope' }, 402) });
  const done = await bad.tick(new Date('2026-10-23T15:00:00Z'));
  const ds = done.find(d => d.job === 'deepseek');
  assert.equal(ds.ok, false); assert.doesNotMatch(ds.detail, /abcdefghijk/);
  assert.ok(done.find(d => d.job === 'alert-rules').ok);
  assert.match((await db.one(`SELECT last_error FROM billing_job_runs WHERE job = 'deepseek'`)).last_error, /402/);
});

dbtest('rules job: a cost spike is detected from our own log', async () => {
  const now = new Date('2026-10-23T15:00:00Z');
  await insertLog({ ts: new Date(now.getTime() - 30 * 60_000), cost: 6, provider: 'claude' });
  for (let k = 1; k <= 7; k++) await insertLog({ ts: new Date(now.getTime() - k * 86400_000 - 30 * 60_000), cost: 0.7, provider: 'claude' });
  const summary = await jobs.alertRules(now);
  assert.match(summary, /1 new alert/);
  const a = await db.one(`SELECT kind, severity, message FROM alerts`);
  assert.equal(a.kind, 'spike'); assert.match(a.message, /8\.6x/);
  assert.match(await jobs.alertRules(now), /0 new alert/);                                                 // running again changes nothing
});

dbtest('rules job: an account spending too much in an hour is alerted and slowed down', async () => {
  const now = new Date('2026-10-23T15:00:00Z');
  await insertLog({ ts: new Date(now.getTime() - 10 * 60_000), cost: 3, user: 'greedy' });
  await insertLog({ ts: new Date(now.getTime() - 20 * 60_000), cost: 0.1, user: 'normal' });
  await jobs.alertRules(now);
  assert.equal((await db.one(`SELECT kind FROM alerts WHERE scope_ref = 'greedy'`)).kind, 'user_abuse');
  assert.ok(await db.one(`SELECT 1 FROM billing_throttles WHERE user_id = 'greedy' AND until > now()`));
  assert.equal(await db.one(`SELECT 1 FROM billing_throttles WHERE user_id = 'normal'`), null);
});

dbtest('rules job: DeepSeek low balance and old pending calls', async () => {
  const withKey = new BillingJobs({ db, prices, usage, alerts, guard, cfg: { ...cfg, deepseekKey: 'k' }, sendMail: async () => true });
  await withKey.snapshot('deepseek', [{ metric: 'deepseek_balance', value: 2.5 }, { metric: 'deepseek_available', value: 1 }]);
  await insertLog({ ts: new Date(Date.now() - 30 * 3600_000), cost: null, status: 'pending', model: 'claude-future-9' });
  await withKey.alertRules(new Date());
  const kinds = (await db.query('SELECT kind, severity FROM alerts ORDER BY id')).map(r => `${r.kind}:${r.severity}`);
  assert.ok(kinds.includes('low_balance:warn')); assert.ok(kinds.includes('pending_prices:info'));
});

dbtest('rules job: Anthropic usage close to the Console limit', async () => {
  await db.query(`INSERT INTO budgets(scope, scope_ref, period, amount_usd) VALUES ('provider','claude','month',50)`);
  const withKey = new BillingJobs({ db, prices, usage, alerts, guard, cfg: { ...cfg, anthropicAdminKey: 'k' }, sendMail: async () => true });
  await withKey.snapshot('claude', [{ metric: 'anthropic_mtd_cost_usd', value: 41, raw: { days: {} } }]);
  await withKey.alertRules(new Date());
  assert.ok(await db.one(`SELECT 1 FROM alerts WHERE kind = 'provider_limit' AND severity = 'warn'`));
});

dbtest('reconcile: days more than 10% apart are flagged', async () => {
  const now = new Date('2026-10-23T12:00:00Z');
  await jobs.snapshot('claude', [{ metric: 'anthropic_mtd_cost_usd', value: 30, raw: { days: { '2026-10-22': 10, '2026-10-21': 10, '2026-10-20': 10 } } }]);
  await insertLog({ ts: new Date('2026-10-22T10:00:00Z'), cost: 4 });        // 60% apart
  await insertLog({ ts: new Date('2026-10-21T10:00:00Z'), cost: 9.5 });      // 5% apart
  await insertLog({ ts: new Date('2026-10-20T10:00:00Z'), cost: 10 });
  assert.match(await jobs.reconcile(now), /1 day/);
  assert.equal((await db.one(`SELECT scope_ref, kind FROM alerts`)).kind, 'reconcile');
});

dbtest('Google Cloud budget notice: 100% is a critical alert, a forecast is not', async () => {
  const n = { costUsd: 50, budgetUsd: 50, threshold: 1, forecast: false, name: 'Gemini' };
  assert.equal((await jobs.gcpNotice(n)).severity, 'critical');
  assert.equal(await jobs.gcpNotice({ ...n, threshold: 1.2, forecast: true }), null);
  assert.equal(Number((await db.one(`SELECT value FROM provider_snapshots WHERE metric = 'gcp_cost_usd'`)).value), 50);
});

dbtest('digest: totals, top accounts, budgets and open alerts in one email', async () => {
  const now = new Date();
  const user = await makeUser(db, 'top@example.com');
  const y = new Date(now.getTime() - 86400_000);
  await insertLog({ ts: y, cost: 1.25, user: user.id, provider: 'claude', command: 'search' });
  await insertLog({ ts: y, cost: 0.25, user: null, provider: 'gemini', command: 'create' });
  await alerts.raise(rules.billingErrorRule('gemini', 'out of credit', now));
  const out = await jobs.digest(now);
  assert.match(out, /digest sent/);
  const [to, subject, text] = mails[0];
  assert.equal(to, 'owner@example.com'); assert.match(subject, /\$1\.50/);
  assert.match(text, /claude: \$1\.25/); assert.match(text, /top@example\.com: \$1\.25/); assert.match(text, /search: \$1\.25/); assert.match(text, /1 critical/);
});

dbtest('reports: summary, breakdowns, providers and optimize run and add up', async () => {
  const u = await makeUser(db, 'r@example.com');
  await insertLog({ cost: 2, user: u.id, hash: 'h1' }); await insertLog({ cost: 2, user: u.id, hash: 'h1' }); await insertLog({ cost: 2, user: u.id, hash: 'h1' });
  await insertLog({ cost: 1, provider: 'gemini', model: 'g', feature: 'followups', command: 'create' });
  await insertLog({ cost: null, status: 'pending', model: 'new' });
  await db.query('REFRESH MATERIALIZED VIEW billing_summary');
  const s = await reports.summary();
  assert.equal(s.cards.today, 7); assert.equal(s.cards.pending_calls, 1);
  assert.ok(s.cards.budget_remaining <= 200 - 7 + 1e-9);
  assert.ok(s.daily.length >= 1 && s.byModel.length >= 2);
  const byUser = await reports.breakdown('user', 'month');
  assert.equal(byUser[0].key, 'r@example.com'); assert.equal(byUser[0].usd, 6); assert.equal(byUser[0].requests, 3);
  for (const dim of ['model', 'workflow', 'feature', 'command']) assert.ok((await reports.breakdown(dim, 'week')).length >= 1);
  const prov = await reports.providers();
  assert.equal(prov.find(p => p.id === 'claude').ours_month_usd, 6);
  await prices.load(true);
  const opt = await reports.optimize();
  assert.equal(opt.repeated_questions.groups, 1); assert.equal(opt.repeated_questions.calls_repeated, 2); assert.equal(opt.batchable.followup_calls, 1);
});

dbtest('reports: cheaper-model hint uses the table prices', async () => {
  await insertLog({ model: 'claude-opus-5-5', input: 5_000_000, output: 1_000_000, cost: 40, command: 'search' });
  await prices.load(true);
  const opt = await reports.optimize();
  const h = opt.cheaper_model.find(x => x.from === 'claude-opus-5-5');
  assert.ok(h && h.to === 'claude-haiku-5-5' && h.saves > 30);
});

dbtest('webhook-style summary rows never contain prompt text columns', async () => {
  const cols = (await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'ai_usage_logs'`)).map(r => r.column_name);
  assert.ok(!cols.some(c => /prompt|question|answer|text|content|message/.test(c)));
});
