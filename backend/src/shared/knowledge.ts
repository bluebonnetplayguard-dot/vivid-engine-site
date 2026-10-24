import { ADD_ON_PRICES, PLAN_PRICES } from './pricing';

// Server-side assistant knowledge (ported from base44/shared/veKnowledge.ts),
// synchronized with src/config/pricing.js.
export const PLANS = [
  { name: 'Starter', price: '$999 one-time', amounts: [PLAN_PRICES.starter.once / 100], bestFor: 'New or small businesses', includes: ['Up to 5 pages', 'Custom mobile-first design', 'Contact form', 'Basic on-page SEO', 'Google Business Profile setup'], notIncluded: ['Monthly care is separate'] },
  { name: 'Launch', price: '$1,500 one-time', amounts: [PLAN_PRICES.launch.once / 100], bestFor: 'Larger websites; best value', includes: ['Everything in Starter', 'Up to 10 pages', 'Blog or news page', 'Photo gallery', 'Inquiries sent by text and email'], notIncluded: ['Monthly care is separate'] },
  { name: 'Full Engine', price: 'from $3,500 one-time; written quote required', amounts: [3500], bestFor: 'Custom web or Google Play apps', includes: ['Everything in Launch', 'Client portal', 'Secure logins', 'Workflow-specific app'] },
  { name: 'Basic Care', price: '$49/month', amounts: [PLAN_PRICES.basic.monthly / 100], bestFor: 'Essential care after launch', includes: ['Hosting and SSL', 'Security updates', 'Daily backups', 'Uptime monitoring'] },
  { name: 'Turnkey Care', price: '$99/month', amounts: [PLAN_PRICES.care.monthly / 100], bestFor: 'Hands-off care after launch', includes: ['Everything in Basic Care', '1 domain', 'Site assistant', 'Up to 1 hour of edits/month', 'Monthly report', 'Priority support'] },
] as { name: string; price: string; amounts: number[]; bestFor: string; includes: string[]; notIncluded?: string[] }[];

export const ADD_ONS = Object.entries(ADD_ON_PRICES).map(([id, option]) => ({
  name: option.name,
  price: option.percentage ? '+25% of the approved project quote'
    : option.startingCents ? `from $${option.startingCents / 100}, written quote required`
    : option.cents === null ? 'quote'
    : `$${option.cents / 100}${option.billing === 'monthly' ? '/month' : ' one-time'}`,
  amounts: [option.cents, option.startingCents].filter(value => value != null).map(value => value / 100),
  detail: id === 'ads' ? 'Ad spend is separate.' : id === 'email' ? 'Per user.' : id === 'copy' ? 'Per page.' : id === 'pages' ? 'Per page.'
    : option.includedIn.includes('care') ? 'Included in Turnkey Care; one domain included.' : 'Optional add-on.',
}));

export const BILLING = [
  'Builds: Starter $999, Launch $1,500, Full Engine from $3,500. Monthly care is separate: Basic Care $49/mo, Turnkey Care $99/mo.',
  'Do not quote retired pricing tiers. No approved yearly discount.',
  'Starting prices and rush delivery require a written quote before work starts.',
  'A standard 3.5% card processing fee applies at checkout, plus applicable sales tax.',
  'Financing: pay over time with Hearth, offered under Bluebonnet Playguard LLC, subject to approval.',
];

const ALLOWED_AMOUNTS = new Set(
  [...PLANS, ...ADD_ONS].flatMap(x => x.amounts || [])
    .flatMap(n => [String(n), n.toFixed(2), Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, '')]),
);

export function buildKnowledge(): string {
  const lines = [
    'COMPANY: Vivid Engine Solutions. Locally Owned. Personally Built. Professionally Maintained.',
    'OFFICE PHONE: 281-826-4068. WHATSAPP: https://wa.me/12818264068 (share the WhatsApp link, never read it out as a phone number to call). EMAIL: info@vividenginesolutions.com. ADDRESS: 410 Chestnut Business Parkway Dr, Tomball, TX 77375.',
    'BASED IN: Tomball, Texas (Houston area). SERVICE AREA: from the Houston area to Lafayette, Louisiana. Southeast Texas (Houston area, Beaumont, Port Arthur, Orange, Nederland, Groves, Lumberton, Vidor) and Southwest Louisiana (Lake Charles, Sulphur, Westlake, Moss Bluff, Vinton, DeQuincy), and surrounding communities.',
    'CONSULTATIONS: free, in person or by phone. Requests are not confirmed appointments until the owner personally approves them.',
    'ONGOING MAINTENANCE: Basic Care $49/mo covers hosting, SSL, security, daily backups and monitoring. Turnkey Care $99/mo adds a domain, site assistant, up to 1 hour of edits, monthly report and priority support. Builds do not include monthly care.',
    'OWNERSHIP: Website ownership and domain ownership are different. Leasing does not transfer domain ownership. Refer purchase, cancellation and transfer details to the owner; never invent a buyout price.',
  ];
  lines.push('PLANS:\n' + PLANS.map(p => `- ${p.name}, ${p.price}. Best for: ${p.bestFor}. Includes: ${p.includes.join('; ')}.` + (p.notIncluded ? ` Not included: ${p.notIncluded.join('; ')}.` : '')).join('\n'));
  lines.push('ADDITIONAL OPTIONS (added to any plan):\n' + ADD_ONS.map(a => `- ${a.name}: ${a.price === 'quote' ? 'price by quote only (ask the owner)' : a.price}. ${a.detail}`).join('\n'));
  lines.push('BILLING:\n' + BILLING.join('\n'));
  return lines.join('\n\n');
}

// True when a reply mentions a dollar amount that is not on the approved list.
export function hasUnapprovedPrice(reply: string): boolean {
  return [...reply.matchAll(/\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/g)]
    .some(match => !ALLOWED_AMOUNTS.has(String(Number(match[1].replace(/,/g, '')))))
    || /\$\s*149(?:\.00)?\s*(?:\/\s*(?:mo(?:nth)?\b)|per\s+month|monthly)/i.test(reply);
}
