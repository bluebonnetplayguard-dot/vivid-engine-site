// Names, numbers and IDs that must never come back. scripts/check-retired-names.mjs fails the build
// if any of these appear anywhere in the repo (site, backend, infra, docs).
// "Bluebonnet Playguard" is NOT retired: it is our legal entity (see src/config/business.ts),
// but it may only be typed in the files listed in LEGAL_NAME_ALLOWED.
export const RETIRED = [
  { text: 'Bluebonnet Construction Group Holdings', why: 'old payment business name' },
  { text: '13372877543', why: 'old WhatsApp number' },
  { text: '337-287-7543', why: 'old WhatsApp number' },
  { text: '(337) 287-7543', why: 'old WhatsApp number' },
  { text: '3372877543', why: 'old WhatsApp number' },
  // Add old Square location IDs here, e.g. { text: 'LXXXXXXXXXXXX', why: 'old Square location' },
];

// The only places the legal name may be written out. Everywhere else, use BUSINESS.legalName
// only inside legal text, or BUSINESS.brandName.
export const LEGAL_NAME = 'Bluebonnet Playguard';
export const LEGAL_NAME_ALLOWED = [
  // config and the guard itself
  'site/src/config/business.ts',
  'site/src/config/retired-names.ts',
  'site/scripts/check-retired-names.mjs',
  // LocalBusiness schema "legalName"
  'site/index.html',
  // legal line, policy pages, Partner Agreement, receipts
  'site/src/pages/Privacy.jsx',
  'site/src/pages/legal/Terms.jsx',
  'site/src/pages/legal/Privacy.jsx',
  'site/src/pages/legal/Refund.jsx',
  'site/src/pages/legal/PartnerAgreement.jsx',
  'site/src/pages/legal/AcceptableUse.jsx',
  'site/src/pages/legal/Cookies.jsx',
  'site/src/pages/legal/Accessibility.jsx',
  'site/src/pages/legal/Dmca.jsx',
  'site/src/pages/legal/AiDisclaimer.jsx',
  'backend/src/shared/knowledge.ts',
  'backend/src/payments/receipts.ts',
];
