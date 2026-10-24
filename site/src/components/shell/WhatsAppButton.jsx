import { BUSINESS, whatsappUrl } from '@/config/business';
import { api } from '@/api/client';

// Floating WhatsApp button beside the chat bubble. `message` pre-fills the chat for this page.
export default function WhatsAppButton({ message, placement = 'floating' }) {
  return <a className="vs-wa" href={whatsappUrl(message)} target="_blank" rel="noopener noreferrer"
    aria-label={`Chat with ${BUSINESS.brandName} on WhatsApp`}
    onClick={() => api.analytics?.track?.({ eventName: 'whatsapp_click', properties: { placement, path: typeof window !== 'undefined' ? window.location.pathname : '' } })}>
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="currentColor"><path d="M12 2.5a9.5 9.5 0 0 0-8.2 14.3L2.5 21.5l4.8-1.3A9.5 9.5 0 1 0 12 2.5zm0 17.3a7.8 7.8 0 0 1-4-1.1l-.3-.2-2.8.8.8-2.7-.2-.3A7.8 7.8 0 1 1 12 19.8zm4.3-5.8c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.4 6.4 0 0 1-3.2-2.8c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5a.9.9 0 0 0-.7.3 2.8 2.8 0 0 0-.9 2.1 4.9 4.9 0 0 0 1 2.6 11.2 11.2 0 0 0 4.3 3.8c1.6.7 2.2.7 3 .6.5-.1 1.4-.6 1.6-1.1.2-.6.2-1 .1-1.1l-.4-.2z" /></svg>
  </a>;
}

// An inline "WhatsApp us" link that counts the click the same way.
export function WhatsAppLink({ message, placement, children, className }) {
  return <a className={className} href={whatsappUrl(message)} target="_blank" rel="noopener noreferrer"
    onClick={() => api.analytics?.track?.({ eventName: 'whatsapp_click', properties: { placement } })}>{children || `WhatsApp us at ${BUSINESS.whatsappDisplay}`}</a>;
}
