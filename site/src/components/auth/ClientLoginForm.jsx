import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import GoogleIcon from '@/components/GoogleIcon';

export default function ClientLoginForm({ email, setEmail, password, setPassword, loading, error, onSubmit, onGoogle }) {
  const [visible, setVisible] = useState(false);
  return <>
    <form className="engine-login-form" onSubmit={onSubmit} aria-busy={loading}>
      <div className="engine-login-field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="you@business.com" value={email} onChange={event => setEmail(event.target.value)} required disabled={loading} autoFocus /></div>
      <div className="engine-login-field"><div className="engine-login-row"><label htmlFor="password">Password</label><Link to="/forgot-password">Forgot password?</Link></div>
        <div className="engine-login-password"><input id="password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••" value={password} onChange={event => setPassword(event.target.value)} required disabled={loading} /><button type="button" aria-controls="password" aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? 'Hide' : 'Show'}</button></div>
      </div>
      <button className="engine-button engine-primary" type="submit" disabled={loading}>{loading && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}{loading ? 'Signing in…' : 'Sign in'}</button>
    </form>
    <div className="engine-login-divider">or</div>
    <button className="engine-button engine-outline" type="button" disabled={loading} onClick={onGoogle}><GoogleIcon className="h-5 w-5" />Continue with Google</button>
    <p className="engine-login-message" role="status" aria-live="polite">{error}</p>
  </>;
}