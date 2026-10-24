import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';
import { PageMeta } from '@/components/SeoSchema';
import { PAGE_SEO } from '@/data/seoSite';
import DeletionRequestForm from '@/components/account/DeletionRequestForm';
const EMAIL = 'info@vividenginesolutions.com';
const mailto = `mailto:${EMAIL}?subject=${encodeURIComponent('Delete my Vivid Engine Solutions account')}&body=${encodeURIComponent('Please delete my account and personal data.\n\nThe email address on my account is: \n')}`;
export default function DeleteAccount() {
  const [user, setUser] = useState(undefined);
  useEffect(() => { api.auth.isAuthenticated().then(authed => authed ? api.auth.me() : null).then(setUser).catch(() => setUser(null)); }, []);
  return <main className="min-h-screen bg-background text-foreground"><div className="mx-auto max-w-2xl px-4 py-14">
    <PageMeta {...PAGE_SEO.deleteAccount} />
    <Link to="/" className="text-sm text-primary underline">Vivid Engine Solutions</Link>
    <h1 className="mt-6 font-heading text-3xl font-bold">Delete your Vivid Engine Solutions account</h1>
    <p className="mt-3 text-muted-foreground">Request account and personal-data deletion here without reinstalling the app. Our team processes requests within 30 days, subject to identity verification and legal retention requirements.</p>
    <section className="mt-8 rounded-2xl border border-border bg-card p-6">
      {user === undefined && <p role="status">Checking whether you're signed in…</p>}
      {user && <DeletionRequestForm user={user} mailto={mailto} />}
      {user === null && <><h2 className="text-xl font-semibold">Two ways to request deletion</h2><ol className="mt-3 list-decimal space-y-3 pl-5"><li><Link to="/login?returnTo=%2Fdelete-account" className="text-primary underline">Sign in to request deletion</Link>. You'll return here after signing in. You can also open Settings → Account deletion in the app.</li><li>Can't sign in? <a href={mailto} className="text-primary underline">Email a deletion request</a> from your account address, with the subject “Delete my account”. We verify your identity before deleting anything.</li></ol></>}
    </section>
    <section className="mt-8 space-y-5 text-sm text-muted-foreground">
      <div><h2 className="text-lg font-semibold text-foreground">What we delete</h2><p>Your login and profile, contact information, and associated personal messages, notes, uploads and preferences, where held by this app and not required for legal retention.</p></div>
      <div><h2 className="text-lg font-semibold text-foreground">What we keep, and for how long</h2><p>Invoices, payment records and signed agreements may be retained for applicable tax, accounting or legal obligations. Retention depends on the record and applicable law; we explain any exceptions when processing your request and delete records when retention is no longer required. Card details are handled by our payment processor, not stored by us.</p></div>
      <p>Questions? <a href={mailto} className="text-primary underline">Email the account-deletion team</a>. Read our <Link to="/privacy" className="text-primary underline">privacy policy</Link>.</p>
    </section>
  </div></main>;
}