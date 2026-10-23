// Legal footer for receipts and invoices. This is one of the few places the legal entity name may appear
// (see site/src/config/retired-names.ts): the brand everywhere else, the legal name only on the money paperwork.
export const BRAND_NAME = 'Vivid Engine Solutions';
export const LEGAL_NAME = 'Bluebonnet Playguard, LLC';
export const LEGAL_LINE = `${BRAND_NAME} is a d/b/a of ${LEGAL_NAME}.`;
export const receiptFooter = () => `${LEGAL_LINE} Questions? WhatsApp (281) 826-4068 or info@vividenginesolutions.com.`;
export const AFTERPAY_REFUND_NOTE = 'Afterpay purchases can be refunded through Square for up to 120 days after the purchase date. After 120 days, refund the customer another way and record it here.';
