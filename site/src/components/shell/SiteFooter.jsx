import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { footerColumns } from '@/config/navigation';
import { BUSINESS } from '@/config/business';
import { useLang } from '@/lib/lang';
import InstallApp from '@/components/InstallApp';
import { WhatsAppLink } from '@/components/shell/WhatsAppButton';
import { openCookieSettings } from '@/components/shell/CookieConsent';

// Footer columns come from config/navigation.ts. Engine names are plain text: no logos, no implied endorsement.
export default function SiteFooter() {
  const { lang } = useLang();
  return <footer className="vs-footer">
    <div className="vs-fcols">
      {footerColumns(lang).map(col => <div key={col.title}>
        <h2 className="engine-caps">{col.title}</h2>
        <ul>{col.links.map(l => <li key={l.label + l.to}><Link to={l.to}>{l.label}</Link></li>)}</ul>
      </div>)}
    </div>
    <div className="vs-fbar">
      <span className="vs-badge"><MapPin size={15} aria-hidden="true" />{BUSINESS.regionLine}</span>
      <span>WhatsApp: <WhatsAppLink placement="footer">{BUSINESS.whatsappDisplay}</WhatsAppLink></span>
      <span>{lang === 'es' ? 'Respuestas con Perplexity, Claude y Gemini' : 'Answers powered by Perplexity, Claude and Gemini'}</span>
      <span>© {new Date().getFullYear()} {BUSINESS.brandName}</span>
      <button type="button" className="vs-cookie-link" onClick={openCookieSettings}>{lang === 'es' ? 'Cookies' : 'Cookie settings'}</button>
      <span className="vs-legal">{BUSINESS.legalLine}</span>
    </div>
    <InstallApp className="vs-install" />
  </footer>;
}
