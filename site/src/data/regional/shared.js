export const REGIONAL_LINKS = [
  { path: '/locations/beaumont-web-design', region: 'Southeast Texas', title: 'Beaumont, Port Arthur & Orange', description: 'In-person consultations across Jefferson, Orange and Hardin counties.', label: 'Beaumont web design & apps', shortLabel: 'Beaumont, TX' },
  { path: '/locations/lake-charles-app-development', region: 'Southwest Louisiana', title: 'Lake Charles, Sulphur & DeRidder', description: 'In-person consultations across Calcasieu, Cameron, Beauregard and Jefferson Davis parishes.', label: 'Lake Charles app development', shortLabel: 'Lake Charles, LA' },
  { path: '/services/custom-app-development', shortLabel: 'Custom app development' },
];

export function regionalSchema(page) {
  const base = 'https://vividenginesolutions.com';
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Service', '@id': `${base}${page.path}#service`, name: page.serviceName,
        serviceType: page.serviceTypes, description: page.serviceDescription || page.lede,
        provider: { '@id': `${base}/#business` },
        areaServed: page.schemaAreas.map(([type, name, container]) => ({ '@type': type, name, ...(container ? { containedInPlace: { '@type': 'AdministrativeArea', name: container } } : {}) })),
        ...(page.offers ? { offers: page.offers } : {}),
        ...(page.catalog ? { hasOfferCatalog: { '@type': 'OfferCatalog', name: 'App development services', itemListElement: page.catalog.map(name => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name } })) } } : {}),
      },
      { '@type': 'BreadcrumbList', itemListElement: [['Home', '/'], [page.parent, page.parentPath], [page.breadcrumbName || page.crumb, page.path]].map(([name, path], index) => ({ '@type': 'ListItem', position: index + 1, name, item: base + path })) },
      { '@type': 'FAQPage', mainEntity: page.faqs.map(([name, text]) => ({ '@type': 'Question', name, acceptedAnswer: { '@type': 'Answer', text } })) },
    ],
  };
}