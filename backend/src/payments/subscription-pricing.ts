// Subscription pricing from the pricing catalog. Plain functions (no Nest) so they can be tested.
import { Cycle as CatalogCycle, DISCOUNTS, planById, planPrice } from '../shared/pricing-catalog';

type SubscriptionKind = 'ai_search' | 'video_studio';
export type { SubscriptionKind };
export type SubCycle = 'monthly' | 'annual' | 'two_year';
export type Phase = { cadence: 'MONTHLY' | 'ANNUAL' | 'EVERY_TWO_YEARS'; cents: number; periods?: number };
const parseCycle = (v: unknown): SubCycle => (v === 'annual' || v === 'yearly' ? 'annual' : v === 'two_year' ? 'two_year' : 'monthly');

// What a subscription charges, from the pricing catalog: monthly (25% off the first month), annual (the annual
// monthly rate x 12, billed once a year) or a 2-year term (annual rate x 24, 10% off). Plans not in the catalog
// (legacy AI Search tiers, Video Studio) are monthly at their listed price.
export function subscriptionPricing(kind: SubscriptionKind, tierId: string, priceMonthly: number, seats: number, cycleIn: unknown):
  { cycle: SubCycle; phases: Phase[]; firstCents: number; renewalCents: number; periodLabel: string } {
  const plan = kind === 'ai_search' ? planById(tierId) : null;
  if (!plan) {
    const cents = Math.round(priceMonthly * 100) * seats;
    return { cycle: 'monthly', phases: [{ cadence: 'MONTHLY', cents }], firstCents: cents, renewalCents: cents, periodLabel: 'month' };
  }
  const cycle = parseCycle(cycleIn);
  const rate = (c: CatalogCycle) => planPrice(plan, c);
  if (cycle === 'annual') { const cents = Math.round(rate('annual') * 12 * 100); return { cycle, phases: [{ cadence: 'ANNUAL', cents }], firstCents: cents, renewalCents: cents, periodLabel: 'year' }; }
  if (cycle === 'two_year') { const cents = Math.round(rate('annual') * 24 * (1 - DISCOUNTS.twoYearTerm) * 100); return { cycle, phases: [{ cadence: 'EVERY_TWO_YEARS', cents }], firstCents: cents, renewalCents: cents, periodLabel: '2 years' }; }
  const cents = Math.round(rate('monthly') * 100);
  const first = Math.round(cents * (1 - DISCOUNTS.firstMonth));
  return { cycle, phases: [{ cadence: 'MONTHLY', cents: first, periods: 1 }, { cadence: 'MONTHLY', cents }], firstCents: first, renewalCents: cents, periodLabel: 'month' };
}

