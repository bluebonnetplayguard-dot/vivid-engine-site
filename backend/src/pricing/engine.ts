// Pure pricing math: market statistics, recommendations and safety checks.
// No I/O here, so every rule can be unit-tested (test/pricing-engine.test.mjs).
//
// Definitions used throughout:
//   total cost      = unit cost + operating cost + delivery cost (per unit)
//   gross margin %  = (price - total cost) / price * 100
//   markup %        = (price - total cost) / total cost * 100
//   margin floor    = total cost / (1 - minimum margin)   (lowest price that keeps the minimum margin)

export interface PricingRules {
  min_margin_pct: number;          // never recommend below this gross margin
  max_margin_pct: number | null;   // optional ceiling on gross margin
  max_auto_increase_pct: number;   // automatic mode: largest single increase
  max_auto_decrease_pct: number;   // automatic mode: largest single decrease
  max_daily_change_pct: number;    // automatic mode: total change allowed per 24h
  min_price: number | null;
  max_price: number | null;
  min_confidence: number;          // 0..1, average confidence of the verified sources
  min_sources: number;             // distinct verified sources required
  approval_threshold_pct: number;  // automatic mode: changes larger than this still need approval
  cooldown_hours: number;          // minimum time between price changes for one item
  max_source_age_hours: number;    // market data older than this is stale
  deadband_pct: number;            // within this distance of the market average = competitive (green)
  red_pct: number;                 // above the average by more than this = significant deviation (red)
  blue_pct: number;                // below the average by more than this, with margin room = opportunity (blue)
  market_position_pct: number;     // where to sit relative to the average when lowering (e.g. -2 = 2% under)
  increase_capture_pct: number;    // when raising, move this share of the gap toward the average
  volatility_pct: number;          // market average moved more than this since last analysis = anomaly
  include_promotions: boolean;     // count promotional prices in market statistics
  rounding: 'cent' | 'dollar' | 'ninety_nine';
}

export const DEFAULT_RULES: PricingRules = {
  min_margin_pct: 25,
  max_margin_pct: null,
  max_auto_increase_pct: 5,
  max_auto_decrease_pct: 5,
  max_daily_change_pct: 10,
  min_price: null,
  max_price: null,
  min_confidence: 0.7,
  min_sources: 3,
  approval_threshold_pct: 3,
  cooldown_hours: 72,
  max_source_age_hours: 168,
  deadband_pct: 3,
  red_pct: 10,
  blue_pct: 5,
  market_position_pct: -2,
  increase_capture_pct: 60,
  volatility_pct: 15,
  include_promotions: false,
  rounding: 'dollar',
};

export interface MarketPrice {
  id?: string;
  price: number;
  currency?: string;
  source_url?: string;
  competitor_name?: string;
  retrieved_at?: string;
  price_type?: string;
  confidence?: number;
  verified?: boolean;
  includes_shipping?: boolean;
  includes_tax?: boolean;
  is_promotional?: boolean;
}

export interface MarketStats {
  count: number;            // usable prices after filtering
  sources: number;          // distinct source hosts among them
  average: number | null;
  median: number | null;
  low: number | null;
  high: number | null;
  confidence: number;       // mean confidence 0..1
  newest_age_hours: number | null;
  oldest_age_hours: number | null;
  used_ids: string[];
  excluded: { id?: string; reason: string }[];
}

export interface ItemInput {
  current_price: number;
  unit_cost?: number;
  operating_cost?: number;
  delivery_cost?: number;
  currency?: string;
  demand_signal?: 'low' | 'normal' | 'high';
}

export interface Context {
  mode: 'manual' | 'assisted' | 'automatic';
  auto_enabled: boolean;
  last_price_change_at?: string | null;
  previous_market_average?: number | null;
  changed_last_24h_pct?: number;   // sum of absolute % changes applied in the last 24h
  now?: Date;
}

export interface Recommendation {
  current_price: number;
  recommended_price: number;
  change_pct: number;
  direction: 'increase' | 'decrease' | 'none';
  status_color: 'green' | 'yellow' | 'red' | 'blue' | 'gray';
  total_cost: number;
  margin_floor: number;
  gross_margin_pct: number | null;
  markup_pct: number | null;
  current_gross_margin_pct: number | null;
  below_floor: boolean;           // current price is already below the margin floor
  auto_eligible: boolean;
  requires_approval: boolean;
  blocked_reasons: string[];
  reasons: string[];
  explanation: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
const usd = (n: number) => `$${n.toFixed(2)}`;
const host = (url?: string) => { try { return new URL(String(url)).hostname.replace(/^www\./, ''); } catch { return String(url || ''); } };
const hoursSince = (iso: string | undefined | null, now: Date) => (iso ? (now.getTime() - new Date(iso).getTime()) / 3_600_000 : Infinity);

export function mergeRules(stored: Partial<PricingRules> | null | undefined): PricingRules {
  const out = { ...DEFAULT_RULES };
  for (const [k, v] of Object.entries(stored ?? {})) if (k in out && v !== undefined) (out as any)[k] = v;
  return out;
}

export function grossMarginPct(price: number, totalCost: number): number | null {
  return price > 0 ? round2(((price - totalCost) / price) * 100) : null;
}
export function markupPct(price: number, totalCost: number): number | null {
  return totalCost > 0 ? round2(((price - totalCost) / totalCost) * 100) : null;
}

export function roundPrice(n: number, mode: PricingRules['rounding']): number {
  if (mode === 'cent') return round2(n);
  if (mode === 'ninety_nine') return Math.max(0.99, round2(Math.round(n) - 0.01)); // nearest X.99
  return Math.round(n);
}

// Smallest rounded price that is not below n.
function roundUp(n: number, mode: PricingRules['rounding']): number {
  if (mode === 'cent') return Math.ceil(n * 100 - 1e-9) / 100;
  if (mode === 'ninety_nine') return round2(Math.ceil(n + 0.01 - 1e-9) - 0.01);
  return Math.ceil(n - 1e-9);
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Only verified, fresh, comparable prices count. Everything excluded is listed with a reason.
export function marketStats(prices: MarketPrice[], rules: PricingRules, currency = 'USD', now = new Date()): MarketStats {
  const excluded: MarketStats['excluded'] = [];
  const latestBySource = new Map<string, MarketPrice>();
  for (const p of prices) {
    const reason =
      !(Number.isFinite(p.price) && p.price > 0) ? 'invalid price'
      : !p.verified ? 'not verified'
      : !['transaction', 'advertised'].includes(p.price_type || 'advertised') ? `price type "${p.price_type}" is not a market price`
      : (p.currency || 'USD') !== currency ? `different currency (${p.currency})`
      : p.includes_shipping || p.includes_tax ? 'includes shipping or tax (not comparable)'
      : p.is_promotional && !rules.include_promotions ? 'promotional price'
      : hoursSince(p.retrieved_at, now) > rules.max_source_age_hours ? 'stale'
      : '';
    if (reason) { excluded.push({ id: p.id, reason }); continue; }
    const key = `${host(p.source_url)}|${(p.competitor_name || '').toLowerCase()}`;
    const prev = latestBySource.get(key);
    if (!prev || hoursSince(p.retrieved_at, now) < hoursSince(prev.retrieved_at, now)) {
      if (prev) excluded.push({ id: prev.id, reason: 'older duplicate from the same source' });
      latestBySource.set(key, p);
    } else excluded.push({ id: p.id, reason: 'older duplicate from the same source' });
  }
  let usable = [...latestBySource.values()];
  // Drop anomalies: prices more than 3x away from the median.
  if (usable.length >= 3) {
    const m = median(usable.map(p => p.price));
    usable = usable.filter(p => {
      const ok = p.price <= m * 3 && p.price >= m / 3;
      if (!ok) excluded.push({ id: p.id, reason: 'outlier (more than 3x from the median)' });
      return ok;
    });
  }
  if (!usable.length) {
    return { count: 0, sources: 0, average: null, median: null, low: null, high: null, confidence: 0, newest_age_hours: null, oldest_age_hours: null, used_ids: [], excluded };
  }
  const values = usable.map(p => p.price);
  const ages = usable.map(p => hoursSince(p.retrieved_at, now));
  return {
    count: usable.length,
    sources: new Set(usable.map(p => host(p.source_url))).size,
    average: round2(values.reduce((a, b) => a + b, 0) / values.length),
    median: round2(median(values)),
    low: Math.min(...values),
    high: Math.max(...values),
    confidence: round2(usable.reduce((a, p) => a + (p.confidence ?? 0.5), 0) / usable.length),
    newest_age_hours: round2(Math.min(...ages)),
    oldest_age_hours: round2(Math.max(...ages)),
    used_ids: usable.map(p => p.id).filter(Boolean) as string[],
    excluded,
  };
}

export function recommend(item: ItemInput, stats: MarketStats, rules: PricingRules, ctx: Context): Recommendation {
  const now = ctx.now ?? new Date();
  const current = item.current_price;
  const totalCost = round2((item.unit_cost || 0) + (item.operating_cost || 0) + (item.delivery_cost || 0));
  const minMargin = Math.min(Math.max(rules.min_margin_pct, 0), 99) / 100;
  const marginFloor = Math.max(rules.min_price ?? 0, totalCost > 0 ? totalCost / (1 - minMargin) : 0);
  const marginCeiling = Math.min(
    rules.max_price ?? Infinity,
    totalCost > 0 && rules.max_margin_pct != null && rules.max_margin_pct < 100 ? totalCost / (1 - rules.max_margin_pct / 100) : Infinity,
  );
  const reasons: string[] = [];
  const blocked: string[] = [];
  const belowFloor = current < marginFloor - 0.005;
  const currentMargin = grossMarginPct(current, totalCost);

  const base = {
    current_price: current, total_cost: totalCost, margin_floor: round2(marginFloor), below_floor: belowFloor,
    current_gross_margin_pct: currentMargin,
  };

  if (!stats.count || stats.average == null) {
    const msg = 'No verified market prices are available, so no change is recommended. Prices are never estimated when reliable data is missing.';
    return {
      ...base, recommended_price: current, change_pct: 0, direction: 'none', status_color: 'gray',
      gross_margin_pct: currentMargin, markup_pct: markupPct(current, totalCost),
      auto_eligible: false, requires_approval: false, blocked_reasons: ['No verified market data'], reasons: [msg],
      explanation: msg + (belowFloor ? ` Note: the current price ${usd(current)} is below the minimum-margin price ${usd(marginFloor)}.` : ''),
    };
  }

  const avg = stats.average;
  const diffPct = ((current - avg) / avg) * 100;
  let color: Recommendation['status_color'];
  if (Math.abs(diffPct) <= rules.deadband_pct) color = 'green';
  else if (diffPct < -rules.blue_pct && current < marginCeiling) color = 'blue';
  else if (Math.abs(diffPct) > rules.red_pct) color = 'red';
  else color = 'yellow';

  let target = current;
  if (Math.abs(diffPct) <= rules.deadband_pct) {
    reasons.push(`Price is within ${rules.deadband_pct}% of the verified market average (${usd(avg)}); no change needed.`);
  } else if (current > avg) {
    let position = rules.market_position_pct;
    if (item.demand_signal === 'high') position += 2;       // strong demand: stay closer to current
    if (item.demand_signal === 'low') position -= 1;        // weak demand: a little sharper
    target = avg * (1 + position / 100);
    reasons.push(`Price is ${pct(diffPct)} above the verified market average of ${usd(avg)} across ${stats.count} price(s) from ${stats.sources} source(s).`);
    reasons.push(`Target sits ${pct(position)} relative to the average.`);
  } else {
    let capture = rules.increase_capture_pct;
    if (item.demand_signal === 'high') capture = Math.min(100, capture + 15);
    if (item.demand_signal === 'low') capture = Math.max(0, capture - 30);
    target = current + (avg - current) * (capture / 100);
    reasons.push(`Price is ${pct(diffPct)} below the verified market average of ${usd(avg)} across ${stats.count} price(s) from ${stats.sources} source(s).`);
    reasons.push(`Moving ${capture}% of the gap toward the average to raise margin gradually.`);
  }

  if (target < marginFloor) {
    reasons.push(`Held at the minimum-margin price ${usd(marginFloor)} (${rules.min_margin_pct}% gross margin on ${usd(totalCost)} total cost) instead of following the market lower.`);
    target = marginFloor;
  }
  if (target > marginCeiling) {
    reasons.push(`Capped at ${usd(marginCeiling)} by the maximum price / margin rule.`);
    target = marginCeiling;
  }
  target = roundPrice(target, rules.rounding);
  if (target < marginFloor) target = roundUp(marginFloor, rules.rounding); // rounding must never break the margin floor
  if (Math.abs(target - current) < 0.005) target = current;

  const changePct = round2(((target - current) / current) * 100);
  const direction: Recommendation['direction'] = changePct > 0 ? 'increase' : changePct < 0 ? 'decrease' : 'none';
  if (belowFloor) reasons.push(`The current price ${usd(current)} is below the minimum-margin price ${usd(marginFloor)}.`);

  // Safety checks: any one of these keeps a change from being applied automatically.
  if (ctx.mode !== 'automatic' || !ctx.auto_enabled) blocked.push('Automatic pricing is off (needs administrator approval)');
  if (stats.sources < rules.min_sources) blocked.push(`Only ${stats.sources} verified source(s); ${rules.min_sources} required`);
  if (stats.confidence < rules.min_confidence) blocked.push(`Source confidence ${stats.confidence} is below ${rules.min_confidence}`);
  if ((stats.newest_age_hours ?? Infinity) > rules.max_source_age_hours) blocked.push('Market data is stale');
  if (hoursSince(ctx.last_price_change_at, now) < rules.cooldown_hours) blocked.push(`Price changed within the last ${rules.cooldown_hours} hours (cooldown)`);
  if (direction === 'increase' && changePct > rules.max_auto_increase_pct) blocked.push(`Increase ${pct(changePct)} exceeds the automatic limit of ${rules.max_auto_increase_pct}%`);
  if (direction === 'decrease' && -changePct > rules.max_auto_decrease_pct) blocked.push(`Decrease ${pct(changePct)} exceeds the automatic limit of ${rules.max_auto_decrease_pct}%`);
  if ((ctx.changed_last_24h_pct ?? 0) + Math.abs(changePct) > rules.max_daily_change_pct) blocked.push(`Would exceed the ${rules.max_daily_change_pct}% daily change limit`);
  if (Math.abs(changePct) > rules.approval_threshold_pct) blocked.push(`Change is larger than the ${rules.approval_threshold_pct}% approval threshold`);
  if (ctx.previous_market_average && Math.abs((avg - ctx.previous_market_average) / ctx.previous_market_average) * 100 > rules.volatility_pct) {
    blocked.push(`Market average moved more than ${rules.volatility_pct}% since the last analysis (possible anomaly)`);
  }
  if (rules.min_price != null && target < rules.min_price) blocked.push('Below the minimum selling price');
  if (rules.max_price != null && target > rules.max_price) blocked.push('Above the maximum selling price');

  const margin = grossMarginPct(target, totalCost);
  const markup = markupPct(target, totalCost);
  const autoEligible = direction !== 'none' && blocked.length === 0;
  const explanation = [
    direction === 'none' ? `Keep ${usd(current)}.` : `Recommend ${usd(target)} (${pct(changePct)}) instead of ${usd(current)}.`,
    ...reasons,
    `Market: average ${usd(avg)}, median ${usd(stats.median!)}, low ${usd(stats.low!)}, high ${usd(stats.high!)}.`,
    totalCost > 0 ? `At ${usd(target)}: gross margin ${margin}%, markup ${markup}% on ${usd(totalCost)} total cost.` : 'No costs entered, so margin protection cannot be applied.',
  ].join(' ');

  return {
    ...base, recommended_price: target, change_pct: changePct, direction, status_color: color,
    gross_margin_pct: margin, markup_pct: markup,
    auto_eligible: autoEligible, requires_approval: direction !== 'none' && !autoEligible,
    blocked_reasons: direction === 'none' ? [] : blocked, reasons, explanation,
  };
}
