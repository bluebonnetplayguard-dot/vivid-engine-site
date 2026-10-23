import { useEffect, useRef, useState } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import { api } from '@/api/client';
import { BUSINESS, whatsappUrl } from '@/config/business';
import './square.css';

// Square Web Payments SDK: card, Apple Pay, Google Pay, Cash App Pay and (one-time purchases only) Afterpay.
// Card details never touch our server: Square returns a token, the server prices and charges it.
const SDK = { sandbox: 'https://sandbox.web.squarecdn.com/v1/square.js', production: 'https://web.squarecdn.com/v1/square.js' };
const usd = cents => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

function loadSdk(env) {
  if (window.Square) return Promise.resolve(window.Square);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SDK[env] || SDK.sandbox; s.async = true;
    s.onload = () => (window.Square ? resolve(window.Square) : reject(new Error('Square did not load.')));
    s.onerror = () => reject(new Error('Square could not be loaded. Check your connection and try again.'));
    document.head.appendChild(s);
  });
}

// quote: { mode, totalCents, items, afterpayEligible, description, kind, tier, seats, companyName, invoiceId, reference }
// purchase: the body to send with the token (same fields used for the quote)
export default function SquareCheckout({ quote, purchase, email, onPaid }) {
  const cardRef = useRef(null);
  const walletRef = useRef(null);
  const afterpayRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [wallets, setWallets] = useState([]);
  const [afterpay, setAfterpay] = useState(false);
  const idem = useRef(uuid());
  const state = useRef({ card: null, methods: {} });

  const pay = async (method, tokenResult) => {
    if (tokenResult?.status !== 'OK' || !tokenResult.token) {
      setError(tokenResult?.errors?.[0]?.message || 'The payment details could not be verified. Check them and try again.');
      return;
    }
    setBusy(true); setError('');
    try {
      const body = { ...purchase, source_id: tokenResult.token, method, email, idempotency_key: idem.current, amount_cents: quote.totalCents };
      const result = quote.mode === 'card_update' ? await api.payments.updateCard(purchase.kind, body)
        : quote.mode === 'subscription' ? await api.payments.subscribe(body) : await api.payments.charge(body);
      onPaid?.(result, method);
    } catch (e) {
      setError(e?.message || 'The payment did not go through.');
      idem.current = uuid();   // a new attempt must get a new key
    } finally { setBusy(false); }
  };

  useEffect(() => {
    let cancelled = false; let cleanups = [];
    (async () => {
      try {
        const cfg = await api.payments.config();
        if (!cfg.configured) throw new Error('Payments are not switched on yet. WhatsApp us and we will send you a pay link.');
        const Square = await loadSdk(cfg.environment);
        if (cancelled) return;
        const payments = Square.payments(cfg.applicationId, cfg.locationId);
        const card = await payments.card();
        await card.attach(cardRef.current);
        state.current.card = card;
        cleanups.push(() => card.destroy?.());

        const request = () => payments.paymentRequest({
          countryCode: 'US', currencyCode: 'USD', total: { amount: (quote.totalCents / 100).toFixed(2), label: BUSINESS.brandName },
          requestBillingContact: false, requestShippingContact: false,
        });
        // Wallets are optional: each one is tried and hidden if this browser or account can't use it.
        const found = [];
        if (quote.mode === 'payment') for (const [id, make] of [['apple_pay', () => payments.applePay(request())], ['google_pay', () => payments.googlePay(request())], ['cash_app_pay', () => payments.cashAppPay(request(), { redirectURL: window.location.href, referenceId: purchase?.reference || 'vivid' })]]) {
          try { const m = await make(); state.current.methods[id] = m; found.push(id); } catch { /* not available here */ }
        }
        if (cancelled) return;
        setWallets(found);
        // Afterpay: one-time purchases only, inside Square's limits, and only when Afterpay says it's eligible.
        if (quote.mode === 'payment' && quote.afterpayEligible) {
          try {
            const ap = await payments.afterpayClearpay(request());
            await ap.attach(afterpayRef.current);
            state.current.methods.afterpay = ap;
            cleanups.push(() => ap.destroy?.());
            ap.addEventListener('ontokenization', e => pay('afterpay', e.detail.tokenResult));
            setAfterpay(true);
          } catch { setAfterpay(false); }
        }
        setReady(true);
      } catch (e) { if (!cancelled) setError(e.message); }
    })();
    return () => { cancelled = true; cleanups.forEach(fn => { try { fn(); } catch { /* ignore */ } }); };
  }, [quote.totalCents, quote.mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Mount wallet buttons once their methods exist.
    (async () => {
      for (const id of wallets) {
        const el = walletRef.current?.querySelector(`[data-wallet="${id}"]`);
        const m = state.current.methods[id];
        if (el && m && !el.dataset.mounted) { try { await m.attach(el); el.dataset.mounted = '1'; } catch { el.hidden = true; } }
      }
    })();
  }, [wallets]);

  const submitCard = async e => {
    e.preventDefault();
    if (!state.current.card || busy) return;
    pay('card', await state.current.card.tokenize());
  };
  const payWallet = async id => {
    const m = state.current.methods[id]; if (!m || busy) return;
    pay(id, await m.tokenize());
  };

  return <form className="sq" onSubmit={submitCard} aria-busy={busy}>
    {quote.mode !== 'card_update' && <div className="sq-total"><span>{quote.mode === 'subscription' ? 'Each month' : 'Total today'}</span><strong>{usd(quote.totalCents)}</strong></div>}
    <ul className="sq-items">{quote.items.map(i => <li key={i.id + i.name}><span>{i.name}</span><span>{usd(i.cents)}</span></li>)}</ul>
    {wallets.length > 0 && <div ref={walletRef} className="sq-wallets">
      {wallets.map(id => <div key={id} data-wallet={id} className={`sq-wallet sq-${id}`} role="button" tabIndex={0} aria-label={`Pay with ${id.replace('_', ' ')}`} onClick={() => payWallet(id)} onKeyDown={e => e.key === 'Enter' && payWallet(id)} />)}
    </div>}
    {quote.mode === 'payment' && <div ref={afterpayRef} className="sq-afterpay" hidden={!afterpay} />}
    {afterpay && <p className="sq-note">Afterpay: 4 interest-free payments. Available on one-time purchases only.</p>}
    <label className="sq-label" htmlFor="sq-card">Card</label>
    <div id="sq-card" ref={cardRef} className="sq-card" />
    <button type="submit" className="engine-button engine-primary sq-pay" disabled={!ready || busy}>
      <Lock size={15} aria-hidden="true" />{busy ? 'Processing…' : quote.mode === 'card_update' ? 'Save new card' : quote.mode === 'subscription' ? `Start plan · ${usd(quote.totalCents)}/month` : `Pay ${usd(quote.totalCents)}`}
    </button>
    {error && <p className="ais-error" role="alert">{error}</p>}
    <p className="sq-fine"><ShieldCheck size={14} aria-hidden="true" />Processed by Square for {BUSINESS.brandName}. Your card details go straight to Square and are never stored by us.{quote.mode === 'subscription' ? ' Cancel any time from your account page.' : ''}</p>
    <p className="sq-fine">Questions before you pay? <a href={whatsappUrl(`Hi Vivid Engine, I have a question before paying for ${quote.description}`)} target="_blank" rel="noopener noreferrer">WhatsApp us</a> at {BUSINESS.whatsappDisplay}.</p>
  </form>;
}
