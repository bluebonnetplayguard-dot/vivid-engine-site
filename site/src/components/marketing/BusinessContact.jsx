import { MessageCircle, Phone } from 'lucide-react';
import { SITE } from '@/data/seoSite';
import { BUSINESS, whatsappUrl } from '@/config/business';
import { api } from '@/api/client';

export default function BusinessContact({ placement }) {
  const trackCall = () => api.analytics.track({ eventName: 'click_to_call', properties: { placement } });
  const trackWhatsApp = () => api.analytics.track({ eventName: 'click_to_whatsapp', properties: { placement } });
  const { streetAddress, addressLocality, addressRegion, postalCode } = SITE.address;
  return (
    <address className="my-6 flex flex-col items-center gap-3 text-center text-sm not-italic text-muted-foreground">
      <p><strong className="text-foreground">{SITE.name}</strong><br />{streetAddress}<br />{addressLocality}, {addressRegion} {postalCode}</p>
      <a href={`mailto:${SITE.email}`} className="break-all underline underline-offset-4">{SITE.email}</a>
      <a href={`tel:${SITE.telephone}`} onClick={trackCall} className="hidden underline underline-offset-4 sm:inline">{SITE.displayPhone}</a>
      <a href={`tel:${SITE.telephone}`} onClick={trackCall} className="mk-btn inline-flex min-h-11 items-center justify-center gap-2 sm:hidden">
        <Phone size={18} aria-hidden="true" />Call {SITE.displayPhone}
      </a>
      <a href={whatsappUrl()} target="_blank" rel="noopener noreferrer" onClick={trackWhatsApp} className="inline-flex min-h-11 items-center gap-2 underline underline-offset-4" aria-label={`Chat with ${BUSINESS.brandName} on WhatsApp at ${BUSINESS.whatsappDisplay}`}>
        <MessageCircle size={18} aria-hidden="true" />WhatsApp: {BUSINESS.whatsappDisplay}
      </a>
    </address>
  );
}