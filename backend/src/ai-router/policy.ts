import { BUNDLES, bundlePrice, planById, planPrice } from '../shared/pricing-catalog';
import { Depth, RouterError } from './types';

// What each plan may do with the engines, and what it may cost us per month.
// The monthly cap is the plan's price divided by the margin multiplier (default 2.5), so a customer who uses
// every last cent of their allowance still pays at least 2.5 times what the engines cost us.

export const MARGIN_MULTIPLIER_DEFAULT = 2.5;
export const FREE_ALLOWANCE_USD = 0.75;     // what a Free account may cost us per month (marketing spend, not margin-guarded)

export type SearchPlan = 'search_free' | 'search_pro' | 'search_max';
export interface RouterPolicy {
  planId: string;
  searchPlan: SearchPlan;
  label: string;
  combined: boolean;
  maxDepth: Depth;
  claudeModel: Record<Depth, string>;
  maxOutputTokens: Record<Depth, number>;
  searches: Record<Depth, number>;
  effort: Record<Depth, 'low' | 'medium' | 'high'>;
  priceMonthlyUsd: number;                  // lowest price the customer pays for the search part
  perSeat: boolean;
}

const HAIKU = 'claude-haiku-5-5', SONNET = 'claude-sonnet-5-5', OPUS = 'claude-opus-5-5';
const BASE = {
  maxOutputTokens: { quick: 6000, pro: 16000, deep: 32000 },
  searches: { quick: 2, pro: 5, deep: 8 },
  effort: { quick: 'low', pro: 'medium', deep: 'high' } as const,
};
const SHAPES: Record<SearchPlan, Omit<RouterPolicy, 'planId' | 'label' | 'priceMonthlyUsd' | 'perSeat'>> = {
  search_free: { searchPlan: 'search_free', combined: false, maxDepth: 'quick', claudeModel: { quick: HAIKU, pro: HAIKU, deep: HAIKU }, ...BASE, maxOutputTokens: { quick: 6000, pro: 6000, deep: 6000 } },
  search_pro: { searchPlan: 'search_pro', combined: true, maxDepth: 'pro', claudeModel: { quick: HAIKU, pro: SONNET, deep: SONNET }, ...BASE },
  search_max: { searchPlan: 'search_max', combined: true, maxDepth: 'deep', claudeModel: { quick: SONNET, pro: OPUS, deep: OPUS }, ...BASE },
};

// Plans sold before the catalog (kept working for existing subscribers). Prices per month; Business is per seat.
const LEGACY: Record<string, { plan: SearchPlan; price: number; perSeat?: boolean }> = {
  starter: { plan: 'search_pro', price: 8 }, plus: { plan: 'search_pro', price: 20 }, pro: { plan: 'search_pro', price: 45 },
  business: { plan: 'search_pro', price: 35, perSeat: true }, max: { plan: 'search_max', price: 129 },
};

const lowest = (id: string) => { const p = planById(id); return p ? Math.min(planPrice(p, 'annual'), planPrice(p, 'monthly')) : 0; };

export function policyFor(planId: string | null | undefined): RouterPolicy {
  const id = planId || 'search_free';
  const legacy = LEGACY[id];
  if (legacy) return { planId: id, ...SHAPES[legacy.plan], label: legacy.plan, priceMonthlyUsd: legacy.price, perSeat: !!legacy.perSeat };
  if (id === 'search_pro' || id === 'search_max') return { planId: id, ...SHAPES[id], label: id, priceMonthlyUsd: lowest(id), perSeat: false };
  const bundle = BUNDLES.find(b => b.id === id);
  if (bundle) {
    const part = bundle.plans.find(p => p === 'search_max') ?? bundle.plans.find(p => p === 'search_pro');
    if (part) return { planId: id, ...SHAPES[part as SearchPlan], label: part, priceMonthlyUsd: Math.round(lowest(part) * (1 - bundle.discount) * 100) / 100, perSeat: false };
  }
  return { planId: id, ...SHAPES.search_free, label: 'search_free', priceMonthlyUsd: 0, perSeat: false };
}

export const isFree = (p: RouterPolicy) => p.priceMonthlyUsd === 0;

// Monthly API-cost ceiling for one account (Business: multiply by seats).
export function monthlyCapUsd(p: RouterPolicy, multiplier = MARGIN_MULTIPLIER_DEFAULT): number {
  if (isFree(p)) return FREE_ALLOWANCE_USD;
  return Math.floor((p.priceMonthlyUsd / multiplier) * 100) / 100;
}

const DEPTH_RANK: Record<Depth, number> = { quick: 0, pro: 1, deep: 2 };
export function checkDepth(p: RouterPolicy, depth: Depth) {
  if (DEPTH_RANK[depth] > DEPTH_RANK[p.maxDepth]) {
    const need = depth === 'deep' ? 'Deep Research comes with Search Max.' : 'Pro depth comes with a paid plan.';
    throw new RouterError(need, 403, 'DEPTH_NOT_ALLOWED');
  }
}
export function checkCombined(p: RouterPolicy) {
  if (!p.combined) throw new RouterError('Combined mode runs all three engines and comes with a paid plan.', 403, 'COMBINED_NOT_ALLOWED');
}

// Assumed cost of one engine answer at each depth, used to refuse a question that would push an account over its cap.
// Real cost is recorded after the answer. These are assumptions to revisit with real usage.
export const ESTIMATE_USD: Record<Depth, number> = { quick: 0.02, pro: 0.08, deep: 0.40 };
export const estimateUsd = (depth: Depth, engines: number) => ESTIMATE_USD[depth] * engines;
