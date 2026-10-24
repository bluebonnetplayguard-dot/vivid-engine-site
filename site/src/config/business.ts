// Single source of truth for who the business is and how to reach it.
// brandName: everywhere customers see the business (header, checkout, receipts, emails, schema "name", WhatsApp).
// legalName: only where the law needs it (footer legal line, Terms, Privacy, Refund Policy,
// Partner Advertising Agreement, legal footer on receipts and invoices, schema "legalName").
// scripts/check-retired-names.mjs (npm run check:names) fails the build if "Bluebonnet Playguard" is typed anywhere else.
export const BUSINESS = {
  brandName: 'Vivid Engine Solutions',
  legalName: 'Bluebonnet Playguard, LLC',
  legalLine: 'Vivid Engine Solutions is a d/b/a of Bluebonnet Playguard, LLC.',
  domain: 'https://vividenginesolutions.com',

  whatsappNumber: '12818264068', // +1 (281) 826-4068
  whatsappLink: 'https://wa.me/12818264068',
  whatsappDisplay: '(281) 826-4068',
  whatsappTelephone: '+1-281-826-4068',
  whatsappDefaultMessage: 'Hi Vivid Engine, I have a question about ',

  // The release brief lists nine service-area cities but its copy was cut off after Beaumont.
  // Lake Charles and Lafayette are the two the site already serves: CONFIRM before launch.
  serviceAreas: ['Houston', 'Waller', 'Katy', 'Pearland', 'Sugar Land', 'Winnie', 'Beaumont', 'Lake Charles', 'Lafayette'],
  regionLine: 'Serving Greater Houston, SE Texas & SW Louisiana',
  brandLine: 'Locally Owned. Personally Built. Professionally Maintained.',
} as const;

// URL slug for a service-area city: "Sugar Land" -> "sugar-land".
export const citySlug = (city: string) => city.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// WhatsApp link with a pre-filled message: https://wa.me/12818264068?text=<url-encoded message>
export const whatsappUrl = (message: string = BUSINESS.whatsappDefaultMessage) =>
  `${BUSINESS.whatsappLink}?text=${encodeURIComponent(message)}`;

// LocalBusiness contactPoint for the WhatsApp line.
export const whatsappContactPoint = {
  '@type': 'ContactPoint',
  contactType: 'customer service',
  name: 'WhatsApp',
  telephone: BUSINESS.whatsappTelephone,
  url: BUSINESS.whatsappLink,
  availableLanguage: 'English',
};
