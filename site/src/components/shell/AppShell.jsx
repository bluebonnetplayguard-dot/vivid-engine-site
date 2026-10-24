import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Search, History, Code, Clapperboard, LayoutList, Map, Images, Workflow, Tag, CreditCard, LifeBuoy,
  ChevronRight, Plus, PanelLeftClose, PanelLeftOpen, Menu, X, Lock, Pin, Gift, ShieldCheck,
} from 'lucide-react';
import { Image } from '@/components/ui/image';
import { NAV_GROUPS } from '@/config/navigation';
import WhatsAppButton from '@/components/shell/WhatsAppButton';
import SiteFooter from '@/components/shell/SiteFooter';
import './shell.css';

const ICONS = { search: Search, history: History, code: Code, video: Clapperboard, services: LayoutList, map: Map, portfolio: Images, process: Workflow, pricing: Tag, pay: CreditCard, help: LifeBuoy };
const read = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* private window */ } };
export const SAFE_KEY = 've-safe-results';

function NavItem({ item, open, onToggle, onNavigate, pathname, locked }) {
  const Icon = ICONS[item.icon] || Search;
  const isHash = item.to.startsWith('/#');
  const href = isHash && pathname === '/' ? item.to.slice(1) : item.to;
  const inner = <><Icon size={18} aria-hidden="true" /><span className="vs-label">{item.label}</span></>;
  return <li>
    <div className="vs-row">
      {isHash
        ? <a className="vs-link" href={href} onClick={onNavigate}>{inner}</a>
        : <NavLink className={({ isActive }) => `vs-link${isActive ? ' is-active' : ''}`} to={item.to} end onClick={onNavigate}>{inner}{locked && <Lock className="vs-lock" size={13} aria-label="Paid plans" />}</NavLink>}
      {item.children && <button type="button" className="vs-chev" aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} ${item.label} pages`} onClick={onToggle}>
        <ChevronRight size={15} aria-hidden="true" />
      </button>}
    </div>
    {item.children && open && <ul className="vs-sub">
      {item.children.map(child => <li key={child.to + child.label}>
        {child.to.startsWith('/#') ? <a href={pathname === '/' ? child.to.slice(1) : child.to} onClick={onNavigate}>{child.label}</a> : <Link to={child.to} onClick={onNavigate}>{child.label}</Link>}
      </li>)}
    </ul>}
  </li>;
}

// App frame: collapsible left sidebar (a slide-out drawer on phones), page content, footer,
// and the floating WhatsApp button. `account` comes from useSearchAccount().
export default function AppShell({ account, activeThreadId, onOpenThread, onNewSearch, whatsappMessage, children }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => read('ve-sidebar', '') === 'collapsed');
  const [drawer, setDrawer] = useState(false);
  const [openGroups, setOpenGroups] = useState(() => new Set());
  const [safe, setSafe] = useState(() => read(SAFE_KEY, 'standard'));
  const { me, threads = [], access = {}, isAuthenticated, user } = account || {};
  const canSeeHistory = access.allowed || access.readOnly;

  useEffect(() => { write('ve-sidebar', collapsed ? 'collapsed' : ''); }, [collapsed]);
  useEffect(() => { write(SAFE_KEY, safe); }, [safe]);
  useEffect(() => { setDrawer(false); }, [pathname]);
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') setDrawer(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const toggle = id => setOpenGroups(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const closeDrawer = () => setDrawer(false);
  const newSearch = () => { closeDrawer(); if (onNewSearch) onNewSearch(); else navigate('/'); };
  const openThread = id => { closeDrawer(); if (onOpenThread) onOpenThread(id); else navigate(`/ai-search?thread=${encodeURIComponent(id)}`); };
  const pinned = threads.filter(t => t.pinned);
  const recent = [...pinned, ...threads.filter(t => !t.pinned)].slice(0, 6);
  const initials = (user?.full_name || user?.name || user?.email || 'VE').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase();

  return <div className={`vs-shell${collapsed ? ' is-collapsed' : ''}`}>
    <header className="vs-topbar">
      <button type="button" className="vs-burger" aria-label="Open menu" aria-expanded={drawer} aria-controls="vs-sidebar" onClick={() => setDrawer(true)}><Menu size={20} /></button>
      <Link className="vs-topbrand" to="/" aria-label="Vivid Engine Solutions home"><Image src="/logo-160.webp" alt="" fittingType="fit" /><span>Vivid Engine</span></Link>
      <a className="engine-button engine-primary vs-quote" href={pathname === '/' ? '#inquiry' : '/#inquiry'}>Get a quote</a>
    </header>

    {drawer && <div className="vs-scrim" onClick={closeDrawer} aria-hidden="true" />}
    <aside id="vs-sidebar" className={`vs-side${drawer ? ' is-open' : ''}`} aria-label="Main navigation">
      <div className="vs-head">
        <Link className="vs-brand" to="/" aria-label="Vivid Engine Solutions home" onClick={closeDrawer}>
          <Image src="/logo-160.webp" alt="" fittingType="fit" /><span className="vs-label">Vivid Engine<small>Solutions</small></span>
        </Link>
        <button type="button" className="vs-collapse" onClick={() => setCollapsed(c => !c)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed}>
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
        <button type="button" className="vs-close" onClick={closeDrawer} aria-label="Close menu"><X size={18} /></button>
      </div>
      <button type="button" className="vs-new" onClick={newSearch}><Plus size={17} aria-hidden="true" /><span className="vs-label">New search</span></button>

      <nav className="vs-nav" aria-label="Site">
        {NAV_GROUPS.map(group => <div key={group.id} className="vs-group">
          {group.label && <h2 className="vs-sec">{group.label}</h2>}
          <ul>
            {group.items.map(item => <NavItem key={item.id} item={item} pathname={pathname} locked={item.paid && !canSeeHistory} open={openGroups.has(item.id)} onToggle={() => toggle(item.id)} onNavigate={closeDrawer} />)}
          </ul>
          {group.id === 'main' && (canSeeHistory
            ? recent.length > 0 && <ul className="vs-history" aria-label="Recent conversations">
                {recent.map(t => <li key={t.id}><button type="button" className={`vs-thread${t.id === activeThreadId ? ' is-active' : ''}`} onClick={() => openThread(t.id)} title={t.title}>
                  {t.pinned && <Pin size={12} aria-label="Pinned" />}<span>{t.title}</span>
                </button></li>)}
              </ul>
            : <div className="vs-locked">
                <b><Lock size={14} aria-hidden="true" />Save your conversations with any paid plan</b>
                <span>{isAuthenticated ? 'Free conversations work while open but aren’t kept after you leave.' : 'Guest searches aren’t kept after you leave.'}</span>
                <Link className="vs-mini-btn" to="/pricing/search" onClick={closeDrawer}>Upgrade</Link>
              </div>)}
        </div>)}
      </nav>

      <div className="vs-foot">
        <div className="vs-promo">
          <Gift size={17} aria-hidden="true" />
          <div className="vs-label">{canSeeHistory
            ? <><b>Refer a friend</b>Earn bonus credits · <Link to="/ai-search/account" onClick={closeDrawer}>Invite</Link></>
            : <><b>Search Pro</b>Saved history &amp; more engines · <Link to="/pricing/search" onClick={closeDrawer}>See plans</Link></>}</div>
        </div>
        <label className="vs-prefs">
          <ShieldCheck size={15} aria-hidden="true" />
          <span className="vs-label">Safe results</span>
          <select value={safe} onChange={e => setSafe(e.target.value)} aria-label="Safe results">
            <option value="standard">Standard</option>
            <option value="strict">Strict (kids)</option>
            <option value="off">Off (18+)</option>
          </select>
        </label>
        {isAuthenticated
          ? <Link className="vs-acct" to="/ai-search/account" onClick={closeDrawer}>
              <span className="vs-avatar" aria-hidden="true">{initials}</span>
              <span className="vs-label"><b>{user?.full_name || user?.email || 'Your account'}</b><small>{me?.tier?.name ? `${me.tier.name} plan` : 'Your plan'}{canSeeHistory ? ' · history on' : ' · history off'}</small></span>
            </Link>
          : <Link className="vs-acct" to={`/login?returnTo=${encodeURIComponent(pathname)}`} onClick={closeDrawer}>
              <span className="vs-avatar" aria-hidden="true">VE</span>
              <span className="vs-label"><b>Sign in</b><small>Client login &amp; saved searches</small></span>
            </Link>}
      </div>
    </aside>

    <div className="vs-main">
      {children}
      <SiteFooter />
    </div>
    <WhatsAppButton message={whatsappMessage} />
  </div>;
}
