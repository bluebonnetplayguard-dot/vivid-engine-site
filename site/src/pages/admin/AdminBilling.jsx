import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Bell, CheckCircle2, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { api } from '@/api/client';
import { PageMeta, PAGE_META } from '@/components/SeoSchema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import RadixSelect from '@/components/admin/RadixSelect';

// Admin > AI Billing. Every number comes from /api/admin/billing/*. No keys and no prompt text ever reach this page.
const money = (n, digits = 2) => (n == null || Number.isNaN(Number(n)) ? 'n/a' : Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: Math.max(digits, n && Math.abs(n) < 1 ? 4 : digits) }));
const when = d => (d ? new Date(d).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'never');
const PROVIDER_COLORS = ['#3b82f6', '#22d3ee', '#a78bfa', '#f59e0b', '#10b981', '#f472b6'];
const LEVEL = { green: 'border-emerald-500/50', amber: 'border-amber-500/60', red: 'border-red-500/70', none: 'border-border' };
const LEVEL_LABEL = { green: 'On budget', amber: 'Getting close', red: 'Over or paused', none: 'No budget set' };
const PERIODS = [{ value: 'day', label: 'Today' }, { value: 'week', label: 'Last 7 days' }, { value: 'month', label: 'This month' }];
const SEVERITY = { critical: 'bg-red-500/15 text-red-400', warn: 'bg-amber-500/15 text-amber-400', info: 'bg-sky-500/15 text-sky-300' };

function Card({ label, value, sub }) {
  return <div className="rounded-2xl border border-border bg-card p-5"><div className="text-sm text-muted-foreground">{label}</div><div className="mt-2 font-heading text-2xl font-bold">{value}</div>{sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}</div>;
}
function Section({ title, hint, children, id }) {
  return <section id={id} className="mt-10"><h2 className="font-heading text-lg font-bold">{title}</h2>{hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}<div className="mt-4">{children}</div></section>;
}

function ProviderTile({ p }) {
  const s = p.snapshots || {};
  const lines = [];
  let title = p.id;
  if (p.id === 'digitalocean') {
    title = 'DigitalOcean';
    lines.push(['Month to date', money(s.do_month_to_date_usage?.value)], ['Account balance', money(s.do_account_balance?.value)]);
    if (s.do_line_bandwidth) lines.push(['Bandwidth line', money(s.do_line_bandwidth.value)]);
  } else if (p.id === 'claude') {
    title = 'Claude (Anthropic)';
    const mtd = s.anthropic_mtd_cost_usd?.value;
    lines.push(['Month to date', money(mtd ?? p.ours_month_usd)], [mtd == null ? 'From our log' : 'From Anthropic', mtd == null ? `${p.ours_requests} calls` : `ours ${money(p.ours_month_usd)}`]);
  } else if (p.id === 'deepseek') {
    title = 'DeepSeek';
    lines.push(['Balance', money(s.deepseek_balance?.value)], ['Available', s.deepseek_available?.value === 1 ? 'yes' : 'no']);
  } else if (p.id === 'gemini') {
    title = 'Gemini (Google)';
    lines.push(['Month to date (our log)', money(p.ours_month_usd)]);
    if (s.gcp_budget_usd) lines.push(['Google Cloud budget', `${money(s.gcp_cost_usd?.value)} of ${money(s.gcp_budget_usd.value)}`]);
  } else {
    title = p.id[0].toUpperCase() + p.id.slice(1);
    lines.push(['Month to date (our log)', money(p.ours_month_usd)], ['Calls', String(p.ours_requests)]);
  }
  if (p.budget) lines.push(['Limit', `${money(p.budget.amount, 0)} (${p.budget.pct.toFixed(0)}%)${p.budget.hard_stop ? ' · hard stop' : ''}`]);
  return (
    <div className={`rounded-2xl border-2 bg-card p-5 ${LEVEL[p.level] || LEVEL.none}`}>
      <div className="flex items-center justify-between gap-2"><div className="font-heading font-bold">{title}</div><span className="text-xs text-muted-foreground">{p.paused ? 'Paused' : LEVEL_LABEL[p.level]}</span></div>
      <dl className="mt-3 space-y-1 text-sm">{lines.map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>)}</dl>
      {p.paused && <p className="mt-3 flex items-start gap-2 rounded-lg bg-red-500/10 p-2 text-xs text-red-300"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> {p.paused.reason || 'Billing problem'}. Calls go to another provider.</p>}
    </div>
  );
}

