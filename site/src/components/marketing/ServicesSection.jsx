import { PLANS, formatUsd } from '@/config/pricing';
const services = [
  { num: "S.01", title: "Custom website & app builds", desc: "Fully custom design and development — no drag-and-drop templates. Built to fit the business, not the other way around.", tag: `Launch: ${formatUsd(PLANS.find(plan => plan.id === 'launch').price)} one-time` },
  { num: "S.02", title: "Custom POS, built on Stripe", desc: "In-person and online payments, inventory-aware, built directly into your site or app — no bolted-on third-party checkout.", tag: "stripe-powered" },
  { num: "S.03", title: "Custom CRM", desc: "Track clients and inventory in one place, with Google Calendar synced for bookings and appointments automatically.", tag: "calendar sync" },
  { num: "S.04", title: "SEO & local search", desc: "On-page optimization and Google Business Profile setup so SETX and SWLA customers actually find you first.", tag: "ongoing" },
  { num: "S.05", title: "Google Ads management", desc: "Campaign setup and ongoing optimization, targeted to your service area and customer type.", tag: "managed" },
  { num: "S.06", title: "Hosting, security & maintenance", desc: "Basic Care ($49/mo) includes hosting, SSL, security, daily backups and monitoring. Turnkey Care ($99/mo) adds a domain, site assistant, edits and priority support.", tag: "monthly" },
];

export default function ServicesSection() {
  return (
    <section id="services">
      <div className="wrap">
        <div className="section-head">
          <span className="mono">01 — Services</span>
          <h2>Everything the build needs, under one roof</h2>
          <p>No handoffs between five different vendors. One local team designs, builds, launches, and keeps the whole thing running.</p>
        </div>
        <div className="spec-list">
          {services.map((s) => (
            <div key={s.num} className="spec-row">
              <div className="num">{s.num}</div>
              <div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
              <div className="tag-col"><span className="tag">{s.tag}</span></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}