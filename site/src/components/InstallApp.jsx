import { useEffect, useState } from 'react';
import { api } from '@/api/client';

export default function InstallApp() {
  const [prompt, setPrompt] = useState(null);
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [hint, setHint] = useState(false);
  useEffect(() => {
    const mode = window.matchMedia('(display-mode: standalone)');
    setInstalled(mode.matches || Boolean(navigator.standalone));
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
    const ready = event => { event.preventDefault(); setPrompt(event); };
    const done = () => { setInstalled(true); setPrompt(null); api.analytics.track({ eventName: 'pwa_installed' }); };
    const changed = () => setInstalled(mode.matches || Boolean(navigator.standalone));
    window.addEventListener('beforeinstallprompt', ready);
    window.addEventListener('appinstalled', done);
    mode.addEventListener('change', changed);
    return () => { window.removeEventListener('beforeinstallprompt', ready); window.removeEventListener('appinstalled', done); mode.removeEventListener('change', changed); };
  }, []);
  async function install() {
    if (!prompt) { setHint(value => !value); return; }
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    api.analytics.track({ eventName: 'pwa_install_prompt', properties: { outcome } });
    setPrompt(null);
  }
  if (installed || (!prompt && !ios)) return null;
  return <div className="mt-5"><button type="button" className="mk-btn" onClick={install} aria-describedby={hint ? 'install-hint' : undefined}>Install app</button>{hint && <p id="install-hint" className="mt-3" role="status">On iPhone or iPad, open this site in Safari, tap Share, then Add to Home Screen.</p>}</div>;
}