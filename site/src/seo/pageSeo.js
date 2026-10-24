// Title, description, robots and readable text for every page that is built from the config files.
// Used by the page components (<SEO {...seoFor(path)} />) AND by the build-time route manifest, so the HTML the
// server sends before JavaScript runs always matches what React shows.
import { BUSINESS } from '@/config/business';
import { PAGES } from '@/config/pages';
import { SERVICES, serviceBySlug } from '@/config/services';
import { AREAS, areaBySlug } from '@/config/areas';
import { PRICING_PAGES } from '@/config/pricing-pages';
import { LEGAL } from '@/config/legal';
import { LOCAL_CATEGORIES, PARTNER_DISCLOSURE } from '@/config/partners';
import { VIVID_TEMPLATES } from '@/config/templates';
import { APP_BUILDER_PLANS, BUILD_PACKAGES, BUNDLES, PARTNER_TIERS, PRODUCTION, SEARCH_PLANS, WEBSITE_PLANS, bundlePrice, formatUsd, partnerPrice, planPrice } from '@/config/pricing-catalog';
import { STEPS } from '@/components/engine/siteContent';

// Short brand suffix so titles stay readable in search results.
const t = s => `${s} | Vivid Engine`;
const items = list => list.map(x => ({ title: x.title, text: x.text }));

function infoPage(path) {
  const c = PAGES[path];
  if (!c) return null;
  const blocks = [{ paragraphs: [c.intro] }, ...c.sections.map(s => ({ h2: s.h2, paragraphs: s.text ? [s.text] : [], items: items(s.items || []) }))];
  if (path === '/templates') for (const g of [...new Set(VIVID_TEMPLATES.map(x => x.category))]) blocks.push({ h2: g, items: VIVID_TEMPLATES.filter(x => x.category === g).map(x => ({ title: x.title, text: x.prompt })) });
  if (path === '/process') blocks.push({ h2: 'Steps', items: STEPS.map(([title, text]) => ({ title, text })) });
  if (path === '/partners/tiers') blocks.push({ h2: 'Tiers', items: PARTNER_TIERS.map(x => ({ title: `${x.name}: ${formatUsd(x.monthly)}/mo`, text: `${x.detail} ${formatUsd(partnerPrice(x, 'annual'))}/mo billed yearly.` })) });
  return { path, title: t(c.title), description: c.description, noindex: !!c.noindex, content: { h1: c.h1, blocks } };
}

const planItems = plans => plans.map(p => ({ title: `${p.name}: ${formatUsd(planPrice(p, 'annual'))}/mo billed yearly, ${formatUsd(planPrice(p, 'monthly'))} monthly`, text: p.features.join('. ') }));
function pricingPage(slug) {
  const p = PRICING_PAGES.find(x => x.slug === slug);
  if (!p) return null;
  const path = slug ? `/pricing/${slug}` : '/pricing';
  const byslug = {
    search: [{ h2: 'AI Search plans', items: planItems(SEARCH_PLANS) }],
    websites: [{ h2: 'Website plans', items: planItems(WEBSITE_PLANS) }],
    'app-builder': [{ h2: 'App Builder plans', items: planItems(APP_BUILDER_PLANS) }],
    production: [{ h2: 'Production', items: PRODUCTION.map(x => ({ title: `${x.name}: ${x.price == null ? 'quoted' : formatUsd(x.price)}${x.monthly ? '/mo' : ''}`, text: x.detail })) }],
    'custom-builds': [{ h2: 'We Build It For You', items: BUILD_PACKAGES.map(x => ({ title: `${x.name}: ${formatUsd(x.price)}${x.monthly ? '/mo' : x.startingFrom ? ' and up' : ''}`, text: x.detail })) }],
    bundles: [{ h2: 'Bundles', items: BUNDLES.map(b => ({ title: `${b.name}: ${formatUsd(bundlePrice(b, 'annual').price)}/mo billed yearly`, text: b.tagline })) }],
    partners: [{ h2: 'Partner tiers', items: PARTNER_TIERS.map(x => ({ title: `${x.name}: ${formatUsd(x.monthly)}/mo`, text: x.detail })) }],
  };
  const blocks = [{ paragraphs: [p.description] }, ...(byslug[slug] || [])];
  return { path, title: t(p.title), description: p.description, noindex: false, content: { h1: slug ? p.title.split(':')[0] : 'Pricing', blocks } };
}

function servicePage(slug) {
  const s = serviceBySlug(slug);
  if (!s) return null;
  return { path: s.path, title: t(s.title), description: s.description, noindex: false,
    content: { h1: s.h1, blocks: [{ paragraphs: s.intro }, { h2: 'What you get', items: s.points.map(p => ({ title: p.title, text: p.text })) }, { h2: 'Pricing', paragraphs: [s.priceNote] }] } };
}

function areaPage(slug) {
  const a = areaBySlug(slug);
  if (!a) return null;
  return { path: `/areas/${a.slug}`, title: t(a.title), description: a.description, noindex: false,
    content: { h1: `${a.city}, ${a.state}: websites, apps and AI tools`, blocks: [{ h2: a.h2, paragraphs: a.intro }, { h2: `What ${a.city} businesses ask us for`, items: a.focus.map(f => ({ title: f })) }, { h2: 'Nearby', paragraphs: [`We also work with businesses in ${a.nearby.join(', ')}.`] }] } };
}

function legalPage(slug) {
  const d = LEGAL.find(x => x.slug === slug);
  if (!d) return null;
  return { path: `/legal/${d.slug}`, title: t(d.title), description: d.description, noindex: false,
    content: { h1: d.title, blocks: [{ paragraphs: [d.intro] }, ...d.sections.map(s => ({ h2: s.h2, paragraphs: s.paragraphs || [], items: (s.bullets || []).map(b => ({ title: b })) }))] } };
}

const HUBS = {
  '/services': () => ({ path: '/services', title: t('Services: Websites, Apps, POS, SEO, Video & AI'), description: 'Websites, apps, business tools, local search, video and AI help, from one local team. Free consultation and a written quote before work starts.', content: { h1: 'Services', blocks: [{ items: SERVICES.map(s => ({ title: s.name, text: s.short })) }] } }),
  '/areas': () => ({ path: '/areas', title: t('Service Areas: Houston, SE Texas & SW Louisiana'), description: `Websites, apps and AI tools for businesses in ${AREAS.map(a => a.city).join(', ')}. In-person consultations.`, content: { h1: 'Service areas', blocks: [{ items: AREAS.map(a => ({ title: `${a.city}, ${a.state}`, text: `${a.county} · ${a.region}` })) }] } }),
  '/local': () => ({ path: '/local', title: t('Local Businesses: Houston, SE Texas & SW Louisiana'), description: 'Find local businesses by city and category, and ask Vivid AI Search for recommendations with sources. Partner listings are always labeled.', content: { h1: 'Local businesses', blocks: [{ paragraphs: [PARTNER_DISCLOSURE] }, { items: LOCAL_CATEGORIES.map(c => ({ title: c.name })) }] } }),
  '/legal': () => ({ path: '/legal', title: t('Legal'), description: 'Terms, privacy, acceptable use, refunds, partner advertising, cookies, accessibility, copyright and the AI disclaimer.', content: { h1: 'Legal', blocks: [{ items: LEGAL.map(d => ({ title: d.title, text: d.description })) }] } }),
  '/contact': () => ({ path: '/contact', title: t('Contact Us: Web Design, Houston to Lafayette'), description: 'Talk to a web and app developer serving Greater Houston, SE Texas and SW Louisiana. Request a free, no-pressure quote, or message us on WhatsApp.', content: { h1: 'Contact Vivid Engine Solutions', blocks: [{ paragraphs: [`WhatsApp ${BUSINESS.whatsappDisplay}. We reply within one business day.`] }] } }),
};

// The SEO entry for a config-driven path, or null when the page defines its own (legacy pages).
export function seoFor(path) {
  if (HUBS[path]) return { noindex: false, ...HUBS[path]() };
  if (PAGES[path]) return infoPage(path);
  if (path === '/pricing') return pricingPage('');
  let m = /^\/pricing\/([^/]+)$/.exec(path); if (m) return pricingPage(m[1]);
  m = /^\/services\/([^/]+)$/.exec(path); if (m) return servicePage(m[1]);
  m = /^\/areas\/([^/]+)$/.exec(path); if (m) return areaPage(m[1]);
  m = /^\/legal\/([^/]+)$/.exec(path); if (m) return legalPage(m[1]);
  return null;
}
// Strip the readable content when passing to <SEO /> (it only takes tag fields).
export const seoProps = path => { const s = seoFor(path); if (!s) return null; const { content: _c, ...tags } = s; return tags; };
