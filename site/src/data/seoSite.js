// Vivid Engine Solutions: central SEO config. Edit values here only.
import { SERVICE_AREAS } from '@/data/serviceAreas';
import { PLANS, ADD_ONS } from '@/config/pricing';
import { BUSINESS, whatsappContactPoint } from '@/config/business';

export const SITE = {
  url: 'https://vividenginesolutions.com',          // live domain, no trailing slash
  name: BUSINESS.brandName,
  legalName: BUSINESS.legalName,
  tagline: 'Locally owned. Personally built. Professionally maintained.',
  phone: '+1-281-826-4068',
  telephone: '+1-281-826-4068',
  displayPhone: '281-826-4068',                      // office line
  whatsapp: BUSINESS.whatsappLink,                   // see src/config/business.js
  address: { '@type': 'PostalAddress', streetAddress: '410 Chestnut Business Parkway Dr', addressLocality: 'Tomball', addressRegion: 'TX', postalCode: '77375', addressCountry: 'US' },
  email: 'info@vividenginesolutions.com',
  logo: '/logo.png',                                 // square logo, 512x512+
  ogImage: '/og-image.png',                          // 1200x630
  themeColor: '#03060D',
  locale: 'en_US',
  areas: ['Southeast Texas', 'Southwest Louisiana'],  // Houston area to Lafayette, LA; based in Tomball, TX
  cities: SERVICE_AREAS.map((a) => a.city),
  social: [],                                        // e.g. ['https://facebook.com/...', 'https://linkedin.com/company/...']
  services: [
    ...PLANS.map(plan => ({ name: plan.name, desc: plan.tagline })),
    { name: 'Optional add-ons', desc: 'Domains, email, booking, payments, POS, CRM, apps, site assistant, SEO, ads and rush delivery.' },
  ],
};

// Path-keyed page meta used by the <SEO /> component (template style).
export const PAGES = {
  '/': {
    title: 'Vivid Engine: Ask Anything. Get Real Answers. Then Build It.',
    description: 'AI search powered by Perplexity, Claude and Gemini, with sources. Then build websites, apps and video from the same place. Locally built in Greater Houston, SE Texas & SW Louisiana.',
    ogTitle: 'Vivid Engine: Ask Anything. Get Real Answers. Then Build It.',
    ogDescription: 'AI search with sources, plus websites, apps and video from the same place. Locally owned. Personally built. Professionally maintained.',
  },
  '/services': {
    title: 'Web Design, SEO & Custom Apps | Vivid Engine Solutions',
    description: 'Starter websites $999, Launch $1,500, Full Engine apps from $3,500. Basic Care $49/mo, Turnkey Care $99/mo. Optional booking, POS, CRM, SEO and ads.',
  },
  '/contact': {
    title: 'Contact Vivid Engine Solutions | Free Website Consultation',
    description: 'Book a free consultation in Southeast Texas or Southwest Louisiana. Meet in person or online and get a plan for your new website or custom app.',
  },
};

// Backward-compat helpers used across the app.
export const absUrl = (value = '/') => new URL(value, `${SITE.url}/`).href;

export const localBusinessLd = {
  '@context': 'https://schema.org', '@type': ['ProfessionalService', 'LocalBusiness'],
  '@id': `${SITE.url}/#business`, name: SITE.name, legalName: SITE.legalName, url: `${SITE.url}/`,
  logo: absUrl(SITE.logo), image: absUrl(SITE.ogImage), email: SITE.email, telephone: SITE.phone,
  alternateName: 'VividEngine', slogan: SITE.tagline,
  description: 'Website design, app development, website maintenance, domain leasing, POS and CRM systems for businesses in Southeast Texas and Southwest Louisiana, with in-person consultations.',
  priceRange: '$$', currenciesAccepted: 'USD', paymentAccepted: 'Credit card, debit card, financing',
  address: SITE.address,
  // No geo coordinates: Google places the business from the street address (the old ones pointed at Beaumont).
  contactPoint: [
    { '@type': 'ContactPoint', contactType: 'customer service', telephone: SITE.phone, email: SITE.email, areaServed: ['US-TX', 'US-LA'], availableLanguage: 'English' },
    whatsappContactPoint,
  ],
  knowsAbout: ['Web design', 'App development', 'React', 'Progressive web apps', 'iOS and Android apps', 'Stripe POS', 'CRM', 'Google Calendar integration', 'Local SEO', 'Website hosting and maintenance'],
  areaServed: ['Harris County, Texas', 'Montgomery County, Texas', 'Jefferson County, Texas', 'Orange County, Texas', 'Hardin County, Texas', 'Calcasieu Parish, Louisiana', 'Lafayette Parish, Louisiana', 'Cameron Parish, Louisiana', 'Beauregard Parish, Louisiana', 'Jefferson Davis Parish, Louisiana'].map(name => ({ '@type': 'AdministrativeArea', name })),
  hasOfferCatalog: {
    '@type': 'OfferCatalog', name: 'Web and app services',
    itemListElement: [...PLANS, ...ADD_ONS].filter(item => item.price !== null).map(item => ({
      '@type': 'Offer', name: item.name, description: item.tagline || item.detail,
      ...(item.billing === 'monthly' ? { priceSpecification: { '@type': 'UnitPriceSpecification', price: String(item.price), priceCurrency: 'USD', unitText: item.id === 'email' ? 'USER/MONTH' : 'MONTH' } } : item.startingFrom ? { priceSpecification: { '@type': 'PriceSpecification', minPrice: String(item.price), priceCurrency: 'USD' } } : { price: String(item.price), priceCurrency: 'USD' }),
      itemOffered: { '@type': 'Service', name: item.name },
    })),
  },
  makesOffer: ['/locations/beaumont-web-design', '/locations/lake-charles-app-development', '/services/custom-app-development'].map(path => ({ '@type': 'Offer', itemOffered: { '@id': `${SITE.url}${path}#service` } })),
  ...(SITE.social.length ? { sameAs: SITE.social } : {}),
};

