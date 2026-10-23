// Names, numbers and IDs that must never come back. scripts/check-retired-names.mjs fails the build
// if any of these appear in src/, public/, index.html or scripts/.
// "Bluebonnet Playguard" is NOT retired: it is our legal entity (see src/config/business.js),
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
  'src/config/business.js',
  'src/config/retired-names.js',
  'scripts/check-retired-names.mjs',
  'index.html', // LocalBusiness schema "legalName"
  'src/pages/Privacy.jsx',
  'src/pages/Terms.jsx',
  'src/pages/RefundPolicy.jsx',
  'src/pages/PartnerAgreement.jsx',
];
