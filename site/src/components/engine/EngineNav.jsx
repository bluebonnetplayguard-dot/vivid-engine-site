import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Image } from '@/components/ui/image';

export default function EngineNav() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { const close = e => { if (e.key === 'Escape') setOpen(false); }; document.addEventListener('keydown', close); return () => document.removeEventListener('keydown', close); }, []);
  const anchor = id => pathname === '/' ? `#${id}` : `/#${id}`;
  return <header className="engine-header"><div className="engine-wrap engine-nav">
    <Link className="engine-brand" to="/" aria-label="Vivid Engine Solutions home"><Image src="/logo-160.webp" className="engine-logo" alt="" fittingType="fit" /><span>Vivid Engine<small>Solutions</small></span></Link>
    <nav id="engine-navigation" aria-label="Main" className={open ? 'engine-links is-open' : 'engine-links'}>
      {['services', 'areas', 'work', 'process', 'pricing', 'pay', 'inquiry'].map((id, i) => <a key={id} href={anchor(id)} onClick={() => setOpen(false)}>{['Services', 'Areas', 'Portfolio', 'Process', 'Pricing', 'Pay', 'Contact'][i]}</a>)}
      <Link to="/ai-search" onClick={() => setOpen(false)}>AI Search</Link>
      <Link to="/video" onClick={() => setOpen(false)}>Video Studio</Link>
      <Link className="engine-login-link" to="/login?returnTo=%2Fportal" onClick={() => setOpen(false)}>Client Login</Link>
    </nav>
    <a className="engine-button engine-primary engine-nav-cta" href={anchor('inquiry')}>Get a quote</a>
    <button className="engine-menu" type="button" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="engine-navigation" onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
  </div></header>;
}