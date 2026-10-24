import { Link, Navigate, useParams } from 'react-router-dom';
import SEO from '@/components/seo/SEO';
import { seoProps } from '@/seo/pageSeo';
import { LEGAL, legalBySlug } from '@/config/legal';
import { BUSINESS } from '@/config/business';
import '@/components/content/content.css';

const date = d => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export function LegalHub() {
  return <main className="ct-wrap">
    <SEO {...seoProps('/legal')} />
    <header className="ct-head"><h1>Legal</h1><p>{BUSINESS.legalLine}</p></header>
    <ul className="ct-items">{LEGAL.map(d => <li key={d.slug}><Link to={`/legal/${d.slug}`}><b>{d.title}</b><span>{d.description}</span></Link></li>)}</ul>
  </main>;
}

export default function LegalPage() {
  const { slug } = useParams();
  const doc = legalBySlug(slug);
  if (!doc) return <Navigate to="/legal" replace />;
  return <main className="ct-wrap ct-legal">
    <SEO {...seoProps(`/legal/${doc.slug}`)} />
    <header className="ct-head"><h1>{doc.title}</h1><p>Last updated {date(doc.updated)}</p>
      {!doc.reviewed && <p className="ct-review" role="note">Draft for legal review. This page is a plain-language placeholder until our attorney approves it.</p>}
      <p>{doc.intro}</p></header>
    {doc.sections.map(s => <section key={s.h2} className="ct-section"><h2>{s.h2}</h2>
      {s.paragraphs?.map(p => <p key={p.slice(0, 30)}>{p}</p>)}
      {s.bullets && <ul className="ct-bullets">{s.bullets.map(b => <li key={b.slice(0, 30)}>{b}</li>)}</ul>}
    </section>)}
    <p className="ct-fine">{BUSINESS.legalLine} <Link className="ct-link" to="/legal">All legal pages</Link></p>
  </main>;
}
