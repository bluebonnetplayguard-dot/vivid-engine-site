import { Link } from "react-router-dom";
import Navbar from "@/components/marketing/Navbar";
import Footer from "@/components/marketing/Footer";
import { PageMeta, PAGE_META } from '@/components/SeoSchema';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

import { FAQS as faqs, faqSchema } from '@/data/seoFaqs';

export default function FAQ() {
  return (
    <div className="blueprint min-h-screen">
      <PageMeta {...PAGE_META.faq} schema={faqSchema(faqs)} />
      <Navbar />
      <main>
        <section className="mk-hero hero-section">
          <span className="mono" style={{ color: "var(--mk-primary)" }}>04 — FAQ</span>
          <h1 className="hero-title" style={{ marginTop: 12 }}>Frequently Asked Questions</h1>
          <p>Pricing, timelines, domain leasing, and what working with us looks like.</p>
        </section>

        <section style={{ maxWidth: 720, margin: "0 auto", padding: "0 1rem 4rem" }}>
          <div style={{ border: "1px solid var(--mk-border)", borderRadius: 12, overflow: "hidden", background: "var(--mk-card)" }}>
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((f, i) => (
                <AccordionItem key={i} value={`item-${i}`} className="border-b px-5 last:border-b-0" style={{ borderColor: "var(--mk-border)" }}>
                  <AccordionTrigger headingLevel={2} className="text-left text-base font-medium" style={{ color: "var(--mk-title)" }}>
                    <span className="mr-3 mono" style={{ fontSize: "0.7rem", color: "var(--mk-muted)" }}>{String(i + 1).padStart(2, "0")}</span>
                    {f.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm" style={{ color: "var(--mk-muted)" }}>{f.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

          <div style={{ textAlign: "center", marginTop: 40 }}>
            <Link to="/contact" className="mk-btn mk-btn-lg">Still Have Questions? Contact Us</Link>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}