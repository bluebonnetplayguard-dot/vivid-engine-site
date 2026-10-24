import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';
import { useAuth } from '@/lib/AuthContext';
import SEO from '@/components/seo/SEO';
import EngineNav from '@/components/engine/EngineNav';
import EngineFooter from '@/components/engine/EngineFooter';
import SquareCheckout from '@/components/payments/SquareCheckout';
import { BUSINESS, whatsappUrl } from '@/config/business';
import '@/components/engine/engine.css';
import '@/components/aisearch/ai-search.css';

// /checkout?kind=ai_search&tier=search_pro&cycle=annual|monthly|two_year[&seats=3&company=...]   (plans, signed in)
// /checkout?invoice=<id>                                          (pay an approved invoice)
// /checkout?plan=starter&cycle=monthly&add_ons=a,b                (website plans and add-ons)
export default function Checkout() {
  const [params] = useSearchParams();
  const { isAuthenticated, user } = useAuth();
  const purchase = useMemo(() => {
    const kind = params.get('kind');
    if (kind && params.get('update_card')) return { kind, update_card: true, reference: `${kind}:card` };
    if (kind) return { kind, tier: params.get('tier') || '', cycle: params.get('cycle') || 'annual', seats: Number(params.get('seats') || 1), company_name: params.get('company') || '', reference: `${kind}:${params.get('tier') || ''}` };
    if (params.get('invoice')) return { kind: 'invoice', invoice_id: params.get('invoice'), reference: params.get('invoice') };
    return { kind: 'catalog', plan_id: params.get('plan') || '', billing_cycle: params.get('cycle') || 'monthly', add_on_ids: (params.get('add_ons') || '').split(',').filter(Boolean), reference: params.get('plan') || '' };
  }, [params]);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(null);
  const needsSignIn = (purchase.kind === 'ai_search' || purchase.kind === 'video_studio') && !isAuthenticated;

  useEffect(() => {
    if (needsSignIn) return;
    setError(''); setQuote(null);
    if (purchase.update_card) { setQuote({ mode: 'card_update', totalCents: 0, items: [], description: 'Update the card on your plan', afterpayEligible: false }); return; }
    api.payments.quote(purchase).then(setQuote).catch(e => setError(e?.message || 'This purchase could not be priced.'));
  }, [purchase, needsSignIn]);
  useEffect(() => { if (user?.email && !email) setEmail(user.email); }, [user?.email]); // eslint-disable-line react-hooks/exhaustive-deps

  const accountPath = purchase.kind === 'video_studio' ? '/video/account' : '/ai-search/account';
  return <div className="engine-site">
    <SEO path="/checkout" noindex />
    <EngineNav />
    <main className="ais-wrap" style={{ maxWidth: 760 }}>
      <header className="ais-head" style={{ textAlign: 'left', margin: '0 0 20px' }}>
        <span className="engine-caps">Secure checkout</span>
        <h1>{quote ? quote.description : 'Checkout'}</h1>
      </header>
      {needsSignIn && <section className="ais-panel"><p>Sign in to start a plan, so it's tied to your account.</p>
        <button type="button" className="engine-button engine-primary" onClick={() => api.auth.redirectToLogin(`${window.location.pathname}${window.location.search}`)}>Sign in</button></section>}
      {error && <div className="ais-error" role="alert">{error} <a href={whatsappUrl('Hi Vivid Engine, I had a problem at checkout: ')} target="_blank" rel="noopener noreferrer">WhatsApp us</a> and we'll sort it out.</div>}
      {!needsSignIn && !quote && !error && <p>Pricing your order…</p>}
      {done && <section className="ais-panel" aria-live="polite">
        <h2>{quote.mode === 'card_update' ? 'Card updated' : done.method === 'afterpay' ? 'Afterpay payment received' : quote.mode === 'subscription' ? 'Your plan is active' : 'Payment received'}</h2>
        <p>{quote.mode === 'card_update' ? `Future renewals will use the card ending in ${done.card?.last4 || '…'}.` : quote.mode === 'subscription' ? `Thank you. Your plan renews every ${quote.periodLabel || 'month'}${done.chargedThrough ? ` and is paid through ${done.chargedThrough}` : ''}.` : `Thank you. ${done.receiptUrl ? 'Square has emailed your receipt.' : 'A receipt is on its way from Square.'}`}</p>
        <div className="ais-inline">
          {quote.mode !== 'payment' ? <Link className="engine-button engine-primary" to={accountPath}>Go to your plan</Link> : <Link className="engine-button engine-primary" to="/">Back to Vivid Engine</Link>}
          {done.receiptUrl && <a className="engine-button engine-outline" href={done.receiptUrl} target="_blank" rel="noopener noreferrer">View receipt</a>}
        </div>
      </section>}
      {quote && !done && <section className="ais-panel">
        {quote.mode === 'payment' && !isAuthenticated && <label className="ais-field">Email for your receipt<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required /></label>}
        <SquareCheckout quote={quote} purchase={purchase} email={email} onPaid={(result, method) => setDone({ ...result, method })} />
      </section>}
      <p className="ais-fine">Prices in USD. {quote?.mode === 'subscription' ? 'Plans renew automatically until you cancel; no Afterpay on plans.' : 'One-time purchases can use Afterpay where eligible.'} Receipts come from {BUSINESS.brandName}. <Link to="/legal/refund">Refund policy</Link>.</p>
    </main>
    <EngineFooter />
  </div>;
}
