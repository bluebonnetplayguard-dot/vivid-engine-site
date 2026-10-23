import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';

export default function RegionalHero({ page }) {
  return <div className="hero"><div className="wrap">
    <nav className="crumbs" aria-label="Breadcrumb"><ol><li><Link to="/">Home</Link></li><li><Link to={page.parentPath}>{page.parent}</Link></li><li aria-current="page">{page.crumb}</li></ol></nav>
    <span className="caps">{page.eyebrow}</span>
    <h1>{page.heading} <span className="blue">{page.highlight}</span>{page.headingEnd}</h1>
    <p className="lede">{page.lede}</p>
    <div className="actions"><Link className="btn btn-glow" to="/#inquiry">{page.primary}</Link><Link className="btn btn-line" to={page.secondary[1]}>{page.secondary[0]}</Link></div>
    <p className="where"><MapPin aria-hidden="true" />{page.where}</p>
  </div></div>;
}