// What can be bought online today. Website Builder and App Builder are priced and listed, but the products
// are not live in this release, so their plans (and the bundles that contain them) take early-access sign-ups
// instead of payments. Flip a flag to true once that product ships; nothing else needs to change.
export const SELF_SERVE_LIVE = {
  search: true,
  websites: false,
  appBuilder: false,
} as const;

// Where "Book a free consultation" and "Join early access" go. One place to change when the routes move.
export const consultationHref = (plan?: string) => `/contact?topic=consultation${plan ? `&plan=${encodeURIComponent(plan)}` : ''}`;
export const earlyAccessHref = (plan: string) => `/contact?topic=early-access&plan=${encodeURIComponent(plan)}`;
export const partnerApplyHref = (tier?: string) => `/contact?topic=partner${tier ? `&plan=${encodeURIComponent(tier)}` : ''}`;
