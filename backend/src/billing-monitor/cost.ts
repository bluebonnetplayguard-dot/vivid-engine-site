// Cost math for the Billing Monitor. Pure functions: no database, no network, no clock.
// Prices come from the model_prices table (rows below); nothing here knows a price.
//
// Rules the tests pin down:
//  - A cost the provider reported itself is used as is (cost_source 'reported').
//  - Otherwise every kind of usage that was billed must have a price. If one has none, or the usage is
//    missing altogether, the call is 'pending' with NO cost (null), never a silent zero.
//  - A call that failed before anything was billed costs nothing and is 'final' (cost_source 'failed').

export type TokenType = 'input' | 'output' | 'cache_read' | 'cache_write' | 'thinking' | 'search' | 'call';
export type PriceWindow = 'any' | 'peak' | 'offpeak';

export interface PriceRow {
  provider: string;
  model: string;                   // exact id or '*'
  token_type: TokenType;
  price_usd: number | string;      // per 1M tokens when unit = 'mtok', else per single unit
  unit: 'mtok' | 'unit';
  price_window: PriceWindow;
  effective_from: Date | string;
  effective_to: Date | string | null;
}

export interface Units {
  input?: number | null;
  output?: number | null;
  cacheRead?: number | null;
  cacheWrite?: number | null;
  thinking?: number | null;
  searches?: number | null;
  calls?: number | null;           // for providers billed per call
}

export interface CostResult {
  costUsd: number | null;          // null while pending
  status: 'final' | 'pending';
  source: 'computed' | 'reported' | 'failed';
  missing: TokenType[];            // billed kinds of usage that had no price
}

const MICRO = 1_000_000;
const t = (d: Date | string) => (d instanceof Date ? d.getTime() : Date.parse(d));

// Money from a provider arrives as a decimal string ("12.3456"). Parse it without floating point, as micro-dollars.
export function parseMoneyMicros(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * MICRO) : null;
  if (typeof v !== 'string') return null;
  const m = /^\s*(-)?(\d+)(?:\.(\d+))?\s*$/.exec(v);
  if (!m) return null;
  const frac = (m[3] ?? '').padEnd(6, '0').slice(0, 6);
  const rounded = Number(m[2]) * MICRO + Number(frac) + ((m[3] ?? '').length > 6 && Number((m[3] as string)[6]) >= 5 ? 1 : 0);
  return m[1] ? -rounded : rounded;
}
export const microsToUsd = (m: number) => m / MICRO;
export const parseMoney = (v: unknown): number | null => { const m = parseMoneyMicros(v); return m == null ? null : microsToUsd(m); };

// DeepSeek charges half price off-peak. Peak is 01:00-04:00 and 06:00-10:00 UTC on weekdays.
export function deepseekWindow(at: Date): 'peak' | 'offpeak' {
  const day = at.getUTCDay(), h = at.getUTCHours();
  if (day === 0 || day === 6) return 'offpeak';
  return (h >= 1 && h < 4) || (h >= 6 && h < 10) ? 'peak' : 'offpeak';
}
export const windowFor = (provider: string, at: Date): PriceWindow => (provider === 'deepseek' ? deepseekWindow(at) : 'any');

// The price row that applies at `at`: exact model before '*', the matching window before 'any', newest start date first.
export function pickPrice(rows: PriceRow[], provider: string, model: string, type: TokenType, at: Date, window: PriceWindow = 'any'): PriceRow | null {
  const cands = rows.filter(r => r.provider === provider && r.token_type === type && (r.model === model || r.model === '*')
    && (r.price_window === window || r.price_window === 'any') && t(r.effective_from) <= at.getTime() && (r.effective_to == null || t(r.effective_to) > at.getTime()));
  cands.sort((a, b) => (Number(b.model === model) - Number(a.model === model)) || (Number(b.price_window === window) - Number(a.price_window === window)) || (t(b.effective_from) - t(a.effective_from)));
  return cands[0] ?? null;
}

const KINDS: { type: TokenType; of: (u: Units) => number | null | undefined }[] = [
  { type: 'input', of: u => u.input }, { type: 'output', of: u => u.output }, { type: 'cache_read', of: u => u.cacheRead },
  { type: 'cache_write', of: u => u.cacheWrite }, { type: 'thinking', of: u => u.thinking }, { type: 'search', of: u => u.searches },
];

export function computeCost(rows: PriceRow[], provider: string, model: string, units: Units, at: Date, opts: { reportedUsd?: number | null; failed?: boolean } = {}): CostResult {
  if (opts.failed) return { costUsd: 0, status: 'final', source: 'failed', missing: [] };
  if (opts.reportedUsd != null && Number.isFinite(opts.reportedUsd)) return { costUsd: round6(opts.reportedUsd), status: 'final', source: 'reported', missing: [] };

  const window = windowFor(provider, at);
  let micros = 0; let billed = 0; const missing: TokenType[] = [];
  for (const k of KINDS) {
    const n = k.of(units);
    if (!n || n < 0) continue;
    billed++;
    const p = pickPrice(rows, provider, model, k.type, at, window);
    if (!p) { missing.push(k.type); continue; }
    const price = parseMoneyMicros(String(p.price_usd)) ?? 0;   // micro-dollars per Mtok (or per unit)
    micros += p.unit === 'mtok' ? (n * price) / MICRO : n * price;
  }
  // Providers billed per call: one call price covers the whole answer, used when there are no token prices to use.
  const callPrice = pickPrice(rows, provider, model, 'call', at, window);
  if (callPrice && (billed === 0 || missing.length)) {
    const calls = units.calls ?? 1;
    const perCall = parseMoneyMicros(String(callPrice.price_usd)) ?? 0;
    // Token prices missing but a per-call price exists: the per-call price stands in for the whole answer.
    return { costUsd: round6(microsToUsd(calls * perCall + micros)), status: 'final', source: 'computed', missing: [] };
  }
  if (billed === 0 || missing.length) return { costUsd: null, status: 'pending', source: 'computed', missing };
  return { costUsd: round6(microsToUsd(micros)), status: 'final', source: 'computed', missing: [] };
}

export const round6 = (n: number) => Math.round(n * MICRO) / MICRO;
