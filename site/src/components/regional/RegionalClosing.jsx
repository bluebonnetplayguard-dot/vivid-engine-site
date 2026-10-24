import { Link } from 'react-router-dom';
import { REGIONAL_LINKS } from '@/data/regional/shared';

export default function RegionalClosing({ page }) {
  return <>
    {page.showAreas && <section><div className="wrap grid-2">{REGIONAL_LINKS.slice(0, 2).map(area => <Link className="card area-card" to={area.path} key={area.path}><span className="caps">{area.region}</span><h3>{area.title}</h3><p>{area.description}</p><span className="area-link">{area.label} →</span></Link>)}</div></section>}
    <section className="band"><div className="wrap faq"><div className="head"><span className="caps">Questions</span><h2>{page.faqTitle}</h2></div>{page.faqs.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>
    <section className="cta-band"><div className="wrap"><span className="caps">Let's build your online presence</span><h2>{page.cta.title}</h2><p>{page.cta.description}</p><div className="actions"><Link className="btn btn-glow" to="/quote">Get a quote</Link><Link className="btn btn-line" to={page.cta.secondary[1]}>{page.cta.secondary[0]}</Link></div>
      {page.cta.related && <div className="related">{page.cta.related.map(key => { const item = REGIONAL_LINKS[key]; return <Link key={item.path} to={item.path}>{item.shortLabel} →</Link>; })}</div>}
    </div></section>
  </>;
}