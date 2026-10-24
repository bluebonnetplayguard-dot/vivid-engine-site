import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Image } from '@/components/ui/image';
const links = [['Services', 'services'], ['Portfolio', 'work'], ['AI Assistant', 'assistant'], ['Pricing', 'pricing'], ['Contact', 'inquiry']];
export default function HomeNavbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 40);
    update(); window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  return <header className={`site-header safe-top ${scrolled ? 'scrolled' : ''}`}>
    <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4">
      <a href="#top" className="flex min-w-0 items-center gap-2 font-semibold">
        <Image src="/logo-160.webp" alt="Vivid Engine Solutions logo" className="h-9 w-9 shrink-0" fittingType="fit" />
        <span className="text-sm sm:text-base">Vivid Engine</span>
      </a>
      <nav aria-label="Homepage navigation" className="hidden items-center gap-4 text-sm lg:flex">
        {links.map(([label, id]) => <a key={id} href={`#${id}`}>{label}</a>)}
        <Link to="/login">Client Login</Link>
      </nav>
      <a href="/quote" className="mk-btn hidden shrink-0 sm:inline-flex">Get a quote</a>
      <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border lg:hidden" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="home-navlinks" onClick={() => setOpen(value => !value)}>{open ? <X size={22} /> : <Menu size={22} />}</button>
    </div>
    {open && <nav id="home-navlinks" aria-label="Mobile homepage navigation" className="flex flex-col gap-4 border-t border-border bg-background px-5 py-5 lg:hidden">
      {links.map(([label, id]) => <a key={id} href={`#${id}`} onClick={() => setOpen(false)}>{label}</a>)}
      <Link to="/login">Client Login</Link><a href="/quote" className="mk-btn text-center" onClick={() => setOpen(false)}>Get a quote</a>
    </nav>}
  </header>;
}