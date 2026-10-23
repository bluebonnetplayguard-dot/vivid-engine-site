import { useState } from 'react';
import { Link, NavLink } from 'react-router';
import Logo from './Logo';
import { site } from '../site';

const links = [
  { to: '/services/web-design', label: 'Web Design' },
  { to: '/services/local-seo', label: 'Local SEO' },
  { to: '/areas/beaumont-tx', label: 'Beaumont' },
  { to: '/areas/lake-charles-la', label: 'Lake Charles' },
  { to: '/about', label: 'About' },
];

export default function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="header">
      <div className="container header-inner">
        <Link to="/" className="brand" onClick={() => setOpen(false)}>
          <Logo />
          <span>{site.shortName}</span>
        </Link>
        <button
          className="menu-toggle"
          aria-expanded={open}
          aria-controls="site-nav"
          onClick={() => setOpen((o) => !o)}
        >
          Menu
        </button>
        <nav id="site-nav" className={open ? 'nav open' : 'nav'} aria-label="Main">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} onClick={() => setOpen(false)}>
              {l.label}
            </NavLink>
          ))}
          <Link to="/contact" className="btn btn-small" onClick={() => setOpen(false)}>
            Free review
          </Link>
        </nav>
      </div>
    </header>
  );
}
