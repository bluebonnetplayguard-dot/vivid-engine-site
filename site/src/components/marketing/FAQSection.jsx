import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

import { FAQS } from '@/data/seoFaqs';
const faqs = FAQS.slice(0, 6);

export default function FAQSection() {
  return (
    <section id="faq" className="py-20">
      <div className="mx-auto max-w-3xl px-6">
        <div className="text-center">
          <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-accent">§ 07 — FAQ</span>
          <h2 className="mt-3 font-heading text-3xl font-bold tracking-tight md:text-4xl">FAQ</h2>
          <p className="mt-4 text-muted-foreground">Pricing, timelines, and what working with us looks like.</p>
        </div>
        <div className="mt-10 border border-border">
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((f, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="border-b border-border px-5 last:border-b-0">
                <AccordionTrigger className="text-left text-base font-medium">
                  <span className="mr-3 font-mono text-[11px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                  {f.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}