import { Link } from "react-router-dom";
import Navbar from "@/components/marketing/Navbar";
import Footer from "@/components/marketing/Footer";
import Reveal from "@/components/marketing/Reveal";
import { PageMeta, PAGE_META } from '@/components/SeoSchema';
import { SERVICE_AREAS } from "@/data/serviceAreas";

export default function ServiceAreas() {
  const txAreas = SERVICE_AREAS.filter((a) => a.state === "TX");
  const laAreas = SERVICE_AREAS.filter((a) => a.state === "LA");

  return (
    <div className="blueprint min-h-screen">
      <PageMeta {...PAGE_META.serviceAreas} />
      <Navbar />
      <main>
        <section className="mk-hero hero-section">
          <span className="mono" style={{ color: "var(--mk-primary)" }}>SERVICE AREAS</span>
          <h1 className="hero-title" style={{ marginTop: 12 }}>Southeast Texas &amp; Southwest Louisiana</h1>
          <p>Locally owned in Tomball, Texas. We meet clients in person from the Houston area to Lafayette, Louisiana, including the Golden Triangle and Lake Charles.</p>
        </section>

        <section style={{ maxWidth: 1000, margin: "0 auto", padding: "0 1rem 4rem" }}>
          <Reveal>
            <div className="mk-section-head">
              <span className="mono">SOUTHEAST TEXAS</span>
              <h2>Golden Triangle</h2>
              <p>Beaumont, Port Arthur, Orange and surrounding communities.</p>
            </div>
          </Reveal>
          <div className="mk-features">
            {txAreas.map((area, i) => (
              <Reveal key={area.slug} delay={i * 60}>
                <Link to={`/service-areas/${area.slug}`} className="glass-card block" style={{ textDecoration: "none" }}>
                  <h3>{area.city}</h3>
                  <p>{area.nearby.join(" · ")}</p>
                </Link>
              </Reveal>
            ))}
          </div>

          <Reveal>
            <div className="mk-section-head" style={{ marginTop: "3rem" }}>
              <span className="mono">SOUTHWEST LOUISIANA</span>
              <h2>Lake Charles Area</h2>
              <p>Lake Charles, Sulphur, Westlake and surrounding communities.</p>
            </div>
          </Reveal>
          <div className="mk-features">
            {laAreas.map((area, i) => (
              <Reveal key={area.slug} delay={i * 60}>
                <Link to={`/service-areas/${area.slug}`} className="glass-card block" style={{ textDecoration: "none" }}>
                  <h3>{area.city}</h3>
                  <p>{area.nearby.join(" · ")}</p>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}