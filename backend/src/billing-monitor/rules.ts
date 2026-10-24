// Alert rules and schedules for the Billing Monitor. Pure functions: numbers in, alert candidates out.
// Every candidate carries a dedupeKey that includes the period it belongs to, so the same condition in the same
// period raises one alert however many times the rules run (the database enforces it with a unique index).

export type Severity = 'info' | 'warn' | 'critical';
export interface Candidate {
  severity: Severity; kind: string; scope: string; scopeRef: string; message: string;
  value?: number; threshold?: number; dedupeKey: string;
}

export const TZ = 'America/Chicago';

// ---------- periods ----------
export function chicagoParts(d: Date) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', minute: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(d).map(x => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, date: `${p.year}-${p.month}-${p.day}`, month: `${p.year}-${p.month}` };
}
export const periodKey = (period: 'day' | 'month' | 'hour', d: Date) => {
  const c = chicagoParts(d);
  return period === 'day' ? c.date : period === 'month' ? c.month : `${c.date}T${String(c.h).padStart(2, '0')}`;
};
export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// ---------- scheduling ----------
export type Schedule = { every: number } | { dailyAt: number /* Chicago hour */ };
export function isDue(s: Schedule, now: Date, lastRun: Date | null): boolean {
  if ('every' in s) return !lastRun || now.getTime() - lastRun.getTime() >= s.every;
  const n = chicagoParts(now);
  if (n.h < s.dailyAt) return false;
  return !lastRun || chicagoParts(lastRun).date < n.date;
}

// ---------- budgets ----------
export interface BudgetLike { amount_usd: number; warn_pcts: number[]; hard_stop: boolean; override_until?: Date | string | null }
export function evaluateBudget(b: BudgetLike, spent: number, now: Date) {
  const pct = b.amount_usd > 0 ? (spent / b.amount_usd) * 100 : 0;
  const crossed = [...b.warn_pcts].sort((a, c) => a - c).filter(p => pct >= p);
  const overridden = !!b.override_until && new Date(b.override_until).getTime() > now.getTime();
  return { pct, crossed, atLimit: pct >= 100, blocked: b.hard_stop && pct >= 100 && !overridden };
}
export const budgetSeverity = (pct: number): Severity => (pct >= 100 ? 'critical' : pct >= 80 ? 'warn' : 'info');

// ---------- rules ----------
export interface RuleLimits { spikeFactor: number; spikeMinUsd: number; forecastMinDays: number; lowBalanceUsd: number; anthropicWarnPct: number }
export const DEFAULT_LIMITS: RuleLimits = { spikeFactor: 3, spikeMinUsd: 1, forecastMinDays: 2, lowBalanceUsd: 5, anthropicWarnPct: 80 };
const usd = (n: number) => `$${n.toFixed(2)}`;

// Cost in the last hour more than 3x the average of the same hour of day over the last 7 days (and at least spikeMinUsd).
export function spikeRule(provider: string, lastHourUsd: number, sameHourAvgUsd: number, now: Date, l = DEFAULT_LIMITS): Candidate | null {
  if (lastHourUsd < l.spikeMinUsd) return null;
  if (sameHourAvgUsd > 0 && lastHourUsd <= l.spikeFactor * sameHourAvgUsd) return null;
  const base = sameHourAvgUsd > 0 ? `${(lastHourUsd / sameHourAvgUsd).toFixed(1)}x the usual for this hour (${usd(sameHourAvgUsd)})` : 'with no usual spend at this hour';
  return { severity: 'warn', kind: 'spike', scope: 'provider', scopeRef: provider, value: lastHourUsd, threshold: l.spikeFactor * sameHourAvgUsd,
    message: `${provider} cost ${usd(lastHourUsd)} in the last hour, ${base}.`, dedupeKey: `spike:${provider}:${periodKey('hour', now)}` };
}

