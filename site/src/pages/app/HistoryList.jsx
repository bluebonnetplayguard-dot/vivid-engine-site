import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Search, Star, Trash2, Download, Pin } from 'lucide-react';
import SEO from '@/components/seo/SEO';
import { api } from '@/api/client';
import { usePageShell } from '@/components/shell/ShellContext';
import { AUTO_DELETE_OPTIONS, retentionLabel } from '@/config/plans';
import './app-pages.css';

// /recents and /favorites. Saved conversations are a paid feature: guests and free accounts see why, not a list.
export default function HistoryList({ favorites = false }) {
  const shell = usePageShell({ hideBreadcrumbs: false });
  const account = shell?.account || {};
  const { access = {}, isAuthenticated, refresh } = account;
  const [state, setState] = useState(null);
  const [items, setItems] = useState(null);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const title = favorites ? 'Favorites' : 'Recents';

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    const me = await api.history.me().catch(() => null);
    setState(me);
    if (!me?.allowed) { setItems([]); return; }
    setItems(await api.history.list({ q: q || undefined, favorites: favorites ? 'true' : undefined }).catch(() => []));
  }, [isAuthenticated, q, favorites]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn, done) => { try { await fn(); setMsg(done); await load(); refresh?.(); } catch (e) { setMsg(e?.message || 'That did not work.'); } };
  const locked = !isAuthenticated || (state && !state.allowed && !state.readOnly && !access.allowed);

  return <main className="ap-wrap">
    <SEO path={favorites ? '/favorites' : '/recents'} title={title} description="Your saved Vivid AI Search conversations." noindex />
    <h1>{title}</h1>
    {locked ? <div className="ap-locked">
      <Lock size={18} aria-hidden="true" />
      <div><b>Save your conversations with any paid plan</b>
        <p>{isAuthenticated ? 'Free conversations work while open but are not kept after you leave.' : 'Guest searches are not kept after you leave.'} Paid plans keep them for 12 months; Search Max keeps them until you delete them.</p>
        <p><Link className="engine-button engine-primary" to="/pricing/search">See plans</Link>{!isAuthenticated && <> <Link className="engine-button engine-outline" to={`/login?returnTo=${favorites ? '%2Ffavorites' : '%2Frecents'}`}>Sign in</Link></>}</p>
      </div>
    </div> : <>
      {state?.readOnly && <p className="ap-note">Your plan ended, so these are read-only until {String(state.readOnlyUntil || '').slice(0, 10)}. <Link to="/pricing/search">Renew to keep adding to them</Link>.</p>}
      {state && <p className="ap-sub">Saved {retentionLabel(state.retentionDays)}. {state.fullTextSearch ? 'Search looks inside every message.' : 'Search matches titles.'}</p>}
      <form className="ap-search" role="search" onSubmit={e => { e.preventDefault(); load(); }}>
        <label className="sr-only" htmlFor="ap-q">Search your conversations</label>
        <Search size={16} aria-hidden="true" /><input id="ap-q" value={q} onChange={e => setQ(e.target.value)} placeholder="Search your conversations" />
      </form>
      {msg && <p className="ap-msg" role="status">{msg}</p>}
      {items === null ? <p>Loading…</p> : items.length === 0 ? <p className="ap-empty">{favorites ? 'Star a conversation to keep it here.' : 'No saved conversations yet.'} <Link to="/">Ask something</Link></p> : <ul className="ap-list">
        {items.map(c => <li key={c.id}>
          <Link to={`/search?thread=${encodeURIComponent(c.id)}`}>{c.pinned && <Pin size={13} aria-label="Pinned" />}<b>{c.title}</b><small>{new Date(c.updated_date).toLocaleString()}{c.space?.name ? ` · ${c.space.name}` : ''}</small></Link>
          {!state?.readOnly && <button type="button" aria-pressed={c.favorite} aria-label={c.favorite ? `Remove ${c.title} from favorites` : `Add ${c.title} to favorites`} onClick={() => act(() => api.history.update(c.id, { favorite: !c.favorite }), c.favorite ? 'Removed from favorites.' : 'Added to favorites.')}><Star size={16} fill={c.favorite ? 'currentColor' : 'none'} /></button>}
          <button type="button" aria-label={`Delete ${c.title}`} onClick={() => window.confirm(`Delete “${c.title}”? This cannot be undone.`) && act(() => api.history.remove(c.id), 'Deleted.')}><Trash2 size={16} /></button>
        </li>)}
      </ul>}
      {!favorites && state?.allowed && <section className="ap-settings" aria-labelledby="ap-set">
        <h2 id="ap-set">History settings</h2>
        {!state.readOnly && <label>Delete conversations automatically after
          <select value={state.defaultAutoDeleteDays ?? ''} onChange={e => act(() => api.history.settings({ defaultAutoDeleteDays: e.target.value === '' ? null : Number(e.target.value) }), 'Saved.')}>
            {AUTO_DELETE_OPTIONS.map(o => <option key={String(o.days)} value={o.days ?? ''}>{o.label}</option>)}
          </select></label>}
        {state.memory && !state.readOnly && <label className="ap-check"><input type="checkbox" checked={!!state.memoryEnabled} onChange={e => act(() => api.history.settings({ memoryEnabled: e.target.checked }), e.target.checked ? 'Memory is on.' : 'Memory is off.')} /> Let answers use my earlier conversations (memory)</label>}
        <div className="ap-row">
          {state.bulkExport && <button type="button" className="engine-button engine-outline" onClick={async () => {
            try { const data = await api.history.exportAll(); const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'vivid-conversations.json'; a.click(); URL.revokeObjectURL(url); }
            catch (e) { setMsg(e?.message || 'Export failed.'); }
          }}><Download size={15} aria-hidden="true" /> Export all</button>}
          <button type="button" className="engine-button engine-outline" onClick={() => window.confirm('Delete every saved conversation? This cannot be undone.') && act(() => api.history.removeAll(), 'All conversations deleted.')}><Trash2 size={15} aria-hidden="true" /> Delete all</button>
        </div>
      </section>}
    </>}
  </main>;
}
