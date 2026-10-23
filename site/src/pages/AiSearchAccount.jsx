import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '@/api/client';
import { PageMeta, PAGE_META } from '@/components/SeoSchema';
import EngineNav from '@/components/engine/EngineNav';
import '@/components/engine/engine.css';
import '@/components/aisearch/ai-search.css';

function Meter({ label, used, limit }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return <div><div className="ais-row" style={{ borderTop: 0, padding: 0 }}><span>{label}</span><span>{used} of {limit}</span></div>
    <div className="ais-meter" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used}><i style={{ width: `${pct}%` }} /></div></div>;
}

function Team() {
  const [team, setTeam] = useState(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(() => api.aiSearch.team().then(setTeam).catch(e => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const add = async e => {
    e.preventDefault(); setError('');
    try { setTeam(await api.aiSearch.addMember(email.trim())); setEmail(''); } catch (err) { setError(err.message); }
  };
  const remove = async id => {
    if (!window.confirm('Remove this person from your team?')) return;
    try { setTeam(await api.aiSearch.removeMember(id)); } catch (err) { setError(err.message); }
  };
  if (!team) return error ? <div className="ais-error">{error}</div> : null;
  return <section className="ais-panel" aria-labelledby="team-h">
    <h2 id="team-h">Team{team.company_name ? ` · ${team.company_name}` : ''}</h2>
    <p style={{ color: 'var(--muted)', marginBottom: 12 }}>{team.members.length} of {team.seats} seats in use. Teammates sign in with the email you add here. To add more seats, use Manage billing.</p>
    {team.members.map(m => <div key={m.id} className="ais-row">
      <span>{m.email} {m.role === 'owner' ? '(you)' : !m.joined ? '(invited)' : ''}</span>
      <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}><small>{m.questions_this_month} questions this month</small>
        {m.role !== 'owner' && <button type="button" className="engine-button engine-outline" style={{ padding: '6px 14px', minHeight: 36 }} onClick={() => remove(m.id)}>Remove</button>}</span>
    </div>)}
    {team.members.length < team.seats && <form className="ais-inline" onSubmit={add} style={{ marginTop: 12 }}>
      <label htmlFor="seat-email" className="sr-only">Teammate email</label>
      <input id="seat-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="teammate@company.com" />
      <button type="submit" className="engine-button engine-primary">Add teammate</button>
    </form>}
    {error && <div className="ais-error" role="alert">{error}</div>}
  </section>;
}

export default function AiSearchAccount() {
  const [params] = useSearchParams();
  const [me, setMe] = useState(null);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    let tries = 0;
    let timer;
    const load = () => api.aiSearch.me().then(data => {
      setMe(data);
      // Right after checkout, Square's confirmation can take a few seconds to arrive.
      if (params.get('checkout') === 'success' && data.tier.id === 'free' && tries++ < 10) timer = setTimeout(load, 2000);
    }).catch(e => setError(e.message));
    load();
    return () => clearTimeout(timer);
  }, [params]);

  const [confirmCancel, setConfirmCancel] = useState(false);
  const cancelPlan = async () => {
    setOpening(true); setError('');
    try {
      const r = await api.payments.cancel('ai_search');
      setConfirmCancel(false);
      setMe(prev => (prev ? { ...prev, subscription: { ...prev.subscription, cancels_on: r.endsOn } } : prev));
    } catch (e) { setError(e.message); }
    finally { setOpening(false); }
  };

  const sub = me?.subscription;
  return <div className="engine-site">
    <PageMeta {...PAGE_META.aiSearchAccount} noindex />
    <EngineNav />
    <main className="ais-wrap" style={{ maxWidth: 760 }}>
      <header className="ais-head" style={{ textAlign: 'left', margin: '0 0 24px' }}>
        <span className="engine-caps">Vivid AI Search</span>
        <h1>Your plan</h1>
      </header>
      {params.get('checkout') === 'success' && <div className="ais-ok" role="status">Thank you! {me && me.tier.id !== 'free' ? `Your ${me.tier.name} plan is active.` : 'Confirming your payment…'}</div>}
      {error && <div className="ais-error" role="alert">{error}</div>}
      {!me && !error && <p>Loading…</p>}
      {me && <>
        <section className="ais-panel" aria-labelledby="plan-h">
          <h2 id="plan-h">{me.tier.name} · {me.tier.modelLabel}</h2>
          <p style={{ color: 'var(--muted)', marginBottom: 16 }}>
            {me.tier.contributors.length ? `Second opinions from ${me.tier.contributors.join(', ')}. ` : ''}
            {sub?.status && sub.status !== 'active' ? `Billing status: ${sub.status.replace('_', ' ')}. ` : ''}
            {sub?.cancels_on ? `Cancelled: your plan stays on until ${new Date(sub.cancels_on).toLocaleDateString()}. ` : sub?.current_period_end ? `Renews ${new Date(sub.current_period_end).toLocaleDateString()}. ` : ''}
            {sub?.provider && sub.provider !== 'square' ? 'This plan was set up with our previous payment provider; WhatsApp us to change it. ' : ''}
            {me.role === 'member' ? 'You have a seat on your company’s Business plan.' : ''}
          </p>
          <Meter label="Questions today" used={me.usage.today} limit={me.usage.dailyLimit} />
          <Meter label={me.tier.id === 'business' ? 'Team questions this month' : 'Questions this month'} used={me.usage.month} limit={me.usage.monthlyLimit} />
          <div className="ais-inline" style={{ marginTop: 8 }}>
            <Link className="engine-button engine-primary" to="/ai-search">Ask a question</Link>
            {sub?.can_manage_billing && !sub.cancels_on && !confirmCancel && <button type="button" className="engine-button engine-outline" onClick={() => setConfirmCancel(true)}>Cancel plan</button>}
            {sub?.can_manage_billing && <Link className="engine-button engine-outline" to={`/checkout?kind=ai_search&tier=${me.tier.id}&update_card=1`}>Update card</Link>}
            {me.role !== 'member' && me.tier.id !== 'max' && <Link className="engine-button engine-outline" to="/ai-search/pricing">{me.tier.id === 'free' ? 'Upgrade' : 'Compare plans'}</Link>}
          </div>
          {confirmCancel && <div className="ais-locked" role="alertdialog" aria-labelledby="cancel-h" style={{ marginTop: 12 }}>
            <b id="cancel-h">Cancel your plan?</b>
            <span>You keep everything until the end of the period you've paid for. Saved conversations stay readable for 30 days after that.</span>
            <div className="ais-inline"><button type="button" className="engine-button engine-outline" onClick={cancelPlan} disabled={opening}>{opening ? 'Cancelling…' : 'Yes, cancel'}</button><button type="button" className="engine-button engine-primary" onClick={() => setConfirmCancel(false)}>Keep my plan</button></div>
          </div>}
        </section>
        {me.tier.id === 'business' && me.role === 'owner' && <Team />}
      </>}
    </main>
  </div>;
}