// Month so far, projected to month end, above the monthly budget.
export function forecastRule(scope: string, scopeRef: string, mtdUsd: number, monthBudgetUsd: number, now: Date, l = DEFAULT_LIMITS): Candidate | null {
  const c = chicagoParts(now);
  const elapsed = (c.d - 1) + (c.h + c.min / 60) / 24;
  if (monthBudgetUsd <= 0 || elapsed < l.forecastMinDays) return null;
  const projected = mtdUsd * (daysInMonth(c.y, c.m) / elapsed);
  if (projected <= monthBudgetUsd) return null;
  return { severity: 'warn', kind: 'forecast', scope, scopeRef, value: projected, threshold: monthBudgetUsd,
    message: `${scopeRef || 'Total'} spend is ${usd(mtdUsd)} so far this month, on track for ${usd(projected)} against a ${usd(monthBudgetUsd)} budget.`,
    dedupeKey: `forecast:${scope}:${scopeRef}:${c.month}` };
}

// DeepSeek (or any prepaid balance): low balance warns, an unavailable account is critical.
export function lowBalanceRule(provider: string, balanceUsd: number | null, available: boolean | null, now: Date, l = DEFAULT_LIMITS): Candidate | null {
  const day = periodKey('day', now);
  if (available === false) return { severity: 'critical', kind: 'low_balance', scope: 'provider', scopeRef: provider, value: balanceUsd ?? 0, threshold: 0,
    message: `${provider} reports the account cannot be used (balance ${balanceUsd == null ? 'unknown' : usd(balanceUsd)}). Add funds. Requests are being sent to another provider.`, dedupeKey: `low_balance:${provider}:unavailable:${day}` };
  if (balanceUsd != null && balanceUsd < l.lowBalanceUsd) return { severity: 'warn', kind: 'low_balance', scope: 'provider', scopeRef: provider, value: balanceUsd, threshold: l.lowBalanceUsd,
    message: `${provider} balance is ${usd(balanceUsd)}, under the ${usd(l.lowBalanceUsd)} warning level.`, dedupeKey: `low_balance:${provider}:${day}` };
  return null;
}

// Anthropic month-to-date cost against the spend limit set in the Console (kept in budgets).
export function providerLimitRule(provider: string, mtdUsd: number, limitUsd: number, now: Date, l = DEFAULT_LIMITS): Candidate | null {
  if (limitUsd <= 0) return null;
  const pct = (mtdUsd / limitUsd) * 100;
  if (pct < l.anthropicWarnPct) return null;
  const month = periodKey('month', now);
  return { severity: pct >= 100 ? 'critical' : 'warn', kind: 'provider_limit', scope: 'provider', scopeRef: provider, value: mtdUsd, threshold: limitUsd,
    message: `${provider} has used ${usd(mtdUsd)} of its ${usd(limitUsd)} monthly limit (${pct.toFixed(0)}%).`, dedupeKey: `provider_limit:${provider}:${month}:${pct >= 100 ? 100 : l.anthropicWarnPct}` };
}

// DigitalOcean: month-to-date usage against its budget, and line items growing faster than they should.
export function doBudgetRule(mtdUsd: number, budgetUsd: number, warnPcts: number[], now: Date): Candidate[] {
  if (budgetUsd <= 0) return [];
  const pct = (mtdUsd / budgetUsd) * 100; const month = periodKey('month', now);
  return [...warnPcts].sort((a, b) => a - b).filter(p => pct >= p).slice(-1).map(p => ({
    severity: budgetSeverity(p), kind: 'budget', scope: 'provider', scopeRef: 'digitalocean', value: mtdUsd, threshold: budgetUsd * p / 100,
    message: `DigitalOcean usage is ${usd(mtdUsd)} this month, ${pct.toFixed(0)}% of the ${usd(budgetUsd)} budget.`, dedupeKey: `budget:provider:digitalocean:month:${month}:${p}`,
  }));
}
export function growthRule(item: 'bandwidth' | 'storage', nowUsd: number, weekAgoUsd: number, now: Date): Candidate | null {
  const limit = item === 'bandwidth' ? 0.5 : 0.2;
  if (weekAgoUsd <= 0 || nowUsd < 1) return null;
  const growth = nowUsd / weekAgoUsd - 1;
  if (growth <= limit) return null;
  return { severity: 'warn', kind: 'do_growth', scope: 'provider', scopeRef: `digitalocean:${item}`, value: nowUsd, threshold: weekAgoUsd * (1 + limit),
    message: `DigitalOcean ${item} charges grew ${(growth * 100).toFixed(0)}% in 7 days (${usd(weekAgoUsd)} to ${usd(nowUsd)}).`, dedupeKey: `do_growth:${item}:${periodKey('day', now)}` };
}

// Calls with no price (or no usage) that have waited more than a day: the price table needs an update.
export function pendingRule(count: number, models: string[], now: Date): Candidate | null {
  if (count <= 0) return null;
  return { severity: 'info', kind: 'pending_prices', scope: 'global', scopeRef: '', value: count,
    message: `${count} AI call${count === 1 ? ' has' : 's have'} no cost yet${models.length ? ` (${models.slice(0, 5).join(', ')})` : ''}. Add the missing prices in Admin > Billing > Prices.`, dedupeKey: `pending_prices:${periodKey('day', now)}` };
}

// One user spending far more per hour than they usually do (or more than a fixed dollar limit).
export function abuseRule(userId: string, lastHourUsd: number, avgHourlyUsd: number, hourlyLimitUsd: number, now: Date): Candidate | null {
  const overLimit = hourlyLimitUsd > 0 && lastHourUsd >= hourlyLimitUsd;
  const overUsual = avgHourlyUsd > 0 && lastHourUsd >= 5 * avgHourlyUsd && lastHourUsd >= 0.5;
  if (!overLimit && !overUsual) return null;
  return { severity: 'warn', kind: 'user_abuse', scope: 'user', scopeRef: userId, value: lastHourUsd, threshold: overLimit ? hourlyLimitUsd : 5 * avgHourlyUsd,
    message: `Account ${userId.slice(0, 12)} spent ${usd(lastHourUsd)} in the last hour (${overLimit ? `limit ${usd(hourlyLimitUsd)}` : `usually ${usd(avgHourlyUsd)}`}). Their searches are slowed down for a while.`, dedupeKey: `user_abuse:${userId}:${periodKey('hour', now)}` };
}

// Our own log of a day's cost against what the provider billed. More than 10% apart is worth a look
// (often another key or tool is using the same account).
export function reconcileRule(provider: string, day: string, oursUsd: number, theirsUsd: number): Candidate | null {
  if (theirsUsd < 1 && oursUsd < 1) return null;
  const diff = Math.abs(oursUsd - theirsUsd) / Math.max(theirsUsd, oursUsd);
  if (diff <= 0.1) return null;
  return { severity: 'warn', kind: 'reconcile', scope: 'provider', scopeRef: provider, value: oursUsd, threshold: theirsUsd,
    message: `${provider} on ${day}: our log says ${usd(oursUsd)}, the provider billed ${usd(theirsUsd)} (${(diff * 100).toFixed(0)}% apart). ${theirsUsd > oursUsd ? 'Something other than this app may be using the account.' : 'Prices in the table may be too high.'}`,
    dedupeKey: `reconcile:${provider}:${day}` };
}

// Google Cloud budget notice for Gemini. Spend caps pause usage at 100%.
export function gcpBudgetRule(costUsd: number, budgetUsd: number, thresholdFraction: number | null, now: Date): Candidate | null {
  const frac = thresholdFraction ?? (budgetUsd > 0 ? costUsd / budgetUsd : 0);
  if (frac < 0.5) return null;
  const level = frac >= 1 ? 100 : frac >= 0.8 ? 80 : 50;
  return { severity: level === 100 ? 'critical' : level === 80 ? 'warn' : 'info', kind: 'budget', scope: 'provider', scopeRef: 'gemini', value: costUsd, threshold: budgetUsd * level / 100,
    message: level === 100 ? `Gemini reached its Google Cloud budget (${usd(costUsd)} of ${usd(budgetUsd)}). If a spend cap is on, Gemini is paused until the next period.` : `Gemini is at ${level}% of its Google Cloud budget (${usd(costUsd)} of ${usd(budgetUsd)}).`,
    dedupeKey: `gcp_budget:gemini:${periodKey('month', now)}:${level}` };
}

// Billing error from a provider call (out of credit, spend cap, bad key). Critical, repeats every 6h until acknowledged.
export function billingErrorRule(provider: string, detail: string, now: Date): Candidate {
  return { severity: 'critical', kind: 'billing_error', scope: 'provider', scopeRef: provider,
    message: `${provider} refused a request for billing or key reasons and is paused. Requests go to another provider. Detail: ${detail.replace(/(sk|key|Bearer)[-_ ]?[A-Za-z0-9._-]{8,}/g, '[hidden]').slice(0, 160)}`,
    dedupeKey: `billing_error:${provider}:${periodKey('day', now)}` };
}
