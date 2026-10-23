// Drop-in SEO component for a React/Vite app (no extra packages needed).
// Usage: <SEO path="/" />  at the top of each page component.
import { useEffect } from 'react';
import { SITE, localBusinessLd } from '@/data/seoSite';
import { resolveMeta } from '@/components/seo/resolveMeta';

function upsert(selector, create, attrs) {
  let el = document.head.querySelector(selector);
  if (!el) { el = document.createElement(create); document.head.appendChild(el); }
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}
const meta = (name, content) => upsert(`meta[name="${name}"]`, 'meta', { name, content });
const prop = (property, content) => upsert(`meta[property="${property}"]`, 'meta', { property, content });

function buildSchema(path, page, schema) {
  const url = SITE.url + path;
  const business = { ...localBusinessLd, slogan: SITE.tagline };
  const graph = [business, { '@type': 'WebSite', '@id': SITE.url + '/#website', url: SITE.url, name: SITE.name, publisher: { '@id': SITE.url + '/#business' } },
    { '@type': 'WebPage', url, name: page.title, description: page.description, isPartOf: { '@id': SITE.url + '/#website' } }];
  if (path !== '/' && !schema?.['@graph']?.some(item => item['@type'] === 'BreadcrumbList')) graph.push({ '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: SITE.url + '/' },
    { '@type': 'ListItem', position: 2, name: page.title.split('|')[0].trim(), item: url } ] });
  return { '@context': 'https://schema.org', '@graph': graph };
}

export default function SEO({ path = '/', title, description, ogTitle, ogDescription, noindex = false, schema }) {
  useEffect(() => {
    const m = resolveMeta({ path, title, description, ogTitle, ogDescription, noindex });
    const page = { title: m.title, description: m.description };
    const url = m.url;
    const socialTitle = m.ogTitle;
    const socialDescription = m.ogDescription;
    document.title = page.title;
    document.documentElement.lang = document.documentElement.lang || 'en';
    meta('description', page.description);
    meta('robots', m.robots);
    meta('theme-color', SITE.themeColor);
    meta('geo.region', 'US-TX');
    meta('twitter:card', 'summary_large_image');
    meta('twitter:title', socialTitle);
    meta('twitter:description', socialDescription);
    meta('twitter:image', SITE.url + SITE.ogImage);
    prop('og:type', 'website'); prop('og:site_name', SITE.name); prop('og:locale', SITE.locale);
    prop('og:title', socialTitle); prop('og:description', socialDescription);
    prop('og:url', url); prop('og:image', SITE.url + SITE.ogImage);
    upsert('link[rel="canonical"]', 'link', { rel: 'canonical', href: url });
    const ld = upsert('script#ld-json', 'script', { id: 'ld-json', type: 'application/ld+json' });
    ld.textContent = JSON.stringify(buildSchema(path, page, schema));
    if (schema) {
      const extra = upsert('script#ld-json-page', 'script', { id: 'ld-json-page', type: 'application/ld+json' });
      extra.textContent = JSON.stringify(schema);
    } else {
      document.getElementById('ld-json-page')?.remove();
    }
  }, [path, title, description, ogTitle, ogDescription, noindex, schema]);
  return null;
}