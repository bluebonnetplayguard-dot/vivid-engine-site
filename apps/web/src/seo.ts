import type { Area, Service } from './content';
import { areas } from './content';
import { site } from './site';

const businessId = `${site.url}/#business`;

function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== '' && v !== undefined && !(Array.isArray(v) && v.length === 0)),
  ) as Partial<T>;
}

export function localBusinessSchema(area?: Area): object {
  const served = area ? [area] : areas;
  return compact({
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    '@id': businessId,
    name: site.name,
    url: site.url,
    description: site.description,
    email: site.email,
    telephone: site.phone,
    address: compact({
      '@type': 'PostalAddress',
      streetAddress: site.address.street,
      addressLocality: site.address.city,
      addressRegion: site.address.region,
      postalCode: site.address.postalCode,
      addressCountry: site.address.country,
    }),
    openingHours: site.hours,
    areaServed: served.map((a) => ({ '@type': 'City', name: `${a.city}, ${a.state}` })),
    sameAs: site.social,
  });
}

export function serviceSchema(service: Service): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.name,
    description: service.description,
    provider: { '@id': businessId },
    areaServed: areas.map((a) => ({ '@type': 'City', name: `${a.city}, ${a.state}` })),
  };
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Head tags for a prerendered page. */
export function headHtml(r: { path: string; title: string; description: string; schema?: object[]; hidden?: boolean }): string {
  const canonical = `${site.url}${r.path === '/' ? '/' : r.path}`;
  const tags = [
    `<title>${escapeHtml(r.title)}</title>`,
    `<meta name="description" content="${escapeHtml(r.description)}" />`,
    r.hidden ? '<meta name="robots" content="noindex" />' : `<link rel="canonical" href="${canonical}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeHtml(site.name)}" />`,
    `<meta property="og:title" content="${escapeHtml(r.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(r.description)}" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta name="twitter:card" content="summary" />`,
    ...(r.schema ?? []).map(
      (s) => `<script type="application/ld+json">${JSON.stringify(s).replace(/</g, '\\u003c')}</script>`,
    ),
  ];
  return tags.join('\n    ');
}
