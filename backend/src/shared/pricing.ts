// Server-only authoritative cents (ported from base44/shared/pricing.ts).
// Mirror src/config/pricing.js; never accept amounts from checkout callers.
import { PRODUCTION } from './pricing-catalog';

export interface PlanPrice { name: string; billing: 'one_time' | 'monthly'; once: number | null; monthly: number | null; yearly: number | null; startingCents?: number; quoteRequired?: boolean }
export interface AddOnPrice { name: string; cents: number | null; startingCents?: number; percentage?: number; billing: 'one_time' | 'monthly'; includedIn: string[] }

export const PLAN_PRICES: Record<string, PlanPrice> = {
  starter: { name: 'Starter', billing: 'one_time', once: 99900, monthly: null, yearly: null },
  launch: { name: 'Launch', billing: 'one_time', once: 150000, monthly: null, yearly: null },
  full: { name: 'Full Engine', billing: 'one_time', once: null, monthly: null, yearly: null, startingCents: 350000, quoteRequired: true },
  basic: { name: 'Basic Care', billing: 'monthly', once: null, monthly: 4900, yearly: 58800 },
  care: { name: 'Turnkey Care', billing: 'monthly', once: null, monthly: 9900, yearly: 118800 },
};

export const ADD_ON_PRICES: Record<string, AddOnPrice> = {
  domain: { name: 'Domain leasing', cents: 995, billing: 'monthly', includedIn: ['care'] },
  email: { name: 'Business email (per user)', cents: 600, billing: 'monthly', includedIn: [] },
  pages: { name: 'Extra page (each)', cents: 15000, billing: 'one_time', includedIn: [] },
  copy: { name: 'Copywriting (per page)', cents: 9900, billing: 'one_time', includedIn: [] },
  brand: { name: 'Logo & brand kit', cents: 29900, billing: 'one_time', includedIn: [] },
  booking: { name: 'Online booking + Google Calendar sync', cents: 29900, billing: 'one_time', includedIn: [] },
  store: { name: 'Online payments / small store', cents: null, startingCents: 49900, billing: 'one_time', includedIn: [] },
  pos: { name: 'Custom POS (Square)', cents: null, startingCents: 150000, billing: 'one_time', includedIn: [] },
  crm: { name: 'Custom CRM', cents: null, startingCents: 250000, billing: 'one_time', includedIn: [] },
  app: { name: 'Installable app + Google Play listing', cents: null, startingCents: 150000, billing: 'one_time', includedIn: [] },
  'ai-chat': { name: 'Site assistant chat', cents: 2900, billing: 'monthly', includedIn: ['care'] },
  seo: { name: 'Local SEO growth', cents: 24900, billing: 'monthly', includedIn: [] },
  ads: { name: 'Google Ads management (ad spend separate)', cents: 29900, billing: 'monthly', includedIn: [] },
  rush: { name: 'Rush delivery (+25% of approved project quote)', cents: null, percentage: 25, billing: 'one_time', includedIn: [] },
};

export const CARD_FEE_RATE = 0.035;

// Human-made production (one-time) comes from the pricing catalog, never typed here. The 5-clip pack is 'social_clip_5'.
export function productionItem(id: unknown): CatalogItem | null {
  if (typeof id !== 'string') return null;
  if (id === 'social_clip_5') { const clip = PRODUCTION.find(p => p.id === 'social_clip'); return clip?.bundle ? { id, name: `${clip.name} × ${clip.bundle.qty}`, cents: Math.round(clip.bundle.price * 100), interval: null } : null; }
  const p = PRODUCTION.find(x => x.id === id);
  if (!p || p.price == null || p.monthly) return null;     // Custom is quoted; the Monthly Content Plan is set up after a consultation
  return { id, name: `Production: ${p.name}`, cents: Math.round(p.price * 100), interval: null };
}

export interface CatalogItem { id: string; name: string; cents: number; interval: 'month' | 'year' | null }

const has = (o: object, k: unknown) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

export function catalogItems({ plan_id, billing_cycle = 'monthly', add_on_ids = [] }: { plan_id?: string; billing_cycle?: string; add_on_ids?: unknown }): CatalogItem[] {
  if (!['monthly', 'yearly'].includes(billing_cycle)) throw new Error('Choose monthly or yearly billing.');
  if (!Array.isArray(add_on_ids) || add_on_ids.length > 14 || new Set(add_on_ids).size !== add_on_ids.length) throw new Error('Invalid additional options.');
  const production = productionItem(plan_id);
  if (production) {
    if (Array.isArray(add_on_ids) && add_on_ids.length) throw new Error('Production is purchased on its own.');
    return [production];
  }
  const plan = has(PLAN_PRICES, plan_id) ? PLAN_PRICES[plan_id] : null;
  if (!plan && plan_id !== 'addons') throw new Error('Choose a valid plan.');
  if (plan?.quoteRequired) throw new Error(`${plan.name} requires a manually approved quote.`);
  const items: CatalogItem[] = plan
    ? [{ id: plan_id, name: plan.name, cents: plan.once ?? plan[billing_cycle as 'monthly' | 'yearly'], interval: plan.billing === 'one_time' ? null : billing_cycle === 'yearly' ? 'year' : 'month' }]
    : [];
  for (const id of add_on_ids) {
    const addon = has(ADD_ON_PRICES, id) ? ADD_ON_PRICES[id] : null;
    if (!addon) throw new Error('Unknown additional option.');
    if (addon.includedIn.includes(plan_id)) continue; // Never charge twice for included options.
    if (addon.cents === null) throw new Error(`${addon.name} requires a manually approved quote.`);
    items.push({ id, name: addon.name, cents: addon.cents, interval: addon.billing === 'monthly' ? 'month' : null });
  }
  if (!items.length) throw new Error('Choose at least one priced option.');
  if (plan?.billing === 'one_time' && items.some(item => item.interval)) throw new Error('Website builds are one-time payments. Purchase monthly care and recurring options separately.');
  if (new Set(items.filter(item => item.interval).map(item => item.interval)).size > 1) throw new Error('Monthly additional options are purchased separately from yearly plans using Add-ons only.');
  return items;
}