function BreakdownTable({ rows, label }) {
  if (!rows?.length) return <p className="p-4 text-sm text-muted-foreground">Nothing yet for this period.</p>;
  return (
    <div className="overflow-x-auto"><table className="w-full text-sm">
      <thead><tr className="text-left text-muted-foreground"><th className="p-2 font-medium">{label}</th><th className="p-2 text-right font-medium">Calls</th><th className="p-2 text-right font-medium">Cost</th><th className="p-2 text-right font-medium">Per call</th><th className="p-2 text-right font-medium">No price yet</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.key} className="border-t border-border"><td className="p-2">{r.key}</td><td className="p-2 text-right">{r.requests}</td><td className="p-2 text-right font-medium">{money(r.usd)}</td><td className="p-2 text-right">{money(r.usd_per_request, 4)}</td><td className="p-2 text-right">{r.pending || ''}</td></tr>)}</tbody>
    </table></div>
  );
}

function BudgetsEditor({ budgets, reload }) {
  const { toast } = useToast();
  const blank = { scope: 'global', scope_ref: '', period: 'month', amount_usd: '', hard_stop: false };
  const [form, setForm] = useState(blank);
  const save = async e => {
    e.preventDefault();
    try { await api.billing.saveBudget({ ...form, amount_usd: Number(form.amount_usd), warn_pcts: [50, 80, 100] }); setForm(blank); reload(); toast({ title: 'Budget saved' }); }
    catch (err) { toast({ variant: 'destructive', title: err.message || 'Could not save' }); }
  };
  const patch = async (id, body, msg) => { try { await api.billing.patchBudget(id, body); reload(); toast({ title: msg }); } catch (err) { toast({ variant: 'destructive', title: err.message || 'Could not save' }); } };
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead><tr className="text-left text-muted-foreground"><th className="p-2 font-medium">What</th><th className="p-2 font-medium">Per</th><th className="p-2 font-medium">Limit</th><th className="p-2 font-medium">At the limit</th><th className="p-2 font-medium" /></tr></thead>
        <tbody>{budgets.map(b => (
          <tr key={b.id} className={`border-t border-border ${b.enabled ? '' : 'opacity-50'}`}>
            <td className="p-2">{b.scope === 'global' ? 'All AI spend' : `${b.scope}: ${b.scope_ref}`}</td>
            <td className="p-2">{b.period}</td>
            <td className="p-2"><Input aria-label={`Limit for ${b.scope} ${b.scope_ref} ${b.period}`} className="h-8 w-28" type="number" min="1" step="1" defaultValue={b.amount_usd} onBlur={e => Number(e.target.value) !== Number(b.amount_usd) && Number(e.target.value) > 0 && patch(b.id, { amount_usd: Number(e.target.value) }, 'Limit updated')} /></td>
            <td className="p-2"><label className="flex items-center gap-2"><input type="checkbox" checked={b.hard_stop} onChange={e => patch(b.id, { hard_stop: e.target.checked }, e.target.checked ? 'Hard stop on' : 'Alerts only')} /> {b.hard_stop ? 'Block or switch provider' : 'Alert only'}</label>
              {b.override_until && new Date(b.override_until) > new Date() && <span className="text-xs text-amber-400">Stop lifted until {when(b.override_until)}</span>}</td>
            <td className="space-x-2 p-2 text-right">
              {b.hard_stop && <Button size="sm" variant="outline" onClick={() => patch(b.id, { override_hours: b.override_until && new Date(b.override_until) > new Date() ? 0 : 24 }, 'Override changed')}>{b.override_until && new Date(b.override_until) > new Date() ? 'End override' : 'Lift for 24h'}</Button>}
              <Button size="sm" variant="ghost" onClick={() => patch(b.id, { enabled: !b.enabled }, b.enabled ? 'Budget off' : 'Budget on')}>{b.enabled ? 'Turn off' : 'Turn on'}</Button>
            </td>
          </tr>))}</tbody>
      </table></div>
      <form onSubmit={save} className="mt-4 grid items-end gap-3 border-t border-border pt-4 sm:grid-cols-5">
        <div className="grid gap-1"><Label>What</Label><RadixSelect value={form.scope} onValueChange={v => setForm({ ...form, scope: v })} options={[{ value: 'global', label: 'All AI spend' }, { value: 'provider', label: 'One provider' }, { value: 'workflow', label: 'One workflow' }, { value: 'user', label: 'One account' }]} className="h-10" /></div>
        <div className="grid gap-1"><Label>Which (provider id, workflow or account id)</Label><Input disabled={form.scope === 'global'} value={form.scope_ref} onChange={e => setForm({ ...form, scope_ref: e.target.value })} placeholder={form.scope === 'provider' ? 'claude' : ''} /></div>
        <div className="grid gap-1"><Label>Per</Label><RadixSelect value={form.period} onValueChange={v => setForm({ ...form, period: v })} options={['day', 'month']} className="h-10" /></div>
        <div className="grid gap-1"><Label>Limit (USD)</Label><Input required type="number" min="1" step="1" value={form.amount_usd} onChange={e => setForm({ ...form, amount_usd: e.target.value })} /></div>
        <div className="flex items-center gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.hard_stop} onChange={e => setForm({ ...form, hard_stop: e.target.checked })} /> Hard stop</label><Button type="submit">Add</Button></div>
      </form>
      <p className="mt-3 text-xs text-muted-foreground">Warnings go out at 50%, 80% and 100%, once each per day or month (Central time). A hard stop pauses a provider (calls go to another) or, for the all-spend, account and workflow budgets, pauses the question with a friendly message. Set Claude&apos;s limit here to match your Anthropic Console spend limit so the 80% warning works.</p>
    </div>
  );
}

