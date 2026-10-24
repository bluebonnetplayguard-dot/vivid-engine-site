import { Link, useLocation } from 'react-router-dom';
import SEO from '@/components/seo/SEO';
import { seoProps } from '@/seo/pageSeo';
import { pageCopy } from '@/config/pages';
import { BUSINESS } from '@/config/business';
import { WhatsAppLink } from '@/components/shell/WhatsAppButton';
import PageNotFound from '@/lib/PageNotFound';
import '@/components/content/content.css';

// A content page from config/pages.ts: one H1, an intro, sections and calls to action. `children` adds a
// page-specific block (a form, a pricing grid) after the intro.
export default function InfoPage({ path: pathProp, children, after }) {
  const { pathname } = useLocation();
  const path = pathProp || pathname.replace(/\/$/, '') || '/';
  const copy = pageCopy(path);
  if (!copy) return <PageNotFound />;
  return <main className="ct-wrap">
    <SEO {...seoProps(path)} />
    <header className="ct-head">
      <h1>{copy.h1}</h1>
      <p>{copy.intro}</p>
      {copy.ctas?.length > 0 && <div className="ct-ctas">{copy.ctas.map(c => <Link key={c.to + c.label} className={`engine-button ${c.primary ? 'engine-primary' : 'engine-outline'}`} to={c.to}>{c.label}</Link>)}</div>}
    </header>
    {children}
    {copy.sections.map(s => <section key={s.h2} className="ct-section" aria-labelledby={`h-${s.h2.replace(/\W+/g, '-')}`}>
      <h2 id={`h-${s.h2.replace(/\W+/g, '-')}`}>{s.h2}</h2>
      {s.text && <p>{s.text}</p>}
      {s.items?.length > 0 && <ul className="ct-items">{s.items.map(i => <li key={i.title}>{i.to
        ? <Link to={i.to}><b>{i.title}</b>{i.text && <span>{i.text}</span>}</Link>
        : <div><b>{i.title}</b>{i.text && <span>{i.text}</span>}</div>}</li>)}</ul>}
    </section>)}
    {after}
    <p className="ct-wa">Questions? <WhatsAppLink placement={`page${path.replace(/\//g, '-')}`} message={`Hi Vivid Engine, I have a question about ${copy.h1}: `} /></p>
  </main>;
}
