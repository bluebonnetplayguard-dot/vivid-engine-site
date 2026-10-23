import { useId } from 'react';
import { FAQS, faqSchema } from '@/data/seoFaqs';
import JsonLd from '@/components/seo/JsonLd';

export default function FaqSection({ faqs = FAQS, heading = 'Frequently Asked Questions' }) {
  const id = useId();
  return (
    <section id="faq" aria-labelledby={`${id}-heading`} className="px-4 py-16">
      <div className="mx-auto max-w-3xl">
        <h2 id={`${id}-heading`} className="mb-10 text-center font-heading text-3xl font-bold">{heading}</h2>
        <div className="space-y-4">
          {faqs.map(({ q, a }) => (
            <details key={q} className="group rounded-lg border border-border bg-card p-5 open:shadow-xs">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold">
                <h3 className="m-0 text-lg font-semibold">{q}</h3><span aria-hidden="true" className="text-2xl group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 leading-relaxed text-muted-foreground">{a}</p>
            </details>
          ))}
        </div>
      </div>
      <JsonLd id={`${id}-faq-schema`} data={faqSchema(faqs)} />
    </section>
  );
}