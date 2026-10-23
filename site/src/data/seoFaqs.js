import { PLANS, formatUsd } from '@/config/pricing';
const prices = Object.fromEntries(PLANS.map(plan => [plan.id, formatUsd(plan.price)]));
// One source for visible answers and FAQ structured data.
export const FAQS = [
  { q: 'How much does a website cost?', a: `Starter is ${prices.starter} one-time for up to 5 pages. Launch is ${prices.launch} for up to 10 pages, blog and gallery. Full Engine apps start at ${prices.full}. Monthly care is separate: Basic Care ${prices.basic}/mo or Turnkey Care ${prices.care}/mo. Optional add-ons are listed on the Pricing page.` },
  { q: 'How long does it take to build my website?', a: 'A typical small business site launches in 2 to 4 weeks. The biggest factor is how quickly content like photos, service details and logos are ready.' },
  { q: 'Do you only work with businesses in Beaumont?', a: 'No. We are based in Tomball, Texas, and work with businesses from the Houston area to Lafayette, Louisiana, including Beaumont, Port Arthur, Orange, the Golden Triangle and Lake Charles, as well as remote clients.' },
  { q: 'Will my website work on phones and show up on Google?', a: 'Yes. Every site is mobile-friendly, fast-loading and launched with on-page SEO basics: page titles, descriptions, structured data, a sitemap and Google Search Console setup.' },
  { q: 'What does website maintenance include?', a: 'Basic Care ($49/mo) covers hosting, SSL, security updates, daily backups and uptime monitoring. Turnkey Care ($99/mo) adds one domain, site assistant, up to one hour of monthly edits, a monthly report and priority support.' },
  { q: 'Can I update the website myself?', a: 'Yes. You can edit text and photos yourself, or send changes to us and we will handle them as part of your maintenance plan.' },
  { q: 'What does “turnkey” mean?', a: 'Turnkey Care ($99/mo) handles hosting, security, backups, a domain, site assistant, up to one hour of monthly edits, a monthly report and priority support. It is separate from your one-time website or app build.' },
  { q: 'Is there a long-term contract?', a: 'Website and app builds are one-time payments. Basic Care and Turnkey Care run month-to-month. Cancellation follows your signed service agreement.' },
  { q: 'Can you handle my POS, CRM, and SEO too?', a: 'Yes — that’s the point. One vendor for your site, POS, CRM, SEO, ads, hosting, and security, so everything works together.' },
  { q: 'What is domain leasing?', a: 'Domain leasing lets you use a professional domain for $9.95 per month. We handle registration, DNS, SSL, and renewals. Leasing does not transfer ownership of the domain to you.' },
  { q: 'Does the $9.95 domain lease transfer ownership?', a: 'No. Vivid Engine Solutions retains ownership of leased domains. If you cancel, you may purchase the domain at fair market value or transfer to a domain you own.' },
];
export const faqSchema = faqs => ({
  '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: faqs.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
});