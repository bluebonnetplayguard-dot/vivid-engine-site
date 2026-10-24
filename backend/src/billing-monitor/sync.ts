// What the providers say we owe. Each function takes the key and an optional fetch (for tests), calls one
// read-only endpoint and returns plain metrics. Keys are never written to logs or error messages, and money
// is parsed from decimal strings without floating point (cost.ts parseMoney).
//
// The response shapes below follow each provider's public API reference. They have not been run against a live
// account from the build environment: the first run with real keys (see the README test plan) is the check.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { parseMoney } from './cost';

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;
export interface Metric { metric: string; value: number | null; raw?: unknown }

export class SyncError extends Error {
  constructor(message: string, readonly status: number | null = null) { super(message); this.name = 'SyncError'; }
}

async function getJson(f: FetchFn, provider: string, url: string, headers: Record<string, string>): Promise<any> {
  let res: Response;
  try { res = await f(url, { headers, signal: AbortSignal.timeout(20_000) }); }
  catch (e) { throw new SyncError(`${provider}: request failed (${(e as Error).name})`); }
  if (!res.ok) throw new SyncError(`${provider}: HTTP ${res.status}`, res.status);
  try { return await res.json(); } catch { throw new SyncError(`${provider}: unreadable response`); }
}

// ---------- DigitalOcean ----------
export async function fetchDoBalance(token: string, f: FetchFn = fetch): Promise<Metric[]> {
  const j = await getJson(f, 'DigitalOcean', 'https://api.digitalocean.com/v2/customers/my/balance', { Authorization: `Bearer ${token}` });
  return [
    { metric: 'do_month_to_date_usage', value: parseMoney(j.month_to_date_usage) },
    { metric: 'do_month_to_date_balance', value: parseMoney(j.month_to_date_balance) },
    { metric: 'do_account_balance', value: parseMoney(j.account_balance), raw: { generated_at: j.generated_at ?? null } },
  ];
}

export type DoBucket = 'droplets' | 'volumes' | 'spaces' | 'bandwidth' | 'other';
export function doBucket(item: { product?: string; description?: string; category?: string; group_description?: string }): DoBucket {
  const text = `${item.product ?? ''} ${item.category ?? ''} ${item.group_description ?? ''} ${item.description ?? ''}`.toLowerCase();
  if (/bandwidth|transfer|egress/.test(text)) return 'bandwidth';
  if (/spaces|object storage/.test(text)) return 'spaces';
  if (/volume|block storage/.test(text)) return 'volumes';
  if (/droplet|backup|snapshot/.test(text)) return 'droplets';
  return 'other';
}
export async function fetchDoInvoicePreview(token: string, f: FetchFn = fetch): Promise<Metric[]> {
  const totals: Record<DoBucket, number> = { droplets: 0, volumes: 0, spaces: 0, bandwidth: 0, other: 0 };
  for (let page = 1; page <= 5; page++) {
    const j = await getJson(f, 'DigitalOcean', `https://api.digitalocean.com/v2/customers/my/invoices/preview?per_page=200&page=${page}`, { Authorization: `Bearer ${token}` });
    for (const it of Array.isArray(j.invoice_items) ? j.invoice_items : []) totals[doBucket(it)] += parseMoney(it.amount) ?? 0;
    if (!j.links?.pages?.next) break;
  }
  return (Object.keys(totals) as DoBucket[]).map(b => ({ metric: `do_line_${b}`, value: Math.round(totals[b] * 1e6) / 1e6 }));
}

// ---------- Anthropic (Admin API: needs the organization admin key, used only here) ----------
const ANTHROPIC_HEADERS = (key: string) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' });
export interface AnthropicSummary { mtdUsd: number; days: Record<string, number>; byModel: Record<string, number>; tokensByModel: Record<string, { in: number; out: number; cacheRead: number }> }

// cost_report amounts are decimal strings in cents (the API reference says "lowest units"), so /100 for dollars.
export async function fetchAnthropic(adminKey: string, monthStart: Date, now: Date, f: FetchFn = fetch): Promise<AnthropicSummary> {
  const h = ANTHROPIC_HEADERS(adminKey);
  const q = (extra: string) => `starting_at=${encodeURIComponent(monthStart.toISOString())}&ending_at=${encodeURIComponent(now.toISOString())}&bucket_width=1d&limit=31${extra}`;
  const days: Record<string, number> = {}; const byModel: Record<string, number> = {};
  let page: string | null = null;
  for (let i = 0; i < 6; i++) {
    const j: any = await getJson(f, 'Anthropic', `https://api.anthropic.com/v1/organizations/cost_report?${q(page ? `&page=${encodeURIComponent(page)}` : '')}`, h);
    for (const b of Array.isArray(j.data) ? j.data : []) {
      const day = String(b.starting_at ?? '').slice(0, 10);
      for (const r of Array.isArray(b.results) ? b.results : []) {
        const usd = (parseMoney(r.amount) ?? 0) / 100;
        days[day] = (days[day] ?? 0) + usd;
        const model = String(r.model ?? r.description ?? 'other');
        byModel[model] = (byModel[model] ?? 0) + usd;
      }
    }
    if (!j.has_more || !j.next_page) break;
    page = j.next_page;
  }
  const tokensByModel: AnthropicSummary['tokensByModel'] = {};
  page = null;
  for (let i = 0; i < 6; i++) {
    const j: any = await getJson(f, 'Anthropic', `https://api.anthropic.com/v1/organizations/usage_report/messages?${q('&group_by[]=model&group_by[]=api_key_id&group_by[]=workspace_id')}${page ? `&page=${encodeURIComponent(page)}` : ''}`, h);
    for (const b of Array.isArray(j.data) ? j.data : []) for (const r of Array.isArray(b.results) ? b.results : []) {
      const m = String(r.model ?? 'other'); const t = tokensByModel[m] ??= { in: 0, out: 0, cacheRead: 0 };
      t.in += Number(r.uncached_input_tokens ?? 0); t.out += Number(r.output_tokens ?? 0); t.cacheRead += Number(r.cache_read_input_tokens ?? 0);
    }
    if (!j.has_more || !j.next_page) break;
    page = j.next_page;
  }
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  for (const k of Object.keys(days)) days[k] = round(days[k]);
  return { mtdUsd: round(Object.values(days).reduce((a, b) => a + b, 0)), days, byModel, tokensByModel };
}

// ---------- DeepSeek (only when a key is set) ----------
export async function fetchDeepseekBalance(key: string, f: FetchFn = fetch): Promise<Metric[]> {
  const j = await getJson(f, 'DeepSeek', 'https://api.deepseek.com/user/balance', { Authorization: `Bearer ${key}`, Accept: 'application/json' });
  const infos: any[] = Array.isArray(j.balance_infos) ? j.balance_infos : [];
  const usd = infos.find(i => i.currency === 'USD');
  const info = usd ?? infos[0];
  const cur = info?.currency ?? 'USD';
  const val = (v: unknown) => (usd ? parseMoney(v) : null);   // a non-USD balance is recorded in raw only, never as dollars
  return [
    { metric: 'deepseek_balance', value: val(info?.total_balance), raw: { currency: cur, total: info?.total_balance ?? null } },
    { metric: 'deepseek_granted', value: val(info?.granted_balance) },
    { metric: 'deepseek_topped_up', value: val(info?.topped_up_balance) },
    { metric: 'deepseek_available', value: j.is_available ? 1 : 0 },
  ];
}

// ---------- Google Cloud budget notices (Pub/Sub push) ----------
export interface GcpBudgetNotice { costUsd: number; budgetUsd: number; threshold: number | null; forecast: boolean; name: string }
export function parseGcpBudget(body: any): GcpBudgetNotice | null {
  try {
    const data = body?.message?.data;
    const j = JSON.parse(Buffer.from(String(data ?? ''), 'base64').toString('utf8'));
    if (j.currencyCode && j.currencyCode !== 'USD') return null;
    const cost = Number(j.costAmount), budget = Number(j.budgetAmount);
    if (!Number.isFinite(cost) || !Number.isFinite(budget)) return null;
    const th = j.alertThresholdExceeded ?? j.forecastThresholdExceeded;
    return { costUsd: cost, budgetUsd: budget, threshold: th == null ? null : Number(th), forecast: j.forecastThresholdExceeded != null && j.alertThresholdExceeded == null, name: String(j.budgetDisplayName ?? '').slice(0, 80) };
  } catch { return null; }
}
// Pub/Sub push can carry a shared token in the URL (?token=...) or as a Bearer header. Compared in constant time.
export function pushTokenOk(provided: string | undefined, expected: string | undefined): boolean {
  if (!expected || !provided) return false;
  const k = 'billing-push';
  const a = createHmac('sha256', k).update(provided).digest(), b = createHmac('sha256', k).update(expected).digest();
  return timingSafeEqual(a, b);
}
