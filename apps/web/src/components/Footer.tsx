import { Link } from 'react-router';
import { areas, services } from '../content';
import { site } from '../site';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div>
          <p className="footer-brand">{site.name}</p>
          <p>{site.tagline}.</p>
          {site.phone && <p><a href={`tel:${site.phone.replace(/[^\d+]/g, '')}`}>{site.phone}</a></p>}
          {site.email && <p><a href={`mailto:${site.email}`}>{site.email}</a></p>}
        </div>
        <div>
          <p className="footer-heading">Services</p>
          {services.map((s) => (
            <p key={s.slug}><Link to={`/services/${s.slug}`}>{s.name}</Link></p>
          ))}
        </div>
        <div>
          <p className="footer-heading">Areas served</p>
          {areas.map((a) => (
            <p key={a.slug}><Link to={`/areas/${a.slug}`}>{a.city}, {a.state}</Link></p>
          ))}
        </div>
      </div>
      <div className="container footer-legal">© {new Date().getFullYear()} {site.name}</div>
    </footer>
  );
}
