// Approved October 18, 2026. Server-side amounts live in backend/src/shared/pricing.ts.
export const YEARLY_DISCOUNT = 0;
export const PLANS = [
  { id: 'starter', name: 'Starter', tag: 'Get online', billing: 'one_time', price: 999, maintenance: false, tagline: 'A professional site for new or small businesses.', bestFor: 'New or small businesses.', includes: ['Up to 5 pages', 'Custom, mobile-first design', 'Contact form', 'Basic on-page SEO', 'Google Business Profile setup'], notIncluded: ['Monthly care and optional add-ons are separate.'], cta: { label: 'Start with Starter', href: '/contact?plan=starter' } },
  { id: 'launch', name: 'Launch', tag: 'Best value', badge: 'Best value', billing: 'one_time', price: 1500, maintenance: false, tagline: 'For businesses replacing an outdated or DIY site.', bestFor: 'Businesses needing a larger website.', includes: ['Up to 10 pages', 'Everything in Starter', 'Blog or news page', 'Photo gallery', 'Inquiries sent to your phone by text and email'], notIncluded: ['Monthly care and optional add-ons are separate.'], cta: { label: 'Choose Launch', href: '/contact?plan=launch' } },
  { id: 'full', name: 'Full Engine', tag: 'Apps & portals', billing: 'one_time', price: 3500, startingFrom: true, maintenance: false, tagline: 'Custom web app or Google Play app, quoted after an in-person sit-down.', bestFor: 'Businesses needing custom apps and client portals.', includes: ['Everything in Launch', 'Custom web or Google Play app', 'Client portal & secure logins', 'Built around your workflow'], notIncluded: ['Final price depends on the written scope. Monthly care is separate.'], cta: { label: 'Talk to us', href: '/contact?plan=full' } },
  { id: 'basic', name: 'Basic Care', tag: 'Essentials', billing: 'monthly', price: 49, maintenance: true, tagline: 'Keep your site online, secure and backed up.', bestFor: 'Essential hosting and security after launch.', includes: ['Hosting & SSL certificate', 'Security updates', 'Daily backups', 'Uptime monitoring'], notIncluded: ['Website build and optional add-ons are separate.'], cta: { label: 'Choose Basic Care', href: '/contact?plan=basic' } },
  { id: 'care', name: 'Turnkey Care', tag: 'Recommended', badge: 'Recommended', billing: 'monthly', price: 99, maintenance: true, tagline: 'We run your site so you never have to touch it.', bestFor: 'Businesses wanting hands-off maintenance.', includes: ['Everything in Basic Care', '1 domain included', 'Site assistant chat', 'Up to 1 hour of edits each month', 'Monthly report & priority support'], notIncluded: ['Website build and optional add-ons are separate.'], cta: { label: 'Choose Turnkey Care', href: '/contact?plan=care' } },
];
export const ADD_ONS = [
  { id: 'domain', group: 'Site & brand', name: 'Domain leasing', price: 9.95, billing: 'monthly', display: '$9.95/mo', detail: 'Domain registration and DNS management. Leasing does not transfer ownership.', includedIn: ['care'], includedNote: '1 domain included' },
  { id: 'email', group: 'Site & brand', name: 'Business email', price: 6, billing: 'monthly', display: '$6/user/mo', detail: 'Business email, priced per user.', includedIn: [] },
  { id: 'pages', group: 'Site & brand', name: 'Extra page', price: 150, billing: 'one_time', display: '$150 each', detail: 'Each page beyond the included page count.', includedIn: [] },
  { id: 'copy', group: 'Site & brand', name: 'Copywriting', price: 99, billing: 'one_time', display: '$99/page', detail: 'Copywriting, priced per page.', includedIn: [] },
  { id: 'brand', group: 'Site & brand', name: 'Logo & brand kit', price: 299, billing: 'one_time', display: '$299', detail: 'A logo and coordinated brand kit.', includedIn: [] },
  { id: 'booking', group: 'Business tools', name: 'Online booking + Google Calendar sync', price: 299, billing: 'one_time', display: '$299 setup', detail: 'Online appointments synced to your calendar.', includedIn: [] },
  { id: 'store', group: 'Business tools', name: 'Online payments / small store', price: 499, startingFrom: true, billing: 'one_time', display: 'from $499', detail: 'Online payments or a small store, quoted by scope.', includedIn: [] },
  { id: 'pos', group: 'Business tools', name: 'Custom POS (Stripe)', price: 1500, startingFrom: true, billing: 'one_time', display: 'from $1,500', detail: 'In-person and online payments with inventory.', includedIn: [] },
  { id: 'crm', group: 'Business tools', name: 'Custom CRM', price: 2500, startingFrom: true, billing: 'one_time', display: 'from $2,500', detail: 'Clients, jobs, invoices and inventory in one place.', includedIn: [] },
  { id: 'app', group: 'Business tools', name: 'Installable app + Google Play listing', price: 1500, startingFrom: true, billing: 'one_time', display: 'from $1,500', detail: 'An installable app with a Google Play listing.', includedIn: [] },
  { id: 'ai-chat', group: 'Growth & marketing', name: 'Site assistant chat', price: 29, billing: 'monthly', display: '$29/mo', detail: 'Included in Turnkey Care.', includedIn: ['care'] },
  { id: 'seo', group: 'Growth & marketing', name: 'Local SEO growth', price: 249, billing: 'monthly', display: '$249/mo', detail: 'Monthly content, citations and Google Business Profile posts.', includedIn: [] },
  { id: 'ads', group: 'Growth & marketing', name: 'Google Ads management', price: 299, billing: 'monthly', display: '$299/mo', detail: 'Plus ad spend.', includedIn: [] },
  { id: 'rush', group: 'Growth & marketing', name: 'Rush delivery', price: null, percentage: 25, billing: 'one_time', display: '+25%', detail: 'Half the usual timeline. Added to the written project quote.', includedIn: [] },
];
export const COMPARE = [
  ['Billing', 'One-time', 'One-time', 'From, one-time', 'Monthly', 'Monthly'],
  ['Website pages', 'Up to 5', 'Up to 10', 'Custom scope', 'Separate build', 'Separate build'],
  ['Mobile-first design', true, true, true, 'Separate build', 'Separate build'],
  ['Blog and gallery', false, true, true, 'Separate build', 'Separate build'],
  ['Client portal and secure logins', 'Add-on', 'Add-on', true, 'Separate build', 'Separate build'],
  ['Hosting, SSL, security, daily backups', 'Care plan', 'Care plan', 'Care plan', true, true],
  ['Managed domain', 'Add-on', 'Add-on', 'Add-on', 'Add-on', '1 included'],
  ['Site assistant', 'Add-on', 'Add-on', 'Add-on', 'Add-on', 'Included'],
  ['Monthly edits', 'Care plan', 'Care plan', 'Care plan', false, 'Up to 1 hour'],
  ['Monthly report and priority support', false, false, false, false, true],
];
export const PRICING_NOTES = ['Builds are one-time. Monthly care starts after launch and is separate.', 'Every project gets a written quote before work starts. Starting prices vary by scope.', 'Applicable sales tax is calculated at checkout.', 'Pay over time with Hearth, subject to approval.'];
export function planPrice(plan, yearly) {
  if (plan.billing === 'one_time') return { amount: plan.price, suffix: plan.startingFrom ? 'and up' : 'one-time', yearlyTotal: null };
  return { amount: plan.price, suffix: yearly ? '/month, billed yearly' : '/month', yearlyTotal: yearly ? plan.price * 12 : null };
}
export function formatUsd(n) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
}