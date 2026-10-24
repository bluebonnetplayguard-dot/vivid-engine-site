import { SEARCH_PLANS, formatUsd, planPrice } from './pricing-catalog.ts';

// The eight services. Four already have their own long-standing pages (path points there); the other four are
// rendered from this file at /services/<slug>.
// CONFIRM the list before launch: the brief names eight services without listing them.

export interface Service {
  slug: string; path: string; name: string; nameEs: string; short: string;
  ownPage: boolean;              // true = rendered from this file at /services/<slug>
  title?: string; description?: string; h1?: string; intro?: string[];
  points?: { title: string; text: string }[];
  priceNote?: string; pricingPath?: string;
}

export const SERVICES: Service[] = [
  { slug: 'website-design', path: '/services/website-design', ownPage: true, name: 'Website Design', nameEs: 'Diseño web',
    short: 'Custom, mobile-first websites. No drag-and-drop templates.',
    title: 'Custom Website Design for Small Businesses', h1: 'Custom website design',
    description: 'Custom, mobile-first websites for small businesses in Greater Houston, SE Texas and SW Louisiana. Sites from $999, with optional monthly care.',
    intro: ['We design and build each site around your business: what customers need to know, what you want them to do, and how you want to look. Every site is built mobile-first and set up so search engines understand it.'],
    points: [
      { title: 'Planned with you', text: 'We start with a free consultation, in person or by phone, and write down the pages and features before any work starts.' },
      { title: 'Built to be found', text: 'Page titles, descriptions, structured data and a matching Google Business Profile.' },
      { title: 'Yours to grow', text: 'Add booking, payments, a blog or a client portal when you need them.' },
    ],
    priceNote: 'Starter sites from $999, Launch sites $1,500.', pricingPath: '/pricing/custom-builds' },
  { slug: 'website-maintenance', path: '/maintenance', ownPage: false, name: 'Website Maintenance', nameEs: 'Mantenimiento web',
    short: 'Hosting, security, backups, monitoring and edits every month.' },
  { slug: 'custom-app-development', path: '/services/custom-app-development', ownPage: false, name: 'Custom App Development', nameEs: 'Desarrollo de aplicaciones',
    short: 'Web and Google Play apps, client portals and secure logins.' },
  { slug: 'domain-leasing', path: '/domain-leasing', ownPage: false, name: 'Domain Leasing', nameEs: 'Arrendamiento de dominios',
    short: 'We register and manage your web address, DNS and email setup.' },
  { slug: 'business-solutions', path: '/services/business-solutions', ownPage: true, name: 'POS, CRM & Business Tools', nameEs: 'Punto de venta y CRM',
    short: 'Custom Square POS and a CRM with calendar sync.',
    title: 'Square POS, CRM and Business Tools', h1: 'POS, CRM and business tools',
    description: 'Custom point of sale on Square, a CRM with Google Calendar sync, invoicing and inventory for small businesses. Quoted after a free consultation.',
    intro: ['Run the front counter and the back office from one place. We build on Square for payments, then add the pieces your business needs: client records, jobs, invoices, inventory and bookings.'],
    points: [
      { title: 'Square payments', text: 'In-person and online payments with the processor many local businesses already use.' },
      { title: 'Client records and jobs', text: 'A simple CRM with Google Calendar sync so appointments and follow-ups do not slip.' },
      { title: 'Invoices and inventory', text: 'Send invoices, take deposits and keep stock counts in one system.' },
    ],
    priceNote: 'Custom POS from $1,500 and custom CRM from $2,500, quoted by scope.', pricingPath: '/pricing/custom-builds' },
  { slug: 'local-seo', path: '/services/local-seo', ownPage: true, name: 'Local SEO & Google Ads', nameEs: 'SEO local y anuncios',
    short: 'Google Business Profile, on-page SEO and managed ad campaigns.',
    title: 'Local SEO, Google Profile & Google Ads', h1: 'Local SEO and Google Ads',
    description: 'Google Business Profile setup, on-page SEO and managed Google Ads for local businesses. Monthly local SEO from $249; ads management from $299 plus ad spend.',
    intro: ['Most local customers start on Google. We make sure your listing, your website and your ads tell the same clear story, and we report each month on what changed. No one can promise rankings; we focus on the work that gives you the best chance.'],
    points: [
      { title: 'Google Business Profile', text: 'Complete, accurate listings with the right categories, photos, hours and service areas.' },
      { title: 'On-page SEO', text: 'Clear page titles, descriptions, headings and structured data on your site.' },
      { title: 'Managed ads', text: 'Google Ads campaigns set up and watched by a person, with spend you control.' },
    ],
    priceNote: 'Local SEO growth $249/mo. Google Ads management $299/mo plus ad spend.', pricingPath: '/pricing/custom-builds' },
  { slug: 'video-production', path: '/services/video-production', ownPage: true, name: 'Video Production', nameEs: 'Producción de video',
    short: 'Owner spotlights, promo videos and social clips, made by people.',
    title: 'Video Production for Local Businesses', h1: 'Video production',
    description: 'Owner Spotlight videos from $1,495, full promos, ads and social clips from $350 for local businesses. Or make your own in Video Studio.',
    intro: ['A short video of you and your team can do what a page of text cannot. We plan, shoot and edit videos for your website, Google listing and social channels, and you can make quick edits yourself in Vivid Video Studio.'],
    points: [
      { title: 'Owner Spotlight', text: 'A short, polished video about you and your business.' },
      { title: 'Promos and ads', text: 'Scripted promos and ad cuts sized for each platform.' },
      { title: 'Social clips', text: 'Vertical clips for Reels, TikTok and Shorts, one at a time or as a monthly plan.' },
    ],
    priceNote: 'Owner Spotlight from $1,495. Social clips $350 each or 5 for $1,500.', pricingPath: '/pricing/production' },
  { slug: 'ai-business-help', path: '/services/ai-business-help', ownPage: true, name: 'AI Search & Business Help', nameEs: 'Búsqueda con IA y ayuda',
    short: 'Answers with sources from Perplexity, Claude and Gemini, plus help running your business.',
    title: 'AI Search and Business Help', h1: 'AI search and business help',
    description: 'Vivid AI Search answers with numbered sources from Perplexity, Claude and Gemini, and helps with pricing, marketing, Google listings and reviews. Free plan available.',
    intro: ['Ask a question and get an answer you can check, with numbered sources. Then use the same place to write a price list, plan a promotion, or answer a review, and hand anything bigger to our local team.'],
    points: [
      { title: 'Answers you can check', text: 'Live web search with numbered sources, from the engine best suited to the question.' },
      { title: 'Business help', text: 'Marketing ideas, Google Business Profile tips, review replies and simple business plans.' },
      { title: 'A person when you need one', text: 'When a task needs real work, we can build it for you. WhatsApp us any time.' },
    ],
    priceNote: `Free plan available. Search Pro from ${formatUsd(planPrice(SEARCH_PLANS[1], 'annual'))}/mo billed yearly.`, pricingPath: '/pricing/search' },
];

export const serviceBySlug = (slug: string) => SERVICES.find(s => s.slug === slug && s.ownPage) ?? null;
