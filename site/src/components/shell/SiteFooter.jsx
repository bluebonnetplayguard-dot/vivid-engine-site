import { Link, useLocation } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { FOOTER_COLUMNS } from '@/config/navigation';
import { BUSINESS, whatsappUrl } from '@/config/business';

export default function SiteFooter() {
  const { pathname } = useLocation();
  const link = l => (l.to.startsWith('/#')
    ? <a href={pathname === '/' ? l.to.slice(1) : l.to}>{l.label}</a>
    : <Link to={l.to}>{l.label}</Link>);
  return <footer className="vs-footer">
    <div className="vs-fcols">
      {FOOTER_COLUMNS.map(col => <div key={col.title}>
        <h2 className="engine-caps">{col.title}</h2>
        <ul>{col.links.map(l => <li key={l.label + l.to}>{link(l)}</li>)}</ul>
      </div>)}
    </div>
    <div className="vs-fbar">
      <span className="vs-badge"><MapPin size={15} aria-hidden="true" />Serving Greater Houston, SE Texas &amp; SW Louisiana</span>
      <span>WhatsApp: <a href={whatsappUrl()} target="_blank" rel="noopener noreferrer">{BUSINESS.whatsappDisplay}</a></span>
      <span>© {new Date().getFullYear()} {BUSINESS.brandName}</span>
      <span className="vs-legal">{BUSINESS.legalLine}</span>
    </div>
  </footer>;
}
