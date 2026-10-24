import { PLANS, formatUsd } from '@/config/pricing';
const steps = [
  { n: "01", title: "Free audit", desc: "We review your current site and flag what's costing you customers." },
  { n: "02", title: "In-person sit-down", desc: "We meet at your business — no Zoom required — and scope the build." },
  { n: "03", title: "Design & build", desc: "Custom design and development, with check-ins as we go." },
  { n: "04", title: "Launch", desc: `Launch is a one-time ${formatUsd(PLANS.find(plan => plan.id === 'launch').price)} build for up to 10 pages, a blog and gallery, and inquiries by text and email. Monthly care is separate.` },
  { n: "05", title: "Add-ons", desc: "POS, CRM, SEO, or ads layered in as your business needs them." },
  { n: "06", title: "Turnkey care", desc: "Basic Care ($49/mo) handles hosting, SSL, security, daily backups and monitoring. Turnkey Care ($99/mo) adds a domain, site assistant, edits, reports and priority support." },
];

export default function ProcessSection() {
  return (
    <section>
      <div className="wrap">
        <div className="section-head">
          <span className="mono">03 — Process</span>
          <h2>From first sit-down to turnkey handoff</h2>
          <p>A real, ordered process — not a form you fill out and wait on.</p>
        </div>
        <div className="ruler">
          <div className="steps">
            {steps.map((s) => (
              <div key={s.n} className="step">
                <span className="n">{s.n}</span>
                <h4>{s.title}</h4>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}