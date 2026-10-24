import React, { useState } from "react";

import { api } from '@/api/client';
import ClientLoginSurface from '@/components/auth/ClientLoginSurface';
import ClientLoginForm from '@/components/auth/ClientLoginForm';
import { PageMeta } from '@/components/SeoSchema';
import { PAGE_SEO } from '@/data/seoSite';

import { safeReturnTo } from "@/lib/authReturnTo";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Post-login destination (e.g. the MCP OAuth consent page sends users here
  // with returnTo so the grant flow can resume). Same-origin paths only.
  const returnTo = safeReturnTo();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.auth.loginViaEmailPassword(email, password);
      window.location.href = returnTo;
    } catch (err) {
      setError(err.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(''); setLoading(true);
    try { await api.auth.loginWithProvider('google', returnTo); }
    catch (err) { setError(err.message || 'Unable to sign in with Google. Please try again.'); setLoading(false); }
  };

  return <>
    <PageMeta {...PAGE_SEO.login} />
    <ClientLoginSurface returnTo={returnTo}>
      <ClientLoginForm email={email} setEmail={setEmail} password={password} setPassword={setPassword} error={error} loading={loading} onSubmit={handleSubmit} onGoogle={handleGoogle} />
    </ClientLoginSurface>
  </>;
}