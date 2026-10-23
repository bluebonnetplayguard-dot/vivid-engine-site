import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Image } from '@/components/ui/image';

export default function RegionalNav() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { const close = event => { if (event.key === 'Escape') setOpen(false); }; document.addEventListener('keydown', close); return () => document.removeEventListener('keydown', close); }, []);
  return <header className="top"><div className="wrap"><nav aria-label="Main">
    <Link className="brand" to="/" aria-label="Vivid Engine Solutions home"><Image src="/logo-160.webp" className="regional-logo" alt="" fittingType="fit" /><span className="word">Vivid Engine<small>Solutions</small></span></Link>
    <div className={open ? 'navlinks open' : 'navlinks'} id="regional-navigation">
      {[['/#services', 'Services'], ['/services/custom-app-development', 'App Development'], ['/locations/beaumont-web-design', 'Beaumont'], ['/locations/lake-charles-app-development', 'Lake Charles'], ['/#pricing', 'Pricing'], ['/#pay', 'Pay']].map(([url, label]) => <Link key={url} to={url} aria-current={pathname === url ? 'page' : undefined} onClick={() => setOpen(false)}>{label}</Link>)}
    </div>
    <Link className="btn btn-glow nav-cta" to="/#inquiry">Get a quote</Link>
    <button className="navmobile" type="button" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="regional-navigation" onClick={() => setOpen(!open)}>{open ? <X size={20} /> : <Menu size={20} />}</button>
  </nav></div></header>;
}