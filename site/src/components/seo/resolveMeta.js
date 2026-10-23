// Turns a page's SEO props into the final tag values. Shared by the <SEO /> component
// (in the browser) and the build-time route manifest (read by the server), so the HTML
// the server sends and what React sets after loading are always identical.
import { SITE, PAGES } from '@/data/seoSite';

export const INDEX_ROBOTS = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
export const NOINDEX_ROBOTS = 'noindex, nofollow';

export function resolveMeta({ path = '/', title, description, ogTitle, ogDescription, noindex = false } = {}) {
  const base = PAGES[path] || PAGES['/'];
  const pageTitle = title || base.title;
  const pageDescription = description || base.description;
  return {
    path,
    url: SITE.url + path,
    title: pageTitle,
    description: pageDescription,
    ogTitle: ogTitle || (!title && base.ogTitle) || pageTitle,
    ogDescription: ogDescription || (!description && base.ogDescription) || pageDescription,
    image: SITE.url + SITE.ogImage,
    robots: noindex ? NOINDEX_ROBOTS : INDEX_ROBOTS,
    noindex: !!noindex,
  };
}
