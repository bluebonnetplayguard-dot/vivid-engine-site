import { Link } from "react-router-dom";
import { useInShell } from '@/components/shell/ShellContext';
import { Image } from '@/components/ui/image';

const GROUPS = [
  {
    title: "Product",
    links: [
      { label: "Vivid Engine Solutions", to: "/" },
      { label: "Vivid Estimator", to: "/vivid-estimator" },
      { label: "Features", href: "#features" },
      { label: "Pricing", href: "#pricing" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", to: "/privacy" },
      { label: "Terms of Service", href: "#" },
      { label: "Delete account", to: "/delete-account" },
    ],
  },
  {
    title: "Support",
    links: [{ label: "Support", to: "/contact" }, { label: "Request Consultation", to: "/contact" }],
  },
];

function LandingFooterInner() {
  return (
    <footer className="border-t border-slate-800 bg-[#05080e] py-14 text-slate-400">
      <div className="mx-auto max-w-7xl px-5 lg:px-8">
        <div className="grid gap-10 md:grid-cols-4">
          <div>
            <Link to="/vivid-estimator" className="flex items-center gap-2 text-sm font-bold text-slate-100">
              <Image src="/logo-160.webp" alt="Vivid Engine Solutions logo" className="h-10 w-10 shrink-0 object-contain" fittingType="fit" />
              <span>Vivid Engine Solutions</span>
            </Link>
            <p className="mt-4 max-w-xs text-xs leading-5 text-slate-500">
              Powering better work in the field — from the shop to the jobsite.
            </p>
          </div>
          {GROUPS.map((g) => (
            <div key={g.title}>
              <p className="text-xs font-black tracking-[0.18em] text-slate-300">{g.title.toUpperCase()}</p>
              <ul className="mt-4 space-y-2.5">
                {g.links.map((l) => (
                  <li key={l.label}>
                    {l.to ? (
                      <Link to={l.to} className="text-xs text-slate-400 transition hover:text-white">
                        {l.label}
                      </Link>
                    ) : (
                      <a href={l.href} className="text-xs text-slate-400 transition hover:text-white">
                        {l.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 border-t border-slate-800 pt-6">
          <p className="text-xs text-slate-500">© {new Date().getFullYear()} Vivid Engine Solutions. All rights reserved.</p>
          <p className="mt-2 text-xs text-slate-600">
            AI-assisted features provide draft information and require qualified human review.
          </p>
        </div>
      </div>
    </footer>
  );
}

// Inside the shared shell (components/shell) the shell's own navigation is used instead.
export default function LandingFooter(props) {
  return useInShell() ? null : <LandingFooterInner {...props} />;
}
