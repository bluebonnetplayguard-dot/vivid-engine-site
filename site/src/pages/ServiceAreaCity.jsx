import { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import Navbar from "@/components/marketing/Navbar";
import Footer from "@/components/marketing/Footer";
import { PageMeta } from '@/components/SeoSchema';
import { serviceAreaMeta } from '@/data/seoSite';
import { SERVICE_AREAS, bySlug } from "@/data/serviceAreas";

const SITE = "https://vividenginesolutions.com";

// Geo meta tags: harmless, but major engines largely ignore them. The structured data
// and real local content below do the actual work.
function useGeoMeta(a) {
  useEffect(() => {
    if (!a) return;
    const set = (name, content) => {
      let el = document.head.querySelector(`meta[name="${name}"]`);
      if (!el) { el = document.createElement("meta"); el.name = name; document.head.appendChild(el); }
      el.content = content;
    };
    set("geo.region", `US-${a.state}`);
    set("geo.placename", `${a.city}, ${a.state}`);
    set("geo.position", `${a.lat};${a.lng}`);
    set("ICBM", `${a.lat}, ${a.lng}`);
  }, [a]);
}

export default function ServiceAreaCity() {
  const { slug } = useParams();
  const a = bySlug(slug);
  useGeoMeta(a);

  if (!a) {
    return (
      <div className="blueprint min-h-screen">
        <PageMeta title="Service Area Not Found" description="The requested Vivid Engine service area is not available. Browse our regional service area directory." path={`/service-areas/${slug}`} noindex />
        <Navbar />
        <main className="mk-hero">
          <h1 className="hero-title">Service area not found</h1>
          <Link to="/service-areas" className="mk-btn mk-btn-lg" style={{ marginTop: 24 }}>All service areas</Link>
        </main>
        <Footer />
      </div>
    );
  }

  const path = `/service-areas/${a.slug}`;
  // Title, description and the thin-content noindex rule live in serviceAreaMeta (data/seoSite.js),
  // which the server also uses.
  const meta = serviceAreaMeta(a);
  const hasUniqueContent = !meta.noindex;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        "@id": `${SITE}${path}#service`,
        name: `Website design and maintenance in ${a.city}, ${a.state}`,
        serviceType: "Website design, development, and maintenance",
        provider: { "@id": `${SITE}/#business` },
        areaServed: {
          "@type": "City",
          name: `${a.city}, ${a.state}`,
          geo: { "@type": "GeoCoordinates", latitude: a.lat, longitude: a.lng },
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "Service Areas", item: `${SITE}/service-areas` },
          { "@type": "ListItem", position: 3, name: a.city, item: `${SITE}${path}` },
        ],
      },
    ],
  };

  return (
    <div className="blueprint min-h-screen">
      <PageMeta {...meta} schema={jsonLd} />
      <Navbar />
      <main>
        <section className="mk-hero hero-section">
          <span className="mono" style={{ color: "var(--mk-primary)" }}>{a.region.toUpperCase()}</span>
          <h1 className="hero-title" style={{ marginTop: 12 }}>{a.slug === 'lake-charles-la' ? 'Website Design in Lake Charles, LA' : `Website Design & Maintenance in ${a.city}, ${a.state}`}</h1>
          <p>Locally Owned. Personally Built. Professionally Maintained.</p>
        </section>

        <section style={{ maxWidth: 800, margin: "0 auto", padding: "0 1rem 4rem" }}>
          <nav aria-label="Breadcrumb" className="mono" style={{ marginBottom: 24, fontSize: "0.85rem", color: "var(--mk-muted)" }}>
            <Link to="/" style={{ color: "var(--mk-muted)" }}>Home</Link>
            {" / "}
            <Link to="/service-areas" style={{ color: "var(--mk-muted)" }}>Service Areas</Link>
            {" / "}
            <span style={{ color: "var(--mk-text)" }}>{a.city}</span>
          </nav>

          <p style={{ color: "var(--mk-text)", lineHeight: 1.7 }}>
            Vivid Engine Solutions is a locally owned team building and maintaining custom websites for {a.region} businesses.
            Locally Owned. Personally Built. Professionally Maintained.
          </p>

          {hasUniqueContent && (
            <p style={{ color: "var(--mk-text)", lineHeight: 1.7, marginTop: 16 }}>{a.localNote}</p>
          )}

          <h2 style={{ fontFamily: "Fraunces, serif", color: "var(--mk-title)", fontSize: "1.5rem", marginTop: 40, marginBottom: 12 }}>
            What we do for {a.city} businesses
          </h2>
          <ul style={{ color: "var(--mk-text)", lineHeight: 1.8, paddingLeft: 20, listStyleType: "disc" }}>
            <li>Custom website design and development</li>
            <li>Ongoing maintenance and updates, with no long-term service contracts</li>
            <li>Website redesigns and domain leasing</li>
            <li>Free in-person or phone consultations</li>
          </ul>

          <h2 style={{ fontFamily: "Fraunces, serif", color: "var(--mk-title)", fontSize: "1.5rem", marginTop: 40, marginBottom: 12 }}>
            Nearby communities we serve
          </h2>
          <p style={{ color: "var(--mk-text)", lineHeight: 1.8 }}>
            {a.nearby.map((n, i) => {
              const t = SERVICE_AREAS.find((x) => x.city === n);
              return (
                <span key={n}>
                  {t ? (
                    <Link to={`/service-areas/${t.slug}`} style={{ color: "var(--mk-primary)", textDecoration: "underline" }}>{n}</Link>
                  ) : n}
                  {i < a.nearby.length - 1 ? ", " : ""}
                </span>
              );
            })}
          </p>

          <div style={{ marginTop: 40, display: "flex", flexWrap: "wrap", gap: 12 }}>
            <Link to="/contact" className="mk-btn">Schedule a Free Consultation</Link>
            <Link to="/vivid-estimator" className="btn-ghost">Get an Estimate</Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}