// Vivid AI Search plans. Prices and feature text come from the pricing catalog (shared/pricing-catalog.ts), the
// single source of truth. This file adds what the API needs to enforce: question limits and lanes. Which engines,
// depths and models a plan may use, and its monthly cost ceiling, are in ai-router/policy.ts.
//
// Plans sold before the catalog (starter, plus, pro, max, business) keep working for people who already have them,
// at the prices they pay, but are no longer offered: `legacy: true`.

import { SEARCH_PLANS, planById, planPrice } from '../shared/pricing-catalog';

export type TierId = 'search_free' | 'search_pro' | 'search_max' | 'starter' | 'plus' | 'pro' | 'max' | 'business';

export interface Tier {
  id: TierId;
  name: string;
  tagline: string;
  priceMonthly: number;          // USD charged each month on monthly billing; for Business this is per seat
  perSeat: boolean;
  minSeats: number;
  modelLabel: string;
  dailyLimit: number;            // questions per user per day
  monthlyLimit: number;          // questions per month (Business: per seat, pooled across the company)
  perMinute: number;             // burst limit per user
  priority: boolean;             // paid lanes never wait behind the shared free lane
  historyTurns: number;          // earlier messages in the thread sent as context
  features: string[];
  badge?: string;
  legacy?: boolean;
}

const fromCatalog = (id: 'search_free' | 'search_pro' | 'search_max') => {
  const p = planById(id)!;
  return { name: p.name.replace(/^Search /, ''), tagline: p.tagline, priceMonthly: planPrice(p, 'monthly'), features: p.features, badge: p.badge };
};

export const TIERS: Tier[] = [
  { id: 'search_free', ...fromCatalog('search_free'), name: 'Free', perSeat: false, minSeats: 1, modelLabel: 'Claude Haiku 5.5',
    dailyLimit: 5, monthlyLimit: 60, perMinute: 3, priority: false, historyTurns: 4 },
  { id: 'search_pro', ...fromCatalog('search_pro'), name: 'Search Pro', perSeat: false, minSeats: 1, modelLabel: 'Claude Sonnet 5.5',
    dailyLimit: 40, monthlyLimit: 300, perMinute: 10, priority: true, historyTurns: 14 },
  { id: 'search_max', ...fromCatalog('search_max'), name: 'Search Max', perSeat: false, minSeats: 1, modelLabel: 'Claude Opus 5.5',
    dailyLimit: 100, monthlyLimit: 1000, perMinute: 12, priority: true, historyTurns: 20 },

  { id: 'starter', legacy: true, name: 'Starter', tagline: 'More questions, plus a second opinion.', priceMonthly: 8, perSeat: false, minSeats: 1, modelLabel: 'Claude Haiku 5.5',
    dailyLimit: 25, monthlyLimit: 150, perMinute: 6, priority: true, historyTurns: 8, features: [] },
  { id: 'plus', legacy: true, name: 'Plus', tagline: 'A stronger model for real research.', priceMonthly: 20, perSeat: false, minSeats: 1, modelLabel: 'Claude Sonnet 5.5',
    dailyLimit: 30, monthlyLimit: 120, perMinute: 8, priority: true, historyTurns: 10, features: [] },
  { id: 'pro', legacy: true, name: 'Pro', tagline: 'Three engines checked against each other.', priceMonthly: 45, perSeat: false, minSeats: 1, modelLabel: 'Claude Sonnet 5.5',
    dailyLimit: 40, monthlyLimit: 200, perMinute: 10, priority: true, historyTurns: 14, features: [] },
  { id: 'max', legacy: true, name: 'Max', tagline: 'Our most capable model for the hardest questions.', priceMonthly: 129, perSeat: false, minSeats: 1, modelLabel: 'Claude Opus 5.5',
    dailyLimit: 60, monthlyLimit: 250, perMinute: 12, priority: true, historyTurns: 20, features: [] },
  { id: 'business', legacy: true, name: 'Business', tagline: 'Pro-level research for your whole team.', priceMonthly: 35, perSeat: true, minSeats: 2, modelLabel: 'Claude Sonnet 5.5',
    dailyLimit: 40, monthlyLimit: 150, perMinute: 10, priority: true, historyTurns: 14, features: [] },
];

// The id the rest of the code and older records use for "no plan".
const ALIASES: Record<string, TierId> = { free: 'search_free' };
export const tierById = (id: string | null | undefined): Tier => TIERS.find(t => t.id === (ALIASES[id ?? ''] ?? id)) ?? TIERS[0];

// Plans a person can buy today (legacy plans cannot be bought again).
export const PAID_TIER_IDS = TIERS.filter(t => t.priceMonthly > 0 && !t.legacy).map(t => t.id);
// Plans with the stack advisor and other Pro-level extras: every paid plan, old or new.
export const PRO_LEVEL_TIER_IDS: TierId[] = TIERS.filter(t => t.priceMonthly > 0).map(t => t.id);

// What the public pricing page shows (no internal fields). Legacy plans are not listed.
export function publicTiers() {
  return TIERS.filter(t => !t.legacy).map(({ id, name, tagline, priceMonthly, perSeat, minSeats, modelLabel, dailyLimit, monthlyLimit, priority, features, badge }) =>
    ({ id, name, tagline, priceMonthly, perSeat, minSeats, modelLabel, dailyLimit, monthlyLimit, priority, features, badge: badge ?? null }));
}

export { SEARCH_PLANS };
