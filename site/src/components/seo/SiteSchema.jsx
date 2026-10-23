import { SITE, localBusinessLd } from '@/data/seoSite';
import JsonLd from '@/components/seo/JsonLd';

export default function SiteSchema() {
  return <JsonLd id="ld-site" data={{
    '@context': 'https://schema.org',
    '@graph': [localBusinessLd, {
      '@type': 'WebSite', '@id': `${SITE.url}/#website`, url: SITE.url,
      name: SITE.name, publisher: { '@id': `${SITE.url}/#business` }, inLanguage: 'en-US',
    }],
  }} />;
}