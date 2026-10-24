// The pricing pages (/pricing and /pricing/<slug>): names, titles and descriptions, worked out from the catalog.
import { APP_BUILDER_PLANS, PRICING_AS_OF, SEARCH_PLANS, WEBSITE_PLANS, formatUsd, planPrice, type Cycle, type SelfServePlan } from './pricing-catalog.ts';

export interface PricingPageInfo { slug: string; label: string; labelEs: string; title: string; description: string }

export function asOfText() {
  const [y, m, d] = PRICING_AS_OF.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' });
}
const perMonth = (plan: SelfServePlan, cycle: Cycle) => `${formatUsd(planPrice(plan, cycle))}/mo`;

export const PRICING_PAGES: PricingPageInfo[] = [
  { slug: '', label: 'Overview', labelEs: 'Resumen', title: 'Pricing: AI Search, Websites, Apps & Video', description: `Prices for AI Search, websites, the app builder, video and done-for-you builds. Self-serve plans are 13% below the average price of similar apps as of ${asOfText()}.` },
  { slug: 'search', label: 'AI Search', labelEs: 'Búsqueda IA', title: 'AI Search Pricing: Free, Pro and Max', description: `Search Pro ${perMonth(SEARCH_PLANS[1], 'annual')} billed yearly or ${perMonth(SEARCH_PLANS[1], 'monthly')} monthly. Search Max ${perMonth(SEARCH_PLANS[2], 'annual')} billed yearly. Saved conversation history on every paid plan.` },
  { slug: 'websites', label: 'Websites', labelEs: 'Sitios web', title: 'Website Plan Pricing: Spark to Business Elite', description: `Website plans from ${perMonth(WEBSITE_PLANS[1], 'annual')} billed yearly, 13% below the average of Wix, Squarespace and Webflow as of ${asOfText()}.` },
  { slug: 'app-builder', label: 'App Builder', labelEs: 'Creador de apps', title: 'App Builder Pricing: Starter to Elite', description: `App Builder plans from ${perMonth(APP_BUILDER_PLANS[1], 'annual')} billed yearly with monthly credits, 13% below the average of Base44, Lovable, Bolt and Replit as of ${asOfText()}.` },
  { slug: 'production', label: 'Production', labelEs: 'Producción', title: 'Video Production Pricing', description: 'Human-made video production for local businesses: Owner Spotlight from $1,495, social clips from $350, and a monthly content plan.' },
  { slug: 'custom-builds', label: 'We Build It', labelEs: 'Lo hacemos por ti', title: 'We Build It For You: Website & App Pricing', description: 'Done-for-you websites from $999 and $1,500, custom apps from $3,500, each with 3 months of the matching plan included. Book a free consultation.' },
  { slug: 'bundles', label: 'Bundles', labelEs: 'Paquetes', title: 'Bundle Pricing: Launch, Builder and All-In-One', description: 'Save 15% with the Launch and Builder bundles, or 20% with All-In-One. Bundle savings are calculated from the plan prices.' },
  { slug: 'partners', label: 'Partners', labelEs: 'Socios', title: 'Local Partner Pricing: Bronze to Platinum', description: 'Get listed as a Vivid Engine Partner in Local Businesses. Bronze $129, Silver $234, Gold $399 and Platinum $749 a month, 10% off annual.' },
  { slug: 'compare', label: 'Compare', labelEs: 'Comparar', title: 'Compare Vivid Engine Plans and Prices', description: `Every Vivid Engine plan side by side with the average of similar apps it is priced against, as of ${asOfText()}, including saved conversation history.` },
];
