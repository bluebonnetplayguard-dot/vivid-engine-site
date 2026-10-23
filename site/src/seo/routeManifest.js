// Build-time list of every URL and the tags the server should send for it.
// Built after `vite build` by scripts/build-seo-manifest.mjs into dist/seo-routes.json,
// which the API reads to put each page's own title, description, canonical, social
// tags and robots rule into the HTML before any JavaScript runs.
//
// Each entry mirrors exactly what the page component passes to <SEO /> / <PageMeta />.
import * as seoSite from '@/data/seoSite';
import { PAGE_META, PAGE_SEO, serviceAreaMeta } from '@/data/seoSite';
import { SERVICE_AREAS } from '@/data/serviceAreas';
import { resolveMeta } from '@/components/seo/resolveMeta';
import beaumont from '@/data/regional/beaumont';
import lakeCharles from '@/data/regional/lakeCharles';
import appDevelopment from '@/data/regional/appDevelopment';
import { regionalContent, basicContent, siteContact } from './pageContent';

const regional = page => ({ path: page.path, title: page.title, description: page.description, ogTitle: page.ogTitle, ogDescription: page.ogDescription });

// Signed-in or account areas: always served with noindex.
export const PRIVATE_PATTERNS = [
  '^/start$',
  '^/ai-search/account$',
  '^/video/account$',
  '^/video/edit/[^/]+$',
  '^/settings$',
  '^/portal(/(projects/[^/]+|domain|domain-status))?$',
  '^/admin(/(leads|quotes|estimator|invoices|costs|logo|pos|chat|marketing-drafts|pricing))?$',
];

export function buildRouteManifest() {
  const entries = [
    { path: '/' },                                   // Home: <SEO path="/" />
    PAGE_META.about, PAGE_META.contact, PAGE_META.estimator, PAGE_META.support, PAGE_META.privacy,
    PAGE_META.services, PAGE_META.maintenance, PAGE_META.domainLeasing, PAGE_META.faq, PAGE_META.serviceAreas,
    PAGE_SEO.pricing, PAGE_SEO.deleteAccount,
    PAGE_META.aiSearch, PAGE_META.aiSearchPricing,
    PAGE_META.videoStudio, PAGE_META.videoPricing,
    regional(beaumont), regional(lakeCharles), regional(appDevelopment),
    ...SERVICE_AREAS.map(serviceAreaMeta),
    // Account pages are public but kept out of search.
    PAGE_SEO.login,
    { ...PAGE_META.register, noindex: true },
    { ...PAGE_META.forgotPassword, noindex: true },
    { ...PAGE_META.resetPassword, noindex: true },
  ];
  const pages = {};
  for (const e of entries) {
    if (pages[e.path]) throw new Error(`Duplicate SEO entry for ${e.path}`);
    pages[e.path] = resolveMeta(e);
  }
  // Images the browser should start downloading immediately (the page's largest visible
  // element), instead of waiting for the app script to run. Keep in sync with EngineHero.jsx.
  pages['/'].preload = ['/hero-background.webp', '/logo-400.webp'];

  // Readable page text in the HTML (indexable pages only). Regional pages get their full
  // sections; other pages get their heading and description.
  for (const d of [beaumont, lakeCharles, appDevelopment]) if (pages[d.path]) pages[d.path].content = regionalContent(d);
  for (const p of Object.values(pages)) if (!p.noindex && !p.content) p.content = basicContent(p);

  return {
    pages,
    site: siteContact(seoSite),
    privatePatterns: PRIVATE_PATTERNS,
    notFound: resolveMeta({ path: '/404', title: 'Page Not Found', description: 'The requested page could not be found on Vivid Engine Solutions. Return to the homepage to explore our services.', noindex: true }),
    privatePage: resolveMeta({ path: '/portal', title: 'Vivid Engine Solutions', description: 'Vivid Engine Solutions client and staff area.', noindex: true }),
  };
}
