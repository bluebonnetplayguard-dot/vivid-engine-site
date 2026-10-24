// Vivid Engine pricing: the single source of truth for the site AND the API.
// backend/src/shared/pricing-catalog.ts must be an exact copy (backend `npm test` checks it).
//
// Rule: each self-serve price sits 13% below the AVERAGE price of similar apps' comparable plans (the benchmarks
// below), so the benchmark prices are the input and ours is computed. Never type a Vivid price by hand for those plans.
// Benchmarks were read from each vendor's own pricing or help pages on PRICING_AS_OF; confirm before publishing a comparison.
// A vendor is only in a basket when both its monthly and yearly prices are known (or it does not sell yearly).

export const PRICING_AS_OF = '2026-10-23';
export const UNDERCUT_PERCENT = 13;            // 0 = price at the average
export const UNDERCUT = UNDERCUT_PERCENT / 100;
export type Cycle = 'monthly' | 'annual';
export const DEFAULT_CYCLE: Cycle = 'annual';

const cents = (n: number) => Math.round(n * 100);
// 13% below, to the cent, in whole-cent arithmetic (so $55.50 -> $48.29 exactly, with no floating-point drift).
export const undercut = (benchmarkPrice: number) => Math.round(cents(benchmarkPrice) * (100 - UNDERCUT_PERCENT) / 100) / 100;

// Saved conversation history that comes with a plan. null retentionDays = kept until the person deletes it.
export interface HistoryPlan { retentionDays: number | null; fullTextSearch: boolean; bulkExport: boolean; memory: boolean }
export const HISTORY_12_MONTHS: HistoryPlan = { retentionDays: 365, fullTextSearch: false, bulkExport: false, memory: false };
export const HISTORY_UNLIMITED: HistoryPlan = { retentionDays: null, fullTextSearch: true, bulkExport: true, memory: true };
export const DOWNGRADE_READ_ONLY_DAYS = 30;

// One similar app's comparable plan. `annual` is its per-month price on yearly billing, or null when the vendor
// sells that plan monthly only (a yearly buyer then pays the monthly price too).
export interface Benchmark { app: string; plan: string; monthly: number; annual: number | null; url: string }
export interface SelfServePlan {
  id: string; name: string; tagline: string;
  benchmarks: Benchmark[];                     // empty = free tier, or a price we set ourselves
  setPrice?: { monthly: number; annual: number }; // only when there are no benchmarks and the plan isn't free
  history: HistoryPlan | null;
  features: string[];
  badge?: string;
  credits?: { monthly: number; annual: number } | null;   // App Builder
}

// ---------- benchmarks (as of PRICING_AS_OF) ----------
const PERPLEXITY = 'https://www.perplexity.ai/help-center/en/articles/11680686-perplexity-max';
const CHATGPT = 'https://help.openai.com/en/articles/6950777-what-is-chatgpt-plus';
const CHATGPT_PRO = 'https://help.openai.com/en/articles/9793128-about-chatgpt-pro-tiers';
const CLAUDE = 'https://claude.com/pricing';
const WIX = 'https://www.wix.com/plans';
const SQUARESPACE = 'https://www.squarespace.com/pricing';
const WEBFLOW = 'https://webflow.com/pricing';
const BASE44 = 'https://base44.com/pricing';
const LOVABLE = 'https://docs.lovable.dev/introduction/subscription-plans';
const BOLT = 'https://bolt.new/pricing';
const REPLIT = 'https://replit.com/pricing';
// Not in a basket (yearly price not published, or the page could not be read): Google AI Pro and Ultra, Webflow
// Ecommerce (monthly price not shown), Bolt Pro 200 (price not shown), GoDaddy and Shopify (pages unavailable).

export const SEARCH_PLANS: SelfServePlan[] = [
  { id: 'search_free', name: 'Search Free', tagline: 'Try AI search with sources.', benchmarks: [], history: null,
    features: ['5 questions a day', 'Live web search with numbered sources', 'Search, Build and Create modes', 'Nothing saved after the session'] },
  { id: 'search_pro', name: 'Search Pro', tagline: 'Three engines, saved history, no waiting.', badge: 'Most popular',
    benchmarks: [
      { app: 'Perplexity', plan: 'Pro', monthly: 20, annual: 17, url: 'https://www.perplexity.ai/help-center/en/articles/10352901-what-is-perplexity-pro' },
      { app: 'ChatGPT', plan: 'Plus', monthly: 20, annual: null, url: CHATGPT },
      { app: 'Claude', plan: 'Pro', monthly: 20, annual: 17, url: CLAUDE },
    ], history: HISTORY_12_MONTHS,
    features: ['300 questions a month', 'Perplexity, Claude and Gemini', 'Saved conversations for 12 months, pins and Spaces', 'Priority lane', 'Private mode'] },
  { id: 'search_max', name: 'Search Max', tagline: 'Our strongest models, every engine, unlimited history.',
    benchmarks: [
      { app: 'Perplexity', plan: 'Max', monthly: 200, annual: 166.67, url: PERPLEXITY },
      { app: 'ChatGPT', plan: 'Pro 200', monthly: 200, annual: null, url: CHATGPT_PRO },
      { app: 'Claude', plan: 'Max 20x', monthly: 200, annual: null, url: CLAUDE },
    ], history: HISTORY_UNLIMITED,
    features: ['1,000 questions a month', 'Claude Opus, Perplexity and Gemini on every answer', 'Deep Research', 'History kept until you delete it, full-text search, export and memory', 'Combined mode'] },
];

export const WEBSITE_PLANS: SelfServePlan[] = [
  { id: 'web_free', name: 'Free', tagline: 'A one-page site on a Vivid address.', benchmarks: [], history: null,
    features: ['1 page', 'vividengine.site address', 'Basic templates', 'Vivid Engine badge'] },
  { id: 'web_spark', name: 'Spark', tagline: 'Your own domain, no badge.', benchmarks: [
      { app: 'Wix', plan: 'Light', monthly: 24, annual: 17, url: WIX },
      { app: 'Squarespace', plan: 'Basic', monthly: 25, annual: 19, url: SQUARESPACE },
      { app: 'Webflow', plan: 'Basic', monthly: 25, annual: 15, url: WEBFLOW },
    ], history: HISTORY_12_MONTHS,
    features: ['Up to 5 pages', 'Connect your domain', 'No Vivid badge', 'Contact form', 'Saved AI conversations for 12 months'] },
  { id: 'web_core', name: 'Core', tagline: 'Blog, gallery and bookings.', badge: 'Most popular', benchmarks: [
      { app: 'Wix', plan: 'Core', monthly: 36, annual: 29, url: WIX },
      { app: 'Squarespace', plan: 'Core', monthly: 39, annual: 29, url: SQUARESPACE },
      { app: 'Webflow', plan: 'Premium', monthly: 39, annual: 25, url: WEBFLOW },
    ], history: HISTORY_12_MONTHS,
    features: ['Up to 15 pages', 'Blog and gallery', 'Online booking', 'Basic SEO tools', 'Saved AI conversations for 12 months'] },
  { id: 'web_business', name: 'Business', tagline: 'Sell online with Square.', benchmarks: [
      { app: 'Wix', plan: 'Business', monthly: 46, annual: 39, url: WIX },
      { app: 'Squarespace', plan: 'Plus', monthly: 65, annual: 49, url: SQUARESPACE },
    ], history: HISTORY_12_MONTHS,
    features: ['Unlimited pages', 'Online store with Square checkout', 'Reviews and social feeds', 'Advanced SEO', 'Saved AI conversations for 12 months'] },
  { id: 'web_business_elite', name: 'Business Elite', tagline: 'Everything, plus priority help.', benchmarks: [
      { app: 'Wix', plan: 'Business Elite', monthly: 172, annual: 159, url: WIX },
      { app: 'Squarespace', plan: 'Advanced', monthly: 139, annual: 99, url: SQUARESPACE },
    ], history: HISTORY_12_MONTHS,
    features: ['Everything in Business', 'Unlimited storage', 'Priority support on WhatsApp', 'Monthly site review', 'Saved AI conversations for 12 months'] },
];

export const APP_BUILDER_PLANS: SelfServePlan[] = [
  { id: 'app_free', name: 'Free', tagline: 'Try the builder.', benchmarks: [], history: null, credits: { monthly: 25, annual: 100 },
    features: ['25 credits a month (100 on annual)', '1 app', 'Vivid badge'] },
  { id: 'app_starter', name: 'Starter', tagline: 'Build and publish one app.', benchmarks: [
      { app: 'Base44', plan: 'Starter', monthly: 20, annual: 16, url: BASE44 },
      { app: 'Lovable', plan: 'Pro (100 credits)', monthly: 25, annual: 21, url: LOVABLE },
      { app: 'Bolt', plan: 'Pro', monthly: 25, annual: 18, url: BOLT },
      { app: 'Replit', plan: 'Core', monthly: 20, annual: 18, url: REPLIT },
    ], history: HISTORY_12_MONTHS, credits: { monthly: 100, annual: 2000 },
    features: ['100 credits a month (2,000 on annual)', 'Custom domain', 'No badge', 'Saved AI conversations for 12 months'] },
  { id: 'app_builder', name: 'Builder', tagline: 'More apps, more credits.', badge: 'Most popular', benchmarks: [
      { app: 'Base44', plan: 'Builder', monthly: 50, annual: 40, url: BASE44 },
      { app: 'Lovable', plan: 'Pro (200 credits)', monthly: 50, annual: 42, url: LOVABLE },
    ], history: HISTORY_12_MONTHS, credits: { monthly: 250, annual: 10000 },
    features: ['250 credits a month (10,000 on annual)', '5 apps', 'Database and logins', 'Saved AI conversations for 12 months'] },
  { id: 'app_pro', name: 'Pro', tagline: 'For agencies and power users.', benchmarks: [
      { app: 'Base44', plan: 'Pro', monthly: 100, annual: 80, url: BASE44 },
      { app: 'Lovable', plan: 'Pro (400 credits)', monthly: 100, annual: 84, url: LOVABLE },
      { app: 'Replit', plan: 'Pro', monthly: 100, annual: 90, url: REPLIT },
    ], history: HISTORY_12_MONTHS, credits: { monthly: 500, annual: 20000 },
    features: ['500 credits a month (20,000 on annual)', 'Unlimited apps', 'Team seats', 'Saved AI conversations for 12 months'] },
  { id: 'app_elite', name: 'Elite', tagline: 'Everything, at scale.', benchmarks: [
      { app: 'Base44', plan: 'Elite', monthly: 200, annual: 160, url: BASE44 },
      { app: 'Lovable', plan: 'Pro (800 credits)', monthly: 200, annual: 167, url: LOVABLE },
    ], history: HISTORY_12_MONTHS, credits: { monthly: 1200, annual: 50000 },
    features: ['1,200 credits a month (50,000 on annual)', 'Priority processing', 'Dedicated help on WhatsApp', 'Saved AI conversations for 12 months'] },
];

// Human-made production, one-time.
export interface ProductionItem { id: string; name: string; price: number | null; unit?: string; bundle?: { qty: number; price: number }; monthly?: boolean; detail: string }
export const PRODUCTION: ProductionItem[] = [
  { id: 'owner_spotlight_basic', name: 'Owner Spotlight Basic', price: 1495, detail: 'A short, polished video about you and your business.' },
  { id: 'production_standard', name: 'Standard', price: 2950, detail: 'A full promo with script, shoot and edit.' },
  { id: 'pro_ad_premium', name: 'Pro Ad Premium', price: 5950, detail: 'Multi-location shoot, motion graphics and ad cuts.' },
  { id: 'social_clip', name: 'Social Clip', price: 350, unit: 'each', bundle: { qty: 5, price: 1500 }, detail: 'Vertical clips for Reels, TikTok and Shorts.' },
  { id: 'monthly_content_plan', name: 'Monthly Content Plan', price: 1250, monthly: true, detail: 'Fresh clips, posts and edits every month.' },
  { id: 'production_custom', name: 'Custom', price: null, detail: 'Tell us what you need and we quote it.' },
];

// We Build It For You: one-time builds that include 3 months of the matching self-serve plan, plus the care plans.
export interface BuildPackage { id: string; name: string; price: number; startingFrom?: boolean; includesPlan: string | null; includedMonths: number; detail: string; monthly?: boolean }
export const BUILD_PACKAGES: BuildPackage[] = [
  { id: 'starter', name: 'Starter', price: 999, includesPlan: 'web_core', includedMonths: 3, detail: 'Up to 5 pages, custom mobile-first design, contact form, basic SEO, Google Business Profile setup.' },
  { id: 'launch', name: 'Launch', price: 1500, includesPlan: 'web_business', includedMonths: 3, detail: 'Up to 10 pages, blog or news page, photo gallery, inquiries by text and email.' },
  { id: 'full', name: 'Full Engine', price: 3500, startingFrom: true, includesPlan: 'app_pro', includedMonths: 3, detail: 'Custom web or Google Play app with a client portal and secure logins, quoted after a consultation.' },
  { id: 'basic', name: 'Basic Care', price: 49, monthly: true, includesPlan: null, includedMonths: 0, detail: 'Hosting, SSL, security updates, daily backups, uptime monitoring.' },
  { id: 'care', name: 'Turnkey Care', price: 99, monthly: true, includesPlan: null, includedMonths: 0, detail: 'Basic Care plus one domain, site assistant, up to one hour of edits a month, monthly report and priority support.' },
];

// Bundles: a discount on the sum of the plans inside. Savings are always computed, never typed.
export interface Bundle { id: string; name: string; plans: string[]; discount: number; history: HistoryPlan; tagline: string }
export const BUNDLES: Bundle[] = [
  { id: 'bundle_launch', name: 'Launch', plans: ['web_core', 'search_pro'], discount: 0.15, history: HISTORY_12_MONTHS, tagline: 'A real website plus AI search with history.' },
  { id: 'bundle_builder', name: 'Builder', plans: ['web_business', 'app_builder'], discount: 0.15, history: HISTORY_12_MONTHS, tagline: 'Sell online and build your own app.' },
  // All-In-One: confirm the plan mix. It is the only bundle with unlimited history.
  { id: 'all_in_one', name: 'All-In-One', plans: ['web_business', 'app_pro', 'search_max'], discount: 0.20, history: HISTORY_UNLIMITED, tagline: 'Website, app builder and Search Max together.' },
];

export const DISCOUNTS = {
  twoYearTerm: 0.10,          // 10% off a 2-year term
  firstMonth: 0.25,           // 25% off the first month (monthly billing)
  nonprofitVeteran: 0.15,     // 15% off for nonprofits and veteran-owned businesses
  referralCreditUsd: 10,      // credit per referred customer who pays
};

export interface PartnerTier { id: string; name: string; monthly: number; annualDiscount: number; listings: number; detail: string }
export const PARTNER_TIERS: PartnerTier[] = [
  { id: 'bronze', name: 'Bronze', monthly: 129, annualDiscount: 0.10, listings: 1, detail: 'One listing in Local Businesses.' },
  { id: 'silver', name: 'Silver', monthly: 234, annualDiscount: 0.10, listings: 3, detail: 'Three listings and a sponsored card.' },
  { id: 'gold', name: 'Gold', monthly: 399, annualDiscount: 0.10, listings: 10, detail: 'Ten listings, sponsored cards, monthly report.' },
  { id: 'platinum', name: 'Platinum', monthly: 749, annualDiscount: 0.10, listings: 25, detail: 'Everything, plus a dedicated partner contact.' },
];

// ---------- math (shared by the pricing pages and the API) ----------

export const ALL_SELF_SERVE: SelfServePlan[] = [...SEARCH_PLANS, ...WEBSITE_PLANS, ...APP_BUILDER_PLANS];
export const planById = (id: string) => ALL_SELF_SERVE.find(p => p.id === id) ?? null;

// Average price of the similar apps' plans for this cycle (whole cents), or null for plans with no benchmarks.
export function benchmarkAverage(plan: SelfServePlan, cycle: Cycle): number | null {
  if (!plan.benchmarks.length) return null;
  const total = plan.benchmarks.reduce((sum, b) => sum + cents(cycle === 'annual' ? (b.annual ?? b.monthly) : b.monthly), 0);
  return Math.round(total / plan.benchmarks.length) / 100;
}

// Price of a self-serve plan per month, for the given cycle (annual = per month, billed yearly).
export function planPrice(plan: SelfServePlan, cycle: Cycle): number {
  const avg = benchmarkAverage(plan, cycle);
  if (avg != null) return undercut(avg);
  if (plan.setPrice) return plan.setPrice[cycle];
  return 0;
}
export const planPriceCents = (plan: SelfServePlan, cycle: Cycle) => cents(planPrice(plan, cycle));
// What Square charges per billing period: monthly plans each month, annual plans once a year.
export const periodCharge = (plan: SelfServePlan, cycle: Cycle) => (cycle === 'annual' ? planPrice(plan, cycle) * 12 : planPrice(plan, cycle));
export const competitorPrice = benchmarkAverage;   // older name
export const savingsVsAverage = (plan: SelfServePlan, cycle: Cycle) => { const avg = benchmarkAverage(plan, cycle); return avg == null ? 0 : Math.round((avg - planPrice(plan, cycle)) * 100) / 100; };
export const savingsVsCompetitor = savingsVsAverage;   // older name
export const benchmarkApps = (plans: SelfServePlan[]) => [...new Set(plans.flatMap(p => p.benchmarks.map(b => b.app)))];

export function bundlePrice(bundle: Bundle, cycle: Cycle) {
  const parts = bundle.plans.map(id => planById(id)).filter((p): p is SelfServePlan => !!p);
  const full = parts.reduce((s, p) => s + planPrice(p, cycle), 0);
  const price = Math.round(full * (1 - bundle.discount) * 100) / 100;
  return { full: Math.round(full * 100) / 100, price, savings: Math.round((full - price) * 100) / 100, parts };
}
export const twoYearPrice = (monthlyPrice: number) => Math.round(monthlyPrice * (1 - DISCOUNTS.twoYearTerm) * 100) / 100;
export const firstMonthPrice = (monthlyPrice: number) => Math.round(monthlyPrice * (1 - DISCOUNTS.firstMonth) * 100) / 100;
export const nonprofitPrice = (price: number) => Math.round(price * (1 - DISCOUNTS.nonprofitVeteran) * 100) / 100;
export const partnerPrice = (tier: PartnerTier, cycle: Cycle) => (cycle === 'annual' ? Math.round(tier.monthly * (1 - tier.annualDiscount) * 100) / 100 : tier.monthly);

// Saved-history entitlement for a plan or bundle id (null = none).
export function historyForPlan(id: string | null | undefined): HistoryPlan | null {
  if (!id) return null;
  return planById(id)?.history ?? BUNDLES.find(b => b.id === id)?.history ?? LEGACY_HISTORY[id] ?? null;
}
// Plans sold before this catalog (kept for existing subscribers; not shown on pricing pages).
export const LEGACY_HISTORY: Record<string, HistoryPlan> = {
  starter: HISTORY_12_MONTHS, plus: HISTORY_12_MONTHS, pro: HISTORY_12_MONTHS, business: HISTORY_12_MONTHS, max: HISTORY_UNLIMITED,
};

// Every comparison table carries this row.
export const HISTORY_ROW_LABEL = 'Saved conversation history';
export const historyLabel = (h: HistoryPlan | null) => (!h ? 'Not saved' : h.retentionDays == null ? 'Kept until you delete it' : '12 months');

export const formatUsd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