function PricesEditor({ prices, reload }) {
  const { toast } = useToast();
  const blank = { provider: 'claude', model: '', token_type: 'input', price_usd: '', unit: 'mtok' };
  const [form, setForm] = useState(blank);
  const [showOld, setShowOld] = useState(false);
  const current = useMemo(() => prices.filter(p => showOld || !p.effective_to), [prices, showOld]);
  const unconfirmed = prices.filter(p => !p.confirmed && !p.effective_to).length;
  const add = async e => {
    e.preventDefault();
    try { await api.billing.addPrice({ ...form, price_usd: Number(form.price_usd), unit: ['search', 'call'].includes(form.token_type) ? 'unit' : 'mtok' }); setForm(blank); reload(); toast({ title: 'Price saved' }); }
    catch (err) { toast({ variant: 'destructive', title: err.message || 'Could not save' }); }
  };
  const confirm = async p => { try { await api.billing.confirmPrice(p.id, true); reload(); } catch (err) { toast({ variant: 'destructive', title: err.message || 'Could not confirm' }); } };
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {unconfirmed > 0 && <p className="mb-3 flex items-center gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-300"><AlertTriangle className="h-4 w-4 shrink-0" /> {unconfirmed} price{unconfirmed === 1 ? ' is' : 's are'} still unconfirmed. Check each against its source page, then press Confirm.</p>}
      <label className="mb-2 flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={showOld} onChange={e => setShowOld(e.target.checked)} /> Show replaced prices</label>
      <div className="max-h-96 overflow-auto"><table className="w-full text-sm">
        <thead><tr className="text-left text-muted-foreground"><th className="p-2 font-medium">Provider / model</th><th className="p-2 font-medium">Kind</th><th className="p-2 text-right font-medium">Price (USD)</th><th className="p-2 font-medium">Source</th><th className="p-2" /></tr></thead>
        <tbody>{current.map(p => (
          <tr key={p.id} className={`border-t border-border ${p.effective_to ? 'opacity-50' : ''}`}>
            <td className="p-2">{p.provider} / {p.model}</td>
            <td className="p-2">{p.token_type}{p.price_window !== 'any' ? ` (${p.price_window})` : ''}</td>
            <td className="p-2 text-right font-medium">{p.price_usd} <span className="text-xs text-muted-foreground">{p.unit === 'mtok' ? 'per 1M tokens' : 'each'}</span></td>
            <td className="p-2">{p.source_url ? <a className="text-primary underline" href={p.source_url} target="_blank" rel="noreferrer">source</a> : ''}</td>
            <td className="p-2 text-right">{p.effective_to ? 'replaced' : p.confirmed ? <span className="inline-flex items-center gap-1 text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Confirmed</span> : <Button size="sm" variant="outline" onClick={() => confirm(p)}>Confirm</Button>}</td>
          </tr>))}</tbody>
      </table></div>
      <form onSubmit={add} className="mt-4 grid items-end gap-3 border-t border-border pt-4 sm:grid-cols-5">
        <div className="grid gap-1"><Label>Provider</Label><Input required value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })} /></div>
        <div className="grid gap-1"><Label>Model (or *)</Label><Input required value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} placeholder="claude-sonnet-5-5" /></div>
        <div className="grid gap-1"><Label>Kind</Label><RadixSelect value={form.token_type} onValueChange={v => setForm({ ...form, token_type: v })} options={['input', 'output', 'cache_read', 'cache_write', 'thinking', 'search', 'call']} className="h-10" /></div>
        <div className="grid gap-1"><Label>{['search', 'call'].includes(form.token_type) ? 'USD each' : 'USD per 1M tokens'}</Label><Input required type="number" min="0" step="any" value={form.price_usd} onChange={e => setForm({ ...form, price_usd: e.target.value })} /></div>
        <Button type="submit">Save price</Button>
      </form>
      <p className="mt-3 text-xs text-muted-foreground">A new price for the same model and kind replaces the old one from now on; past calls keep the price they were charged at. Calls with no price are shown as &quot;no price yet&quot; and are priced automatically once you add it.</p>
    </div>
  );
}

export default function AdminBilling() {
  const { toast } = useToast();
  const [summary, setSummary] = useState(null);
  const [providers, setProviders] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [budgets, setBudgets] = useState([]);
  const [prices, setPrices] = useState([]);
  const [optimize, setOptimize] = useState(null);
  const [period, setPeriod] = useState('month');
  const [dim, setDim] = useState('user');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  const loadAll = useCallback(async () => {
    try {
      const [s, p, a, b, pr, o] = await Promise.all([api.billing.summary(), api.billing.providers(), api.billing.alerts(false), api.billing.budgets(), api.billing.prices(), api.billing.optimize()]);
      setSummary(s); setProviders(p); setAlerts(a); setBudgets(b.budgets); setPrices(pr.prices); setOptimize(o); setError('');
    } catch (e) { setError(e.message || 'Could not load billing data.'); }
  }, []);
  useEffect(() => { loadAll(); const t = setInterval(loadAll, 60_000); return () => clearInterval(t); }, [loadAll]);
  useEffect(() => { setRows(null); api.billing.breakdown(dim, period).then(r => setRows(r.rows)).catch(() => setRows([])); }, [dim, period]);

  const ack = async id => { try { await api.billing.ackAlert(id); setAlerts(await api.billing.alerts(false)); } catch (e) { toast({ variant: 'destructive', title: e.message || 'Could not acknowledge' }); } };

  const daily = useMemo(() => {
    const byDay = {}; const names = new Set();
    for (const r of summary?.daily || []) { names.add(r.provider); (byDay[r.day] ??= { day: r.day.slice(5) })[r.provider] = Number(r.usd) || 0; }
    return { data: Object.values(byDay), names: [...names] };
  }, [summary]);
  const byModel = (summary?.byModel || []).map(m => ({ name: `${m.provider} / ${m.model}`, usd: Number(m.usd) || 0 }));
  const open = alerts?.alerts?.filter(a => !a.acknowledged_at) ?? [];
  const c = summary?.cards;

  if (error && !summary) return <div className="p-10 text-center text-muted-foreground"><PageMeta {...PAGE_META.adminBilling} noindex />{error}</div>;
  if (!summary) return <div className="flex items-center justify-center p-10"><PageMeta {...PAGE_META.adminBilling} noindex /><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="p-6 md:p-10">
      <PageMeta {...PAGE_META.adminBilling} noindex />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="font-heading text-2xl font-bold">AI Billing</h1><p className="mt-1 text-sm text-muted-foreground">What every AI call costs, what each provider says we owe, and when to worry. Days and months are Central time.</p></div>
        <div className="flex items-center gap-2">
          <a href="#alerts" className="relative inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium" aria-label={`${open.length} open alerts`}>
            <Bell className="h-4 w-4" /> Alerts {open.length > 0 && <span className={`rounded-full px-2 py-0.5 text-xs ${open.some(a => a.severity === 'critical') ? 'bg-red-500 text-white' : 'bg-amber-500 text-black'}`}>{open.length}</span>}
          </a>
          <Button variant="outline" onClick={loadAll}><RefreshCw className="mr-2 h-4 w-4" /> Refresh</Button>
        </div>
      </div>

      {open.some(a => a.severity === 'critical') && (
        <div role="alert" className="mt-6 rounded-2xl border border-red-500/50 bg-red-500/10 p-4 text-sm">
          <div className="flex items-center gap-2 font-semibold text-red-300"><ShieldAlert className="h-4 w-4" /> Needs attention now</div>
          <ul className="mt-2 space-y-1">{open.filter(a => a.severity === 'critical').map(a => <li key={a.id}>{a.message}</li>)}</ul>
        </div>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card label="Today" value={money(c.today)} sub={c.failed_today ? `${c.failed_today} failed call(s)` : null} />
        <Card label="This week" value={money(c.week)} sub="last 7 days" />
        <Card label="This month" value={money(c.month)} sub={c.pending_calls ? `${c.pending_calls} call(s) with no price yet` : null} />
        <Card label="Month-end forecast" value={c.forecast == null ? 'Too early' : money(c.forecast)} sub={c.forecast != null && c.budget_month && c.forecast > c.budget_month ? `Over the ${money(c.budget_month, 0)} budget` : null} />
        <Card label="Budget remaining" value={c.budget_remaining == null ? 'No budget' : money(c.budget_remaining)} sub={c.budget_month ? `of ${money(c.budget_month, 0)} this month` : 'Add one below'} />
      </div>

      <Section title="Providers" hint="Green is under 80% of the limit you set, amber is 80% to 100%, red is over or paused.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{providers?.providers?.map(p => <ProviderTile key={p.id} p={p} />)}</div>
        <p className="mt-3 text-xs text-muted-foreground">Sync jobs: {providers?.jobs?.map(j => `${j.job} ${j.configured ? (j.last_error ? 'failed' : j.last_ok ? `ok ${when(j.last_ok)}` : 'waiting') : 'not set up'}`).join(' · ')}</p>
      </Section>

      <Section title="Spend over time">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-4"><div className="mb-2 text-sm font-medium">Last 30 days, by provider</div>
            <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={daily.data}><CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.15} /><XAxis dataKey="day" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} /><Tooltip formatter={v => money(v)} /><Legend />
              {daily.names.map((n, i) => <Bar key={n} dataKey={n} stackId="a" fill={PROVIDER_COLORS[i % PROVIDER_COLORS.length]} />)}</BarChart></ResponsiveContainer></div></div>
          <div className="rounded-2xl border border-border bg-card p-4"><div className="mb-2 text-sm font-medium">Last 30 days, by model</div>
            <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={byModel} layout="vertical" margin={{ left: 40 }}><CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.15} /><XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} /><YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} /><Tooltip formatter={v => money(v)} /><Bar dataKey="usd" fill={PROVIDER_COLORS[0]} /></BarChart></ResponsiveContainer></div></div>
        </div>
      </Section>

      <Section title="Who and what is spending">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <div className="grid gap-1"><Label>Group by</Label><RadixSelect value={dim} onValueChange={setDim} className="h-10 w-48" options={[{ value: 'user', label: 'Account' }, { value: 'command', label: 'Command (search, build...)' }, { value: 'workflow', label: 'Workflow' }, { value: 'feature', label: 'Feature (cost per call)' }, { value: 'model', label: 'Model' }]} /></div>
            <div className="grid gap-1"><Label>Period</Label><RadixSelect value={period} onValueChange={setPeriod} className="h-10 w-40" options={PERIODS} /></div>
          </div>
          {rows ? <BreakdownTable rows={rows} label={{ user: 'Account', command: 'Command', workflow: 'Workflow', feature: 'Feature', model: 'Model' }[dim]} /> : <div className="p-6 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>}
        </div>
      </Section>

      <Section title="Ways to spend less" hint="Hints from the last 30 days. Check answer quality before switching anything.">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-4"><div className="text-sm font-medium">A cheaper model would have cost less</div>
            {optimize?.cheaper_model?.length ? <ul className="mt-2 space-y-2 text-sm">{optimize.cheaper_model.map((h, i) => <li key={i}><b>{h.command}</b> on {h.from}: {money(h.actual)} actual, {money(h.would)} on {h.to}. Saves <b>{money(h.saves)}</b> over {h.requests} calls.</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">Nothing worth changing yet.</p>}</div>
          <div className="rounded-2xl border border-border bg-card p-4"><div className="text-sm font-medium">Caching, repeats and batching</div>
            <ul className="mt-2 space-y-2 text-sm">
              {optimize?.low_cache_hit?.length ? optimize.low_cache_hit.map((h, i) => <li key={i}>{h.model} ({h.command}): only {(h.hit_rate * 100).toFixed(0)}% of input came from the cache. Longer shared instructions would be cached.</li>) : <li className="text-muted-foreground">Caching looks fine, or there is not enough traffic to tell.</li>}
              <li>{optimize?.repeated_questions?.groups ? <>{optimize.repeated_questions.groups} question(s) were asked 3+ times this week ({optimize.repeated_questions.calls_repeated} repeat calls, about <b>{money(optimize.repeated_questions.could_save_usd)}</b> if cached).</> : <span className="text-muted-foreground">No question was asked three or more times this week.</span>}</li>
              <li>{optimize?.batchable?.followup_calls ? <>{optimize.batchable.followup_calls} separate follow-up-suggestion calls cost {money(optimize.batchable.followup_usd)}. {optimize.batchable.note}</> : <span className="text-muted-foreground">No small calls worth batching.</span>}</li>
            </ul></div>
        </div>
        {optimize?.caveat && <p className="mt-2 text-xs text-muted-foreground">{optimize.caveat}</p>}
      </Section>

      <Section id="alerts" title="Alerts" hint="Critical alerts are emailed again every 6 hours until you acknowledge them.">
        <div className="rounded-2xl border border-border bg-card">
          {alerts?.alerts?.length ? <ul className="divide-y divide-border">{alerts.alerts.slice(0, 40).map(a => (
            <li key={a.id} className={`flex flex-wrap items-start justify-between gap-3 p-4 ${a.acknowledged_at ? 'opacity-50' : ''}`}>
              <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${SEVERITY[a.severity]}`}>{a.severity}</span><span className="text-xs text-muted-foreground">{when(a.ts)} · {a.kind.replace(/_/g, ' ')}</span></div><p className="mt-1 text-sm">{a.message}</p></div>
              {!a.acknowledged_at ? <Button size="sm" variant="outline" onClick={() => ack(a.id)}>Acknowledge</Button> : <span className="text-xs text-muted-foreground">Acknowledged</span>}
            </li>))}</ul> : <p className="p-6 text-center text-sm text-muted-foreground">No alerts. That is good news.</p>}
        </div>
      </Section>

      <Section title="Budgets" hint="Spending limits that warn you, and optionally stop or reroute calls."><BudgetsEditor budgets={budgets} reload={loadAll} /></Section>
      <Section title="Prices" hint="What each model charges us. Costs are worked out from this table, never from numbers in the code."><PricesEditor prices={prices} reload={loadAll} /></Section>
    </div>
  );
}
