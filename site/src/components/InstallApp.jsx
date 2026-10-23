import { useEffect, useState } from 'react';
import { api } from '@/api/client';

// Shows an "Install the app" button when the browser can install the site
// (Chrome/Edge on Android, Windows, Mac, ChromeOS) and Add to Home Screen
// instructions on iPhone/iPad. Hidden once installed or when already running
// as the installed app.
export default function InstallApp({ className = '' }) {
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
  return <div className={className} style={{ marginTop: 20 }}>
    <button type="button" className="engine-button engine-outline" onClick={install} aria-expanded={prompt ? undefined : hint} aria-controls={prompt ? undefined : 'install-hint'}>Install the app</button>
    {hint && <p id="install-hint" role="status" style={{ marginTop: 12 }}>In Safari, tap the Share button, then <strong>Add to Home Screen</strong>.</p>}
  </div>;
}
