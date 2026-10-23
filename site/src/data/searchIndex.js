// Site content search index — adapted from the MicrosoftSearch repo pattern:
// define a schema, ingest content items, query across them, render by result type.
import { PLANS, ADD_ONS, formatUsd } from '@/config/pricing';
import { FAQS } from '@/data/seoFaqs';
import { PAGE_META } from '@/data/seoSite';

const planPriceLabel = (plan) => plan.billing === 'one_time' ? `${plan.startingFrom ? 'from ' : ''}${formatUsd(plan.price)} one-time` : `${formatUsd(plan.price)}/mo`;

export const SEARCH_ITEMS = [
  // Services
  { type: 'Service', title: 'Custom website & app builds', description: 'Fully custom design and development — no drag-and-drop templates.', path: '/#services', keywords: 'website app design build custom development' },
  { type: 'Service', title: 'Custom POS, built on Square', description: 'In-person and online payments, inventory-aware, built into your site.', path: '/#services', keywords: 'pos payments square checkout card' },
  { type: 'Service', title: 'Custom CRM', description: 'Track clients and inventory with Google Calendar sync for bookings.', path: '/#services', keywords: 'crm clients inventory calendar bookings' },
  { type: 'Service', title: 'SEO & local search', description: 'On-page optimization and Google Business Profile setup for SETX/SWLA.', path: '/#services', keywords: 'seo google local search ranking' },
  { type: 'Service', title: 'Google Ads management', description: 'Campaign setup and ongoing optimization targeted to your service area.', path: '/#services', keywords: 'google ads ppc advertising' },
  { type: 'Service', title: 'Hosting, security & maintenance', description: 'Updates, security, backups, monitoring and monthly content changes.', path: '/maintenance', keywords: 'hosting security maintenance backups monitoring' },
  { type: 'Service', title: 'Domain leasing', description: 'Lease a professional domain — we handle registration, DNS, SSL and renewals.', path: '/domain-leasing', keywords: 'domain leasing dns ssl registration' },
  { type: 'Service', title: 'AI chat assistant', description: 'Lead qualification and 24/7 calendar booking on your site.', path: '/#assistant', keywords: 'ai chat assistant bot lead booking' },

  // Plans
  ...PLANS.map(plan => ({
    type: 'Pricing',
    title: `${plan.name} plan — ${planPriceLabel(plan)}`,
    description: plan.tagline,
    path: plan.cta.href,
    keywords: `${plan.name} plan pricing ${plan.includes.join(' ')}`,
  })),
  ...ADD_ONS.map(addon => ({
    type: 'Pricing',
    title: `${addon.name} — ${addon.display}`,
    description: addon.detail,
    path: '/pricing',
    keywords: `addon ${addon.name} ${addon.detail}`,
  })),

  // FAQs
  ...FAQS.map(faq => ({
    type: 'FAQ',
    title: faq.q,
    description: faq.a,
    path: '/faq',
    keywords: faq.q,
  })),

  // Pages
  ...Object.values(PAGE_META).filter(p => p.path && !p.path.startsWith('/admin') && !p.path.startsWith('/portal') && !p.path.startsWith('/login') && !p.path.startsWith('/reset') && !p.path.startsWith('/register') && !p.path.startsWith('/forgot') && p.path !== '/ai-search/account' && p.path !== '/video/account' && p.path !== '/video/edit').map(p => ({
    type: 'Page',
    title: p.title.replace(/\s*\|.*$/, ''),
    description: p.description,
    path: p.path,
    keywords: p.title,
  })),
];

export const SEARCH_TYPES = ['Service', 'Pricing', 'FAQ', 'Page'];