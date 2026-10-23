import { Link } from "react-router-dom";
import { Check, Globe, Shield, RefreshCw, Mail } from "lucide-react";
import Navbar from "@/components/marketing/Navbar";
import Footer from "@/components/marketing/Footer";
import { PageMeta, PAGE_META } from '@/components/SeoSchema';

const INCLUDED = [
  "Domain registration and renewal handled for you",
  "DNS management and configuration",
  "SSL certificate setup and renewal",
  "Connection to your website or hosting",
  "Email forwarding setup",
  "No long-term commitment — cancel anytime",
];

const ICONS = [
  { icon: Globe, title: "Professional Domain", desc: "Get a custom domain that matches your business name." },
  { icon: Shield, title: "SSL Included", desc: "HTTPS encryption keeps your site secure and trusted." },
  { icon: RefreshCw, title: "Auto-Renewal", desc: "We handle renewals so your domain never expires." },
  { icon: Mail, title: "Email Forwarding", desc: "Forward your domain email to your existing inbox." },
];

export default function DomainLeasing() {
  return (
    <div className="blueprint min-h-screen">
      <PageMeta {...PAGE_META.domainLeasing} />
      <Navbar />
      <main>
        <section className="mk-hero hero-section">
          <span className="mono" style={{ color: "var(--mk-primary)" }}>03 — DOMAIN LEASING</span>
          <h1 className="hero-title" style={{ marginTop: 12 }}>Domain Leasing</h1>
          <p>$9.95 per month per domain. We handle everything.</p>
        </section>

        <section style={{ maxWidth: 800, margin: "0 auto", padding: "0 1rem 4rem" }}>
          <div className="mk-features">
            {ICONS.map((c) => (
              <div key={c.title} className="glass-card">
                <c.icon size={28} style={{ color: "var(--mk-primary)", marginBottom: 12 }} />
                <h2>{c.title}</h2>
                <p>{c.desc}</p>
              </div>
            ))}
          </div>

          <div className="glass-card" style={{ marginTop: 32 }}>
            <h2 style={{ fontFamily: "Fraunces, serif", color: "var(--mk-title)", fontSize: "1.5rem", marginBottom: 16 }}>What&rsquo;s Included</h2>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {INCLUDED.map((f) => (
                <li key={f} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--mk-border)" }}>
                  <Check size={18} style={{ color: "var(--mk-primary)" }} />
                  <span style={{ color: "var(--mk-text)" }}>{f}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="glass-card" style={{ marginTop: 24 }}>
            <h2 style={{ fontFamily: "Fraunces, serif", color: "var(--mk-title)", fontSize: "1.5rem", marginBottom: 16 }}>Important Details</h2>
            <p style={{ color: "var(--mk-muted)", lineHeight: 1.7 }}>
              Domain leasing is $9.95 per month per domain. Leasing does not transfer ownership of the domain to you.
              Vivid Engine Solutions retains ownership of leased domains. If you cancel your lease, you may purchase
              the domain at fair market value or transfer to a domain you own. This keeps your upfront costs low while
              ensuring your domain is professionally managed.
            </p>
          </div>

          <div style={{ textAlign: "center", marginTop: 40 }}>
            <Link to="/contact" className="mk-btn mk-btn-lg">Get Started with Domain Leasing</Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}