// Named-key page meta (each entry carries its own `path`) used by existing pages.
export const PAGE_META = {
  home: { path: '/', ...PAGES['/'] },
  services: { path: '/services', title: 'Affordable Small Business Websites & Web Design', description: "Affordable small business websites built to rank and convert: custom design, SEO setup, hosting and ongoing support. See what's included." },
  about: { path: '/about', title: 'About Us | Web & App Development, Houston to Lafayette', description: 'Web and app developers based in Tomball, TX, helping small businesses from the Houston area to Lafayette, LA get found online with fast, affordable websites.' },
  contact: { path: '/contact', title: 'Contact Vivid Engine | Web Design, Houston to Lafayette', description: 'Talk to a web and app developer serving Southeast Texas and Southwest Louisiana. Request a free, no-pressure quote for your new or existing website.' },
  lakeCharles: { path: '/service-areas/lake-charles-la', title: 'Website Design in Lake Charles, LA', description: 'Website design for Lake Charles, LA small businesses. Mobile-friendly sites built for local search, from a team that serves Southwest Louisiana in person.' },
  pricing: { path: '/pricing', title: 'Website Pricing & Small Business Maintenance Plans', description: 'Clear pricing for small business websites and monthly maintenance plans in Southeast Texas. Compare packages and get a free quote.' },
  maintenance: { path: '/maintenance', title: 'Small Business Website Maintenance Plans', description: 'Small business website maintenance plans covering updates, security, backups and edits, so your site stays fast, safe and current every month.' },
  faq: { path: '/faq', title: 'Website Design, Maintenance & Domain Leasing FAQ', description: 'Answers about custom websites, pricing, project timelines, maintenance and domain leasing from Vivid Engine Solutions.' },
  serviceAreas: { path: '/service-areas', title: 'Web Design Service Areas in Southeast Texas & SWLA', description: 'Website and app development from the Houston area to Lafayette, LA, including Beaumont, the Golden Triangle, Lake Charles and nearby communities.' },
  domainLeasing: { path: '/domain-leasing', title: 'Managed Domain Leasing for Your Business', description: 'Lease a professional domain for $9.95/month. We handle registration, DNS, SSL and renewals. Leasing does not transfer domain ownership.' },
  privacy: { path: '/privacy', title: 'Privacy Policy | Vivid Engine Solutions', description: 'How Vivid Engine Solutions collects, uses and protects information when you use our website, client tools and services.' },
  support: { path: '/support', title: 'Website, App & Client Tools Support', description: 'Get help with your Vivid Engine website, app, CRM or POS tools. Find support contact details and answers to common client questions.' },
  aiSearch: { path: '/ai-search', title: 'Vivid AI Search | Research & Website-Building Assistant', description: 'Ask anything and get answers from live web search with sources, plus help planning and building your website. Free plan included; paid plans add other AI engines.' },
  aiSearchPricing: { path: '/ai-search/pricing', title: 'Vivid AI Search Plans & Pricing', description: 'Free, Starter $8, Plus $20, Pro $45 and Max $129 a month, or Business at $35 per seat. Compare questions, models and the AI engines on each plan.' },
  aiSearchAccount: { path: '/ai-search/account', title: 'Your AI Search Plan', description: 'Your Vivid AI Search plan, usage, billing and team seats.' },
  videoStudio: { path: '/video', title: 'Vivid Video Studio | Online Video Editor with AI Captions', description: 'Edit videos in your browser with a timeline, templates, AI captions, AI voiceover and script-to-video. Your files stay on your computer. Free plan included.' },
  videoPricing: { path: '/video/pricing', title: 'Vivid Video Studio Plans & Pricing', description: 'Free, Creator $12, Pro $29 and Studio $59 a month, or Business at $24 per seat. Compare resolution, video length, effects, brand kits and AI allowances.' },
  videoAccount: { path: '/video/account', title: 'Your Video Studio Plan', description: 'Your Vivid Video Studio plan, usage, billing and team seats.' },
  videoEditor: { path: '/video/edit', title: 'Video Editor | Vivid Video Studio', description: 'Edit your video in Vivid Video Studio.' },
  construction: { path: '/construction', title: '3D Construction Configurator | Sheds, Decks, Garages & Playsets', description: 'Design a shed, garage, deck, pergola or play structure in 3D. Set the options and get a live framing model, materials list, cut list and cost estimate.' },
  estimator: { path: '/vivid-estimator', title: 'Vivid Estimator | Project Scope & Pricing Tool', description: 'Plan your custom website or app with Vivid Estimator. Explore services, project scope, domain options and transparent launch pricing.' },
  login: { path: '/login', title: 'Client Login', description: 'Sign in securely to access your Vivid Engine Solutions client account and project tools.' },
  register: { path: '/register', title: 'Create Your Client Account', description: 'Create and verify a Vivid Engine Solutions account to begin planning your project.' },
  forgotPassword: { path: '/forgot-password', title: 'Request a Password Reset', description: 'Request a secure password reset link for your Vivid Engine Solutions account.' },
  resetPassword: { path: '/reset-password', title: 'Set a New Account Password', description: 'Choose a new password using your secure Vivid Engine Solutions account recovery link.' },
  start: { path: '/start', title: 'Start Your Website or App Project', description: 'Submit your business details, requested services and project requirements for review by Vivid Engine Solutions.' },
  portal: { path: '/portal', title: 'Your Client Project Dashboard', description: 'View your Vivid Engine client projects, project progress, tasks and recent messages.' },
  clientDomain: { path: '/portal/domain', title: 'Your Managed Domain Lease', description: 'Review your managed domain status, lease details, billing dates and cancellation requests.' },
  settings: { path: '/settings', title: 'Client Account Settings', description: 'Manage your Vivid Engine account preferences and submit an account deletion request.' },
  adminDashboard: { path: '/admin', title: 'Business OS Dashboard', description: 'Review internal business metrics, recent leads and invoices in the Vivid Engine Business OS.' },
  adminLeads: { path: '/admin/leads', title: 'Business OS Lead Management', description: 'Manage prospects, update lead status and prepare outreach in the Vivid Engine Business OS.' },
  adminQuotes: { path: '/admin/quotes', title: 'Business OS Quotes', description: 'Prepare and manage client quotes, line items, totals and proposal status.' },
  adminEstimator: { path: '/admin/estimator', title: 'Business OS AI Project Estimator', description: 'Prepare internal project estimates and save itemized draft quotes for client proposals.' },
  adminInvoices: { path: '/admin/invoices', title: 'Business OS Invoices', description: 'Create client invoices, review invoice status and record payments for your business.' },
  adminCosts: { path: '/admin/costs', title: 'Business OS Cost Tracking', description: 'Record internal expenses, vendors, categories and project costs in the Business OS.' },
  adminLogo: { path: '/admin/logo', title: 'Business OS Logo Designer', description: 'Generate and manage logo design concepts for your client branding projects.' },
  adminPos: { path: '/admin/pos', title: 'Business OS POS and Payments', description: 'Prepare client payment requests and review checkout outcomes in the Business OS.' },
  adminChat: { path: '/admin/chat', title: 'Business OS Live Chat Inbox', description: 'Review visitor conversations and respond to live chat inquiries from the internal inbox.' },
};

// Page tags that were written inline in page files, moved here unchanged so the server
// can send the same tags. Kept out of PAGE_META so the site search list doesn't change.
export const PAGE_SEO = {
  pricing: { path: '/pricing', title: 'Website Design & Maintenance Pricing | Vivid Engine Solutions', description: 'Starter websites from $999, Launch $1,500 and Full Engine apps from $3,500. Basic Care $49/mo, Turnkey Care $99/mo, plus optional add-ons.' },
  deleteAccount: { path: '/delete-account', title: 'Delete your Vivid Engine Solutions account', description: 'Request deletion of your Vivid Engine Solutions account and personal data online or by email, and learn about legally retained records.', noindex: true }, // must stay reachable for app stores, not searchable
  login: { path: '/login', title: 'Client Login — Vivid Engine Solutions', description: 'Sign in to your Vivid Engine Solutions client portal.', noindex: true },
};

// City pages (/service-areas/:slug). Pages without real local content stay out of search.
export function serviceAreaMeta(a) {
  const path = `/service-areas/${a.slug}`;
  const noindex = a.localNote.trim().length <= 80;
  if (a.slug === 'lake-charles-la') return { ...PAGE_META.lakeCharles, noindex };
  return {
    path,
    title: `Website Design & Maintenance in ${a.city}, ${a.state}`,
    description: `Custom websites and ongoing maintenance for ${a.city}, ${a.state} businesses. Discuss your site with Vivid Engine Solutions in a free consultation.`,
    noindex,
  };
}