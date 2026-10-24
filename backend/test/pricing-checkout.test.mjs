// Checkout prices come from the pricing catalog: Search plans monthly / annual / 2-year, and one-time production.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const dist = process.env.VE_DIST || new URL('../dist/', import.meta.url).pathname;
const { subscriptionPricing } = require(dist + 'payments/subscription-pricing.js');
const { catalogItems, productionItem } = require(dist + 'shared/pricing.js');

test('Search Pro: annual is $14.79 x 12 billed once a year', () => {
  const p = subscriptionPricing('ai_search', 'search_pro', 17.4, 1, 'annual');
  assert.deepEqual(p.phases, [{ cadence: 'ANNUAL', cents: 17748 }]);
  assert.equal(p.periodLabel, 'year');
});
test('Search Pro: monthly is $17.40 with 25% off the first month', () => {
  const p = subscriptionPricing('ai_search', 'search_pro', 17.4, 1, 'monthly');
  assert.deepEqual(p.phases, [{ cadence: 'MONTHLY', cents: 1305, periods: 1 }, { cadence: 'MONTHLY', cents: 1740 }]);
  assert.equal(p.firstCents, 1305); assert.equal(p.renewalCents, 1740);
});
test('Search Max: 2-year term is the annual rate x 24 less 10%', () => {
  const p = subscriptionPricing('ai_search', 'search_max', 174, 1, 'two_year');
  assert.deepEqual(p.phases, [{ cadence: 'EVERY_TWO_YEARS', cents: Math.round(145.29 * 24 * 0.9 * 100) }]);
});
test('plans outside the catalog stay monthly at their listed price, per seat', () => {
  const p = subscriptionPricing('ai_search', 'business', 35, 3, 'annual');
  assert.deepEqual(p.phases, [{ cadence: 'MONTHLY', cents: 10500 }]);
  assert.equal(subscriptionPricing('video_studio', 'pro', 19, 1, 'annual').cycle, 'monthly');
});
test('an unknown cycle falls back to monthly, never to a cheaper one', () => {
  assert.equal(subscriptionPricing('ai_search', 'search_pro', 17.4, 1, 'weekly').cycle, 'monthly');
});
test('production is sold one-time from the catalog; Custom and the monthly plan are not', () => {
  assert.deepEqual(productionItem('owner_spotlight_basic'), { id: 'owner_spotlight_basic', name: 'Production: Owner Spotlight Basic', cents: 149500, interval: null });
  assert.equal(productionItem('social_clip_5').cents, 150000);
  assert.equal(productionItem('production_custom'), null);
  assert.equal(productionItem('monthly_content_plan'), null);
  assert.deepEqual(catalogItems({ plan_id: 'pro_ad_premium' }).map(i => i.cents), [595000]);
  assert.throws(() => catalogItems({ plan_id: 'social_clip', add_on_ids: ['seo'] }), /on its own/);
  assert.equal(catalogItems({ plan_id: 'starter' })[0].cents, 99900);
});
