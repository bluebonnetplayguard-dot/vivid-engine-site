import SEO from '@/components/seo/SEO';
import RegionalNav from '@/components/regional/RegionalNav';
import RegionalHero from '@/components/regional/RegionalHero';
import RegionalLocal from '@/components/regional/RegionalLocal';
import RegionalSections from '@/components/regional/RegionalSections';
import RegionalClosing from '@/components/regional/RegionalClosing';
import RegionalFooter from '@/components/regional/RegionalFooter';
import { regionalSchema } from '@/data/regional/shared';
import '@/components/engine/engine.css';
import '@/components/regional/regional.css';

export default function RegionalPage({ page }) {
  return <div className="engine-site regional-site">
    <SEO path={page.path} title={page.title} description={page.description} ogTitle={page.ogTitle} ogDescription={page.ogDescription} schema={regionalSchema(page)} />
    <RegionalNav />
    <main><RegionalHero page={page} />{page.local && <RegionalLocal local={page.local} />}<RegionalSections sections={page.sections} /><RegionalClosing page={page} /></main>
    <RegionalFooter />
  </div>;
}