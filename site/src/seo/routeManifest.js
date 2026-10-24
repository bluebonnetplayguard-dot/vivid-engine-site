// Build-time list of every URL and the tags the server should send for it.
// Built after `vite build` by scripts/build-seo-manifest.mjs into dist/seo-routes.json, which the API reads to put
// each page's own title, description, canonical, social tags, robots rule and readable text into the HTML before
// any JavaScript runs. The same script writes a static HTML file per page, sitemap.xml and robots.txt.
//
// Which URLs exist comes from config/navigation.ts. Tags come from seo/pageSeo.js (pages built from config) or,
// for older pages that set their own tags, from data/seoSite.js below. Every entry mirrors what the page passes to <SEO />.
import * as seoSite from '@/data/seoSite';
import { PAGE_META, PAGE_SEO, serviceAreaMeta } from '@/data/seoSite';
import { SERVICE_AREAS } from '@/data/serviceAreas';
import { resolveMeta } from '@/components/seo/resolveMeta';
import beaumont from '@/data/regional/beaumont';
import lakeCharles from '@/data/regional/lakeCharles';
import appDevelopment from '@/data/regional/appDevelopment';
import { REDIRECTS, noindexPatterns, sitemapPaths, robotsTxt } from '@/config/navigation';
import { AREAS } from '@/config/areas';
import { SERVICES } from '@/config/services';
import { PRICING_PAGES } from '@/config/pricing-pages';
import { LEGAL } from '@/config/legal';
import { seoFor } from './pageSeo';
import { regionalContent, basicContent, siteContact } from './pageContent';

const regional = page => ({ path: page.path, title: page.title, description: page.description, ogTitle: page.ogTitle, ogDescription: page.ogDescription });

// Pages that still set their own tags.
const LEGACY = {
  '/': { path: '/' },
  '/about': PAGE_META.about,
  '/vivid-estimator': PAGE_META.estimator,
  '/support': PAGE_META.support,
  '/maintenance': PAGE_META.maintenance,
  '/domain-leasing': PAGE_META.domainLeasing,
  '/faq': PAGE_META.faq,
  '/video': PAGE_META.videoStudio,
  '/video/pricing': PAGE_META.videoPricing,
  '/services/custom-app-development': regional(appDevelopment),
  '/locations/beaumont-web-design': regional(beaumont),
  '/locations/lake-charles-app-development': regional(lakeCharles),
};

// Public pages that are reachable but kept out of search.
const NOINDEX_PUBLIC = [
  PAGE_SEO.login, PAGE_SEO.deleteAccount,
  { ...PAGE_META.register, noindex: true }, { ...PAGE_META.forgotPassword, noindex: true }, { ...PAGE_META.resetPassword, noindex: true },
  { path: '/search', title: 'Vivid AI Search', description: 'Ask anything and get answers with numbered sources from Perplexity, Claude and Gemini.', noindex: true },
  { path: '/checkout', title: 'Checkout', description: 'Secure checkout for Vivid Engine Solutions, processed by Square.', noindex: true },
];

// Every concrete page the config defines (dynamic paths enumerated), so nothing can be missed.
export function configuredPaths() {
  return [...new Set([
    ...sitemapPaths(),
    ...AREAS.map(a => `/areas/${a.slug}`),
    ...SERVICES.filter(s => s.ownPage).map(s => s.path),
    ...PRICING_PAGES.map(p => (p.slug ? `/pricing/${p.slug}` : '/pricing')),
    ...LEGAL.map(d => `/legal/${d.slug}`),
  ])].filter(p => !REDIRECTS[p]);
}

export function buildRouteManifest() {
  const pages = {};
  const add = (e, content) => {
    if (pages[e.path]) throw new Error(`Duplicate SEO entry for ${e.path}`);
    pages[e.path] = resolveMeta(e);
    if (content && !pages[e.path].noindex) pages[e.path].content = content;
  };
  for (const path of configuredPaths()) {
    const s = seoFor(path);
    if (s) { const { content, ...tags } = s; add(tags, content); continue; }
    if (LEGACY[path]) { add(LEGACY[path]); continue; }
    throw new Error(`SEO manifest: ${path} is in config/navigation.ts but has no SEO entry (add it to seo/pageSeo.js or LEGACY).`);
  }
  for (const e of NOINDEX_PUBLIC) if (!pages[e.path]) add(e);
  // The older single-town pages that remain (the nine main cities redirect to /areas).
  for (const a of SERVICE_AREAS) { const m = serviceAreaMeta(a); if (!REDIRECTS[m.path] && !pages[m.path]) add(m); }

  // Images the browser should start downloading immediately on the home page.
  pages['/'].preload = ['/logo-400.webp'];
  for (const d of [beaumont, lakeCharles, appDevelopment]) if (pages[d.path]) pages[d.path].content = regionalContent(d);
  for (const p of Object.values(pages)) if (!p.noindex && !p.content) p.content = basicContent(p);

  return {
    pages,
    site: siteContact(seoSite),
    privatePatterns: noindexPatterns(),
    redirects: REDIRECTS,
    robots: robotsTxt(seoSite.SITE.url),
    notFound: resolveMeta({ path: '/404', title: 'Page Not Found', description: 'The requested page could not be found on Vivid Engine Solutions. Return to the homepage to explore our services.', noindex: true }),
    privatePage: resolveMeta({ path: '/portal', title: 'Vivid Engine Solutions', description: 'Vivid Engine Solutions client and staff area.', noindex: true }),
  };
}
