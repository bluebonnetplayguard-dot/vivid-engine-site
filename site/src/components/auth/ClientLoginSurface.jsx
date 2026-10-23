import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Image } from '@/components/ui/image';
import '@/components/engine/engine.css';
import '@/components/auth/client-login.css';

export default function ClientLoginSurface({ children, returnTo }) {
  return <div className="engine-site engine-login">
    <Image src="/hero-background.webp" className="engine-login-backdrop" alt="" aria-hidden="true" />
    <Link className="engine-login-back" to="/"><ArrowLeft size={16} aria-hidden="true" />Back to vividenginesolutions.com</Link>
    <main className="engine-login-main"><div className="engine-login-card">
      <div className="engine-login-head"><Image src="/logo-400.webp" className="engine-login-logo" alt="Vivid Engine logo" fittingType="fit" /><span className="engine-caps">Client portal</span><h1>Sign in</h1><p>Manage your website, domain, invoices and support requests.</p></div>
      {children}
      <p className="engine-login-hint">Don’t have an account? <Link to={'/register' + (returnTo !== '/' ? '?returnTo=' + encodeURIComponent(returnTo) : '')}>Create one</Link></p>
    </div></main>
    <footer className="engine-login-footer">© {new Date().getFullYear()} Vivid Engine Solutions · New client? <Link to="/#inquiry">Get a quote</Link></footer>
  </div>;
}