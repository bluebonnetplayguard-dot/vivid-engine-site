// Single source of truth for who the business is and how to reach it.
// brandName: everywhere customers see the business (header, checkout, receipts, emails, schema "name", WhatsApp).
// legalName: only where the law needs it (footer legal line, Terms, Privacy, Refund Policy,
// Partner Advertising Agreement, legal footer on receipts and invoices, schema "legalName").
// scripts/check-retired-names.mjs fails the build if "Bluebonnet Playguard" is typed anywhere else.
export const BUSINESS = {
  brandName: 'Vivid Engine Solutions',
  legalName: 'Bluebonnet Playguard, LLC',
  legalLine: 'Vivid Engine Solutions is a d/b/a of Bluebonnet Playguard, LLC.',

  whatsappNumber: '12818264068', // +1 (281) 826-4068
  whatsappLink: 'https://wa.me/12818264068',
  whatsappDisplay: '(281) 826-4068',
  whatsappTelephone: '+1-281-826-4068',
  whatsappDefaultMessage: 'Hi Vivid Engine, I have a question about ',
};

// WhatsApp link with a pre-filled message: https://wa.me/12818264068?text=<url-encoded message>
export const whatsappUrl = (message = BUSINESS.whatsappDefaultMessage) =>
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
