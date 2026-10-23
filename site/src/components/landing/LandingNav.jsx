import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { Image } from '@/components/ui/image';

const LINKS = [
  { label: "Home", to: "/" },
  { label: "Vivid Estimator", to: "/vivid-estimator" },
  { label: "Features", href: "#features" },
  { label: "Industries", href: "#industries" },
  { label: "Pricing", href: "#pricing" },
  { label: "Start", to: "/start" },
  { label: "Support", to: "/contact" },
];

export default function LandingNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`blueprint fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
        scrolled ? "border-b border-slate-800 bg-[#070b12]/85 backdrop-blur-md" : "border-b border-transparent"
      }`}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-4 lg:px-8">
        <Link to="/vivid-estimator" className="flex min-w-0 items-center gap-2 font-body text-sm font-bold text-foreground">
          <Image src="/logo-160.webp" alt="Vivid Engine Solutions logo" className="h-10 w-10 shrink-0 object-contain" fittingType="fit" />
          <span>Vivid Engine Solutions</span>
        </Link>
        <div className="hidden items-center gap-5 xl:flex">
          {LINKS.map((l) =>
            l.to ? (
              <Link key={l.label} to={l.to} className="text-sm font-semibold text-slate-300 transition hover:text-white">
                {l.label}
              </Link>
            ) : (
              <a key={l.label} href={l.href} className="text-sm font-semibold text-slate-300 transition hover:text-white">
                {l.label}
              </a>
            )
          )}
          <Link
            to="/login"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-500 focus:outline-hidden focus:ring-4 focus:ring-blue-300"
          >
            Sign In
          </Link>
        </div>
        <button
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-700 text-slate-200 xl:hidden"
          aria-label="Menu"
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </nav>
      {open && (
        <div className="border-t border-slate-800 bg-[#070b12]/95 px-5 py-4 xl:hidden">
          <div className="flex flex-col gap-3">
            {LINKS.map((l) =>
              l.to ? (
                <Link key={l.label} to={l.to} onClick={() => setOpen(false)} className="text-sm font-semibold text-slate-300">
                  {l.label}
                </Link>
              ) : (
                <a key={l.label} href={l.href} onClick={() => setOpen(false)} className="text-sm font-semibold text-slate-300">
                  {l.label}
                </a>
              )
            )}
            <Link to="/login" onClick={() => setOpen(false)} className="mt-1 rounded-lg bg-blue-600 px-4 py-2 text-center text-sm font-bold text-white">
              Sign In
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}