import { useState, useEffect } from "react";
import { useInShell } from '@/components/shell/ShellContext';
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Image } from '@/components/ui/image';

function NavbarInner() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const links = [
    { label: "Services", to: "/services" },
    { label: "Pricing", to: "/pricing" },
    { label: "AI Search", to: "/ai-search" },
    { label: "Video Studio", to: "/video" },
    { label: "About", to: "/about" },
    { label: "Service Areas", to: "/service-areas" },
    { label: "FAQ", to: "/faq" },
    { label: "Contact", to: "/contact" },
  ];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`site-header safe-top ${scrolled ? "scrolled" : ""}`}>
      <div className="mk-bar">
        <Link to="/" className="mk-logo flex min-w-0 items-center gap-2">
          <Image src="/logo-160.webp" alt="Vivid Engine Solutions logo" className="h-10 w-10 shrink-0 object-contain" fittingType="fit" />
          <span>Vivid Engine</span>
        </Link>
        <div className="mk-nav">
          {links.map((l) => l.to ? <Link key={l.to} to={l.to}>{l.label}</Link> : <a key={l.href} href={l.href}>{l.label}</a>)}
          <Link to="/login" style={{ fontSize: "0.85rem", color: "var(--mk-muted)" }}>Client Login</Link>
          <Link to="/contact" className="mk-btn">Free Consultation</Link>
        </div>
        <button className="mk-mobile-btn shrink-0" aria-label="Menu" onClick={() => setOpen(!open)}>
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {open && (
        <div className="mk-mobile-panel">
          {links.map((l) => l.to ? <Link key={l.to} to={l.to} onClick={() => setOpen(false)}>{l.label}</Link> : <a key={l.href} href={l.href} onClick={() => setOpen(false)}>{l.label}</a>)}
          <Link to="/login" onClick={() => setOpen(false)} style={{ color: "var(--mk-muted)" }}>Client Login</Link>
          <Link to="/contact" onClick={() => setOpen(false)} className="mk-btn" style={{ textAlign: "center" }}>Free Consultation</Link>
        </div>
      )}
    </header>
  );
}

// Inside the shared shell (components/shell) the shell's own navigation is used instead.
export default function Navbar(props) {
  return useInShell() ? null : <NavbarInner {...props} />;
}
