// Unit tests for the pricing formula (simulated data only).
//   npm run build && node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { DEFAULT_RULES, marketStats, recommend, grossMarginPct, markupPct, mergeRules } = require('../dist/pricing/engine.js');

const now = new Date('2026-10-20T12:00:00Z');
const hoursAgo = h => new Date(now.getTime() - h * 3_600_000).toISOString();
const verified = (price, n, extra = {}) => ({ id: `p${n}`, price, verified: true, price_type: 'advertised', confidence: 0.9, source_url: `https://shop${n}.example/item`, competitor_name: `Shop ${n}`, retrieved_at: hoursAgo(2), ...extra });
const market = (...prices) => prices.map((p, i) => verified(p, i + 1));
const manual = { mode: 'manual', auto_enabled: false, now };
const auto = { mode: 'automatic', auto_enabled: true, now };

test('gross margin and markup are different and computed correctly', () => {
  assert.equal(grossMarginPct(132, 90), 31.82);  // (132-90)/132
  assert.equal(markupPct(132, 90), 46.67);       // (132-90)/90
  assert.equal(markupPct(100, 0), null);         // no cost -> markup undefined
});

test('example: $150 vs verified $135 average, $90 cost, 25% minimum margin -> $132 (-12%, 31.82% margin)', () => {
  const stats = marketStats(market(130, 135, 140), DEFAULT_RULES, 'USD', now);
  assert.equal(stats.average, 135);
  const r = recommend({ current_price: 150, unit_cost: 90 }, stats, DEFAULT_RULES, manual);
  assert.equal(r.recommended_price, 132);
  assert.equal(r.change_pct, -12);
  assert.equal(r.gross_margin_pct, 31.82);
  assert.equal(r.direction, 'decrease');
  assert.equal(r.status_color, 'red');
  assert.match(r.explanation, /above the verified market average of \$135\.00/);
});

test('example: $100 vs verified $120 average -> $112 (+12%), flagged as an opportunity (blue)', () => {
  const stats = marketStats(market(115, 120, 125), DEFAULT_RULES, 'USD', now);
  const r = recommend({ current_price: 100, unit_cost: 50 }, stats, DEFAULT_RULES, manual);
  assert.equal(r.recommended_price, 112);
  assert.equal(r.change_pct, 12);
  assert.equal(r.status_color, 'blue');
});

test('within the deadband the price is competitive (green) and unchanged', () => {
  const stats = marketStats(market(190, 195, 200), DEFAULT_RULES, 'USD', now);
  const r = recommend({ current_price: 200, unit_cost: 100 }, stats, DEFAULT_RULES, manual);
  assert.equal(r.recommended_price, 200);
  assert.equal(r.direction, 'none');
  assert.equal(r.status_color, 'green');
});

test('minimum margin protection: never recommends below the margin floor', () => {
  const stats = marketStats(market(95, 100, 105), DEFAULT_RULES, 'USD', now);   // market far below our cost basis
  const r = recommend({ current_price: 150, unit_cost: 90 }, stats, DEFAULT_RULES, manual);
  assert.equal(r.margin_floor, 120);                // 90 / (1 - 0.25)
  assert.equal(r.recommended_price, 120);
  assert.ok(r.gross_margin_pct >= 25);
  assert.match(r.explanation, /minimum-margin price \$120\.00/);
});

test('rounding never pushes the price under the margin floor', () => {
  const rules = mergeRules({ min_margin_pct: 30 });
  const stats = marketStats(market(50, 52, 54), rules, 'USD', now);
  const r = recommend({ current_price: 90, unit_cost: 70 }, stats, rules, manual);  // floor 100 > current
  assert.ok(r.recommended_price >= 100);
  assert.equal(r.below_floor, true);
});

test('costs include operating and delivery expenses', () => {
  const stats = marketStats(market(100, 100, 100), DEFAULT_RULES, 'USD', now);
  const r = recommend({ current_price: 130, unit_cost: 60, operating_cost: 10, delivery_cost: 5 }, stats, DEFAULT_RULES, manual);
  assert.equal(r.total_cost, 75);
  assert.equal(r.margin_floor, 100);
  assert.equal(r.recommended_price, 100);
});

test('missing market data: no change, gray status, never fabricated', () => {
  const r = recommend({ current_price: 150, unit_cost: 90 }, marketStats([], DEFAULT_RULES, 'USD', now), DEFAULT_RULES, auto);
  assert.equal(r.direction, 'none');
  assert.equal(r.status_color, 'gray');
  assert.equal(r.auto_eligible, false);
});

test('unverified, AI-suggested, stale, promotional, other-currency and shipping-inclusive prices are excluded', () => {
  const prices = [
    verified(100, 1),
    verified(10, 2, { verified: false }),
    verified(11, 3, { price_type: 'ai_suggestion' }),
    verified(12, 4, { retrieved_at: hoursAgo(500) }),
    verified(13, 5, { is_promotional: true }),
    verified(14, 6, { currency: 'EUR' }),
    verified(15, 7, { includes_shipping: true }),
  ];
  const stats = marketStats(prices, DEFAULT_RULES, 'USD', now);
  assert.equal(stats.count, 1);
  assert.equal(stats.average, 100);
  assert.equal(stats.excluded.length, 6);
});

test('outliers and duplicate sources do not skew the average', () => {
  const prices = [...market(100, 102, 98), verified(900, 9), verified(50, 1, { retrieved_at: hoursAgo(10) })];
  const stats = marketStats(prices, DEFAULT_RULES, 'USD', now);
  assert.equal(stats.count, 3);          // 900 dropped as outlier, older shop1 duplicate dropped
  assert.equal(stats.average, 100);
});

test('automatic mode stays blocked when it is not enabled', () => {
  const stats = marketStats(market(100, 101, 99), DEFAULT_RULES, 'USD', now);
  const r = recommend({ current_price: 103.5, unit_cost: 40 }, stats, mergeRules({ deadband_pct: 1 }), { mode: 'automatic', auto_enabled: false, now });
  assert.equal(r.auto_eligible, false);
  assert.ok(r.blocked_reasons.some(b => /Automatic pricing is off/.test(b)));
});

test('automatic mode applies only small, well-sourced changes within limits', () => {
  const rules = mergeRules({ deadband_pct: 1, approval_threshold_pct: 5 });
  const stats = marketStats(market(100, 101, 99), rules, 'USD', now);
  const small = recommend({ current_price: 101.9, unit_cost: 40 }, stats, mergeRules({ ...rules, rounding: 'cent' }), auto);
  assert.equal(small.direction, 'decrease');
  assert.equal(small.auto_eligible, true, small.blocked_reasons.join('; '));
  const large = recommend({ current_price: 150, unit_cost: 40 }, stats, rules, auto);
  assert.equal(large.auto_eligible, false);
  assert.ok(large.blocked_reasons.some(b => /automatic limit/.test(b)));
});

test('automatic mode respects source count, confidence, freshness, cooldown, daily limit and volatility', () => {
  const rules = mergeRules({ deadband_pct: 1, rounding: 'cent' });
  const item = { current_price: 101.9, unit_cost: 40 };
  const fewSources = recommend(item, marketStats(market(100, 100), rules, 'USD', now), rules, auto);
  assert.ok(fewSources.blocked_reasons.some(b => /verified source/.test(b)));
  const lowConf = recommend(item, marketStats(market(100, 101, 99).map(p => ({ ...p, confidence: 0.3 })), rules, 'USD', now), rules, auto);
  assert.ok(lowConf.blocked_reasons.some(b => /confidence/.test(b)));
  const stats = marketStats(market(100, 101, 99), rules, 'USD', now);
  const cooldown = recommend(item, stats, rules, { ...auto, last_price_change_at: hoursAgo(5) });
  assert.ok(cooldown.blocked_reasons.some(b => /cooldown/.test(b)));
  const daily = recommend(item, stats, rules, { ...auto, changed_last_24h_pct: 9.5 });
  assert.ok(daily.blocked_reasons.some(b => /daily change limit/.test(b)));
  const volatile = recommend(item, stats, rules, { ...auto, previous_market_average: 70 });
  assert.ok(volatile.blocked_reasons.some(b => /anomaly/.test(b)));
});

test('price increases are capped by the maximum price rule', () => {
  const rules = mergeRules({ max_price: 105 });
  const stats = marketStats(market(140, 150, 160), rules, 'USD', now);
  const r = recommend({ current_price: 100, unit_cost: 40 }, stats, rules, manual);
  assert.equal(r.recommended_price, 105);
});
