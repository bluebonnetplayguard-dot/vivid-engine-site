import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

// Asks once whether analytics may run. Needed cookies (sign-in, security, settings) are always on.
// The choice is kept in this browser; "Cookie settings" in the footer opens this again.
export const CONSENT_KEY = 've-cookie-consent';
export const readConsent = () => { try { return localStorage.getItem(CONSENT_KEY); } catch { return null; } };
export const analyticsAllowed = () => readConsent() === 'all';

export default function CookieConsent() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!readConsent()) setOpen(true);
    const reopen = () => setOpen(true);
    window.addEventListener('ve-cookie-settings', reopen);
    return () => window.removeEventListener('ve-cookie-settings', reopen);
  }, []);
  const choose = v => { try { localStorage.setItem(CONSENT_KEY, v); } catch { /* private window: ask again next time */ } setOpen(false); };
  if (!open) return null;
  return <div className="vs-cookie" role="dialog" aria-modal="false" aria-labelledby="vs-cookie-h">
    <p id="vs-cookie-h"><b>Cookies</b> We use cookies that keep you signed in and the site secure. With your OK we also count visits and clicks to improve the site. No advertising profiles. <Link to="/legal/cookies">Cookie Policy</Link></p>
    <div><button type="button" className="engine-button engine-outline" onClick={() => choose('necessary')}>Only necessary</button><button type="button" className="engine-button engine-primary" onClick={() => choose('all')}>Allow analytics</button></div>
  </div>;
}
export const openCookieSettings = () => window.dispatchEvent(new Event('ve-cookie-settings'));
