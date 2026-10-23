import Navbar from "@/components/marketing/Navbar";
import Footer from "@/components/marketing/Footer";
import InquirySection from "@/components/marketing/InquirySection";
import BusinessContact from '@/components/marketing/BusinessContact';
import { PageMeta, PAGE_META } from '@/components/SeoSchema';

export default function Contact() {
  return (
    <div className="blueprint min-h-screen">
      <PageMeta {...PAGE_META.contact} />
      <Navbar />
      <main>
        <div style={{ maxWidth: 800, margin: "0 auto", padding: "4rem 1rem 2rem" }}>
          <span className="mono">/ CONTACT — VIVID ENGINE SOLUTIONS</span>
          <h1 style={{ fontFamily: "Fraunces, serif", fontSize: "2.5rem", lineHeight: 1.2, color: "var(--mk-title)", margin: "12px 0 16px" }}>
            Contact Vivid Engine Solutions
          </h1>
          <p style={{ color: "var(--mk-muted)", fontSize: "1.05rem" }}>
            Send us a message below and a team member will follow up within one business day. We work with businesses from the Houston area to Lafayette, Louisiana.
          </p>
        </div>
        <BusinessContact placement="contact" />
        <InquirySection />
      </main>
      <Footer />
    </div>
  );
}