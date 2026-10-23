import { Link } from "react-router-dom";
import { Monitor, RefreshCw, Wrench, Globe, Zap, CreditCard, Users, Calendar } from "lucide-react";
import Navbar from "@/components/marketing/Navbar";
import Footer from "@/components/marketing/Footer";
import { PageMeta, PAGE_META } from '@/components/SeoSchema';

const SERVICES = [
  { icon: Monitor, title: "Custom Website Design", desc: "Custom-built websites tailored to your brand and business goals — no templates, no shortcuts." },
  { icon: RefreshCw, title: "Website Redesigns", desc: "Modernize your existing site with a fresh design that converts visitors into customers." },
  { icon: Wrench, title: "Ongoing Maintenance", desc: "Basic Care ($49/mo) covers hosting, SSL, security updates, daily backups and monitoring. Turnkey Care ($99/mo) adds a domain, site assistant, monthly edits, report and priority support." },
  { icon: Globe, title: "Domain Leasing", desc: "Lease a professional domain for $9.95/month. We handle registration, DNS, SSL, and renewals." },
  { icon: Zap, title: "Business Automation", desc: "Automate client management, scheduling, and workflows so your business runs itself." },
  { icon: CreditCard, title: "Payment Integration", desc: "Square POS setup, online checkout, and payment processing built into your site." },
  { icon: Users, title: "In-Person Consultations", desc: "Free face-to-face or phone consultations across Southeast Texas and Southwest Louisiana." },
  { icon: Calendar, title: "No Long-Term Contracts", desc: "Project builds are fixed-scope. Maintenance runs month-to-month — cancel anytime." },
];

export default function Services() {
  return (
    <div className="blueprint min-h-screen">
      <PageMeta {...PAGE_META.services} />
      <Navbar />
      <main>
        <section className="mk-hero hero-section">
          <span className="mono" style={{ color: "var(--mk-primary)" }}>01 — SERVICES</span>
          <h1 className="hero-title" style={{ marginTop: 12 }}>Affordable Small Business Websites</h1>
          <p>Custom websites, maintenance, domain leasing, and business automation — all from one locally owned team.</p>
        </section>

        <section style={{ maxWidth: 1000, margin: "0 auto", padding: "0 1rem 4rem" }}>
          <div className="mk-features">
            {SERVICES.map((s) => (
              <div key={s.title} className="glass-card">
                <s.icon size={28} style={{ color: "var(--mk-primary)", marginBottom: 12 }} />
                <h2>{s.title}</h2>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>

          <nav aria-label="Specialist website services" className="mt-8 flex flex-wrap justify-center gap-6">
            <Link to="/maintenance" className="underline">Small Business Website Maintenance</Link>
            <Link to="/service-areas/lake-charles-la" className="underline">Website Design in Lake Charles, LA</Link>
          </nav>
          <div style={{ textAlign: "center", marginTop: 48 }}>
            <Link to="/contact" className="mk-btn mk-btn-lg">Schedule a Free Consultation</Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}