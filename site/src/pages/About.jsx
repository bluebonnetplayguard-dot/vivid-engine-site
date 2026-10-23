import Navbar from "@/components/marketing/Navbar";
import Footer from "@/components/marketing/Footer";
import { PageMeta, PAGE_META } from '@/components/SeoSchema';

export default function About() {
  return (
    <div className="blueprint min-h-screen">
      <PageMeta {...PAGE_META.about} />
      <Navbar />
      <main style={{ maxWidth: 800, margin: "0 auto", padding: "4rem 1rem 3rem" }}>
        <span className="mono">/ ABOUT — VIVID ENGINE SOLUTIONS</span>
        <h1 style={{ fontFamily: "Fraunces, serif", fontSize: "2.5rem", lineHeight: 1.2, color: "var(--mk-title)", margin: "12px 0 24px" }}>
          Your Web &amp; App Team, from Houston to Lafayette
        </h1>
        <div style={{ color: "var(--mk-text)", fontSize: "1.05rem", lineHeight: 1.8 }}>
          <p style={{ marginBottom: "1.25rem" }}>
            Vivid Engine Solutions is a locally owned web and application development agency based in Tomball, Texas, serving businesses across Southeast Texas and Southwest Louisiana, from the Houston area through Beaumont and Lake Charles to Lafayette. We build high-performance websites, mobile apps, and custom software, and we back every product with an all-in-one platform that helps our clients manage leads, quotes, invoices, and payments from a single dashboard.
          </p>
          <p style={{ marginBottom: "1.25rem" }}>
            Our work is built for small and mid-sized businesses that need a real online presence without the overhead of a full internal team — from first-time site owners to established companies modernizing legacy systems. Every project is turnkey: we handle hosting, security, maintenance, and ongoing monitoring so our clients can focus on running their business instead of babysitting their website.
          </p>
          <p style={{ marginBottom: "1.25rem" }}>
            Vivid Engine Solutions was founded by a local team that believes in real websites, real people, and real relationships. We work in person across SETX and SWLA, and we stand behind every build with ongoing support. Whether you need a fast new marketing site, a client portal, or a full business operating system, we deliver products engineered to perform and built to last.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}