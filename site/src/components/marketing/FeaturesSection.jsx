import Reveal from "@/components/marketing/Reveal";

const features = [
  { title: "Custom Web & App Builds", desc: "No templates. Custom design tailored to your exact business needs with dedicated local support." },
  { title: "Stripe POS Integration", desc: "Accept payments anywhere with a dedicated point-of-sale system connected directly to your platform." },
  { title: "Client Portal & CRM", desc: "Manage project status, task workflows, and track costs from a single central dashboard." },
];

export default function FeaturesSection() {
  return (
    <>
      <div className="mk-section-head" style={{ marginTop: "3rem" }}>
        <span className="mono" style={{ color: "var(--mk-primary)" }}>WHY VIVID ENGINE</span>
        <h2>Website Solutions for Every Stage</h2>
      </div>
      <section id="features" className="mk-features">
      {features.map((f, i) => (
        <Reveal key={f.title} delay={i * 120}>
          <div className="glass-card">
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
          </div>
        </Reveal>
      ))}
      </section>
    </>
  );
}