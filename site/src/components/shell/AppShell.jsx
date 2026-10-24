import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, Search, Compass, Code, LayoutTemplate, Clapperboard, Briefcase, Store, LayoutList, Map, Images, Workflow, Tag, CreditCard,
  MessageSquare, LifeBuoy, Star, History, FolderKanban, ChevronRight, Plus, PanelLeftClose, PanelLeftOpen, Menu, X, Lock, Pin, Gift,
  ShieldCheck, Bell, Languages, LogOut, UserRound, Repeat, Settings as SettingsIcon,
} from 'lucide-react';
import { Image } from '@/components/ui/image';
import { api } from '@/api/client';
import { NAV_GROUPS, breadcrumbsFor, labelOf } from '@/config/navigation';
import { useLang } from '@/lib/lang';
import { useNotify } from '@/components/shell/Notifications';
import WhatsAppButton from '@/components/shell/WhatsAppButton';
import SiteFooter from '@/components/shell/SiteFooter';
import Breadcrumbs from '@/components/shell/Breadcrumbs';
import CookieConsent from '@/components/shell/CookieConsent';
import './shell.css';

const ICONS = { home: Home, search: Search, discover: Compass, code: Code, templates: LayoutTemplate, video: Clapperboard, business: Briefcase, partners: Store, services: LayoutList, map: Map, portfolio: Images, process: Workflow, pricing: Tag, pay: CreditCard, contact: MessageSquare, help: LifeBuoy, favorites: Star, history: History, projects: FolderKanban };
const read = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* private window */ } };
const readSet = key => { try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { return new Set(); } };
export const SAFE_KEY = 've-safe-results';
const OPEN_KEY = 've-nav-open';
const T = {
  en: { newSearch: 'New search', locked: 'Save your conversations with any paid plan', lockedGuest: 'Guest searches aren’t kept after you leave.', lockedFree: 'Free conversations work while open but aren’t kept after you leave.', upgrade: 'Upgrade', quote: 'Get a quote', safe: 'Safe results', signIn: 'Sign in', signInSub: 'Client login & saved searches', notices: 'Notifications', none: 'Nothing new.', account: 'Your account', plan: 'Your plan', switch: 'Switch account', signOut: 'Sign out', admin: 'Admin', menu: 'Open menu', close: 'Close menu', collapse: 'Collapse sidebar', expand: 'Expand sidebar', recent: 'Recent conversations' },
  es: { newSearch: 'Nueva búsqueda', locked: 'Guarda tus conversaciones con cualquier plan de pago', lockedGuest: 'Las búsquedas de invitados no se guardan.', lockedFree: 'Las conversaciones gratis no se guardan al salir.', upgrade: 'Mejorar plan', quote: 'Cotización', safe: 'Resultados seguros', signIn: 'Iniciar sesión', signInSub: 'Clientes y búsquedas guardadas', notices: 'Notificaciones', none: 'Nada nuevo.', account: 'Tu cuenta', plan: 'Tu plan', switch: 'Cambiar de cuenta', signOut: 'Cerrar sesión', admin: 'Administración', menu: 'Abrir menú', close: 'Cerrar menú', collapse: 'Contraer barra', expand: 'Expandir barra', recent: 'Conversaciones recientes' },
};

function SubLinks({ item, lang, onNavigate, id, onKeyDown }) {
  return <ul id={id} className="vs-sub" onKeyDown={onKeyDown}>
    {item.children.filter(c => !c.hidden).map(child => <li key={child.id}><NavLink to={child.path} end onClick={onNavigate} className={({ isActive }) => (isActive ? 'is-active' : undefined)}>{labelOf(child, lang)}</NavLink></li>)}
  </ul>;
}

// Arrow keys move between links inside a submenu or flyout.
function arrowNav(e) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
  const links = [...e.currentTarget.querySelectorAll('a')];
  const i = links.indexOf(document.activeElement);
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? links.length - 1 : e.key === 'ArrowDown' ? Math.min(links.length - 1, i + 1) : Math.max(0, i - 1);
  links[next]?.focus(); e.preventDefault();
}

function NavItem({ item, lang, open, onToggle, onNavigate, locked, collapsed, flyout, setFlyout }) {
  const Icon = ICONS[item.icon] || Search;
  const subId = `vs-sub-${item.id}`;
  const label = labelOf(item, lang);
  const rowRef = useRef(null);
  const hasKids = !!item.children?.length;
  const isFly = collapsed && flyout?.id === item.id;
  const openFlyout = () => { const r = rowRef.current?.getBoundingClientRect(); setFlyout({ id: item.id, top: r ? r.top : 80 }); };
  return <li>
    <div className="vs-row" ref={rowRef} onMouseEnter={collapsed && hasKids ? openFlyout : undefined}>
      {collapsed && hasKids
        ? <button type="button" className="vs-link vs-link-btn" aria-haspopup="true" aria-expanded={isFly} aria-controls={isFly ? `${subId}-fly` : undefined} onClick={() => (isFly ? setFlyout(null) : openFlyout())} title={label}>
            <Icon size={18} aria-hidden="true" /><span className="vs-label">{label}</span>
          </button>
        : <NavLink className={({ isActive }) => `vs-link${isActive ? ' is-active' : ''}`} to={item.path} end={item.path === '/'} onClick={onNavigate} title={collapsed ? label : undefined}>
            <Icon size={18} aria-hidden="true" /><span className="vs-label">{label}</span>{locked && <Lock className="vs-lock" size={13} aria-label="Paid plans" />}
          </NavLink>}
      {hasKids && !collapsed && <button type="button" className="vs-chev" aria-expanded={open} aria-controls={subId} aria-label={`${open ? 'Hide' : 'Show'} ${label} pages`} onClick={onToggle}>
        <ChevronRight size={15} aria-hidden="true" />
      </button>}
    </div>
    {hasKids && !collapsed && open && <SubLinks item={item} lang={lang} onNavigate={onNavigate} id={subId} onKeyDown={arrowNav} />}
    {isFly && <div className="vs-fly" id={`${subId}-fly`} role="menu" aria-label={label} style={{ top: Math.max(8, Math.min(flyout.top, (typeof window !== 'undefined' ? window.innerHeight : 800) - 360)) }}
      onMouseLeave={() => setFlyout(null)} onKeyDown={e => { if (e.key === 'Escape') { setFlyout(null); rowRef.current?.querySelector('button')?.focus(); } else arrowNav(e); }}>
      <Link className="vs-fly-head" to={item.path} onClick={() => { setFlyout(null); onNavigate(); }}>{label}</Link>
      <SubLinks item={item} lang={lang} onNavigate={() => { setFlyout(null); onNavigate(); }} />
    </div>}
  </li>;
}

function Bell_({ t }) {
  const { items, unread, markRead } = useNotify();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  return <div className="vs-bellwrap" ref={ref}>
    <button type="button" className="vs-bell" aria-label={`${t.notices}${unread ? ` (${unread} new)` : ''}`} aria-expanded={open} onClick={() => { setOpen(o => !o); if (!open) markRead(); }}>
      <Bell size={16} aria-hidden="true" />{unread > 0 && <span className="vs-dot" aria-hidden="true">{unread}</span>}
    </button>
    {open && <div className="vs-notes" role="dialog" aria-label={t.notices}>
      <b>{t.notices}</b>
      {items.length ? <ul>{items.map(n => <li key={n.id} className={`is-${n.level}`}>{n.link ? <Link to={n.link} onClick={() => setOpen(false)}>{n.title}</Link> : <span>{n.title}</span>}{n.text && <small>{n.text}</small>}</li>)}</ul> : <p>{t.none}</p>}
    </div>}
  </div>;
}

function AccountMenu({ account, t, pathname, onNavigate, canSeeHistory }) {
  const { isAuthenticated, user, me } = account;
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  if (!isAuthenticated) return <Link className="vs-acct" to={`/login?returnTo=${encodeURIComponent(pathname)}`} onClick={onNavigate}>
    <span className="vs-avatar" aria-hidden="true">VE</span>
    <span className="vs-label"><b>{t.signIn}</b><small>{t.signInSub}</small></span>
  </Link>;
  const initials = (user?.full_name || user?.name || user?.email || 'VE').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase();
  const signOut = async switchTo => { await api.auth.logout(); window.location.href = switchTo ? `/login?returnTo=${encodeURIComponent(pathname)}` : '/'; };
  return <div className="vs-acctwrap" ref={ref}>
    <button type="button" className="vs-acct" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
      <span className="vs-avatar" aria-hidden="true">{initials}</span>
      <span className="vs-label"><b>{user?.full_name || user?.email || t.account}</b><small>{me?.tier?.name ? `${me.tier.name} plan` : t.plan}{canSeeHistory ? ' · history on' : ' · history off'}</small></span>
    </button>
    {open && <div className="vs-menu" role="menu">
      <Link role="menuitem" to="/account" onClick={() => { setOpen(false); onNavigate(); }}><UserRound size={15} aria-hidden="true" />{t.account}</Link>
      <Link role="menuitem" to="/ai-search/account" onClick={() => { setOpen(false); onNavigate(); }}><SettingsIcon size={15} aria-hidden="true" />{t.plan}</Link>
      {user?.role === 'admin' && <Link role="menuitem" to="/admin" onClick={() => { setOpen(false); onNavigate(); }}><ShieldCheck size={15} aria-hidden="true" />{t.admin}</Link>}
      <button type="button" role="menuitem" onClick={() => signOut(true)}><Repeat size={15} aria-hidden="true" />{t.switch}</button>
      <button type="button" role="menuitem" onClick={() => signOut(false)}><LogOut size={15} aria-hidden="true" />{t.signOut}</button>
    </div>}
  </div>;
}

// App frame for every public page: collapsible left sidebar (a slide-out drawer on phones), breadcrumbs,
// page content, footer, and the floating WhatsApp button. `account` comes from useSearchAccount().
export default function AppShell({ account, page, children }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { lang, setLang } = useLang();
  const { notify } = useNotify();
  const t = T[lang] || T.en;
  const [collapsed, setCollapsed] = useState(() => read('ve-sidebar', '') === 'collapsed');
  const [drawer, setDrawer] = useState(false);
  const [openGroups, setOpenGroups] = useState(() => readSet(OPEN_KEY));
  const [flyout, setFlyout] = useState(null);
  const [safe, setSafe] = useState(() => read(SAFE_KEY, 'standard'));
  const { threads = [], access = {}, isAuthenticated, user } = account || {};
  const canSeeHistory = access.allowed || access.readOnly;
  const items = NAV_GROUPS.flatMap(g => g.items);

  useEffect(() => { write('ve-sidebar', collapsed ? 'collapsed' : ''); setFlyout(null); }, [collapsed]);
  useEffect(() => { write(SAFE_KEY, safe); }, [safe]);
  useEffect(() => { write(OPEN_KEY, JSON.stringify([...openGroups])); }, [openGroups]);
  useEffect(() => { setDrawer(false); setFlyout(null); }, [pathname]);
  // Open the section that holds the current page.
  useEffect(() => {
    const owner = items.find(n => n.children?.some(c => c.path === pathname));
    if (owner) setOpenGroups(prev => (prev.has(owner.id) ? prev : new Set([...prev, owner.id])));
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') { setDrawer(false); setFlyout(null); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  // Admins see open billing alerts in the bell.
  useEffect(() => {
    if (user?.role !== 'admin') return;
    api.billing.alerts(true).then(r => {
      const o = r?.open || {};
      if (o.critical || o.warn) notify({ key: 'billing-alerts', title: `${o.critical ? `${o.critical} critical` : `${o.warn} billing`} alert${(o.critical || o.warn) === 1 ? '' : 's'}`, text: 'Open AI Billing to review.', link: '/admin/billing', level: o.critical ? 'critical' : 'warn' });
    }).catch(() => {});
  }, [user?.role, notify]);

  const toggle = useCallback(id => setOpenGroups(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; }), []);
  const closeDrawer = () => setDrawer(false);
  const newSearch = () => { closeDrawer(); if (page?.onNewSearch) page.onNewSearch(); else navigate('/'); };
  const openThread = id => { closeDrawer(); if (page?.onOpenThread) page.onOpenThread(id); else navigate(`/search?thread=${encodeURIComponent(id)}`); };
  const pinned = threads.filter(x => x.pinned);
  const recent = [...pinned, ...threads.filter(x => !x.pinned)].slice(0, 6);
  const crumbs = page?.hideBreadcrumbs ? [] : breadcrumbsFor(pathname, lang);
  const here = crumbs[crumbs.length - 1]?.label;
  const whatsappMessage = page?.whatsappMessage || (here ? `Hi Vivid Engine, I have a question about ${here}: ` : undefined);

  return <div className={`vs-shell${collapsed ? ' is-collapsed' : ''}`}>
    <a className="vs-skip" href="#vs-content">Skip to content</a>
    <header className="vs-topbar">
      <button type="button" className="vs-burger" aria-label={t.menu} aria-expanded={drawer} aria-controls="vs-sidebar" onClick={() => setDrawer(true)}><Menu size={20} /></button>
      <Link className="vs-topbrand" to="/" aria-label="Vivid Engine Solutions home"><Image src="/logo-160.webp" alt="" fittingType="fit" /><span>Vivid Engine</span></Link>
      <Link className="engine-button engine-primary vs-quote" to="/quote">{t.quote}</Link>
    </header>

    {drawer && <div className="vs-scrim" onClick={closeDrawer} aria-hidden="true" />}
    <aside id="vs-sidebar" className={`vs-side${drawer ? ' is-open' : ''}`} aria-label="Main navigation">
      <div className="vs-head">
        <Link className="vs-brand" to="/" aria-label="Vivid Engine Solutions home" onClick={closeDrawer}>
          <Image src="/logo-160.webp" alt="" fittingType="fit" /><span className="vs-label">Vivid Engine<small>Solutions</small></span>
        </Link>
        <Bell_ t={t} />
        <button type="button" className="vs-collapse" onClick={() => setCollapsed(c => !c)} aria-label={collapsed ? t.expand : t.collapse} aria-expanded={!collapsed}>
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
        <button type="button" className="vs-close" onClick={closeDrawer} aria-label={t.close}><X size={18} /></button>
      </div>
      <button type="button" className="vs-new" onClick={newSearch}><Plus size={17} aria-hidden="true" /><span className="vs-label">{t.newSearch}</span></button>

      <nav className="vs-nav" aria-label="Site">
        {NAV_GROUPS.map(group => <div key={group.id} className="vs-group">
          {group.label && <h2 className="vs-sec">{labelOf(group, lang)}</h2>}
          <ul>
            {group.items.filter(i => !i.hidden && (i.access !== 'auth' || isAuthenticated)).map(item => <NavItem key={item.id} item={item} lang={lang} collapsed={collapsed && !drawer}
              locked={item.paid && !canSeeHistory} open={openGroups.has(item.id)} onToggle={() => toggle(item.id)} onNavigate={closeDrawer} flyout={flyout} setFlyout={setFlyout} />)}
          </ul>
          {group.id === 'you' && (canSeeHistory
            ? recent.length > 0 && <ul className="vs-history" aria-label={t.recent}>
                {recent.map(x => <li key={x.id}><button type="button" className={`vs-thread${x.id === page?.activeThreadId ? ' is-active' : ''}`} onClick={() => openThread(x.id)} title={x.title}>
                  {x.pinned && <Pin size={12} aria-label="Pinned" />}<span>{x.title}</span>
                </button></li>)}
              </ul>
            : <div className="vs-locked">
                <b><Lock size={14} aria-hidden="true" />{t.locked}</b>
                <span>{isAuthenticated ? t.lockedFree : t.lockedGuest}</span>
                <Link className="vs-mini-btn" to="/pricing/search" onClick={closeDrawer}>{t.upgrade}</Link>
              </div>)}
        </div>)}
      </nav>

      <div className="vs-foot">
        <div className="vs-promo">
          <Gift size={17} aria-hidden="true" />
          <div className="vs-label">
            <b>{lang === 'es' ? 'Recomienda y mejora' : 'Refer a friend · Upgrade'}</b>
            <span>{lang === 'es' ? 'Gana créditos o pásate a Search Pro' : 'Earn credit, or get saved history'}: <Link to="/account#refer" onClick={closeDrawer}>{lang === 'es' ? 'Invitar' : 'Invite'}</Link> · <Link to="/pricing/search" onClick={closeDrawer}>{lang === 'es' ? 'Planes' : 'Plans'}</Link></span>
          </div>
        </div>
        <div className="vs-prefs">
          <Languages size={15} aria-hidden="true" />
          <span className="vs-label">EN / ES</span>
          <div className="vs-lang" role="radiogroup" aria-label="Language">
            {[['en', 'EN'], ['es', 'ES']].map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={lang === v} className={lang === v ? 'is-on' : ''} onClick={() => setLang(v)}>{l}</button>)}
          </div>
        </div>
        <label className="vs-prefs">
          <ShieldCheck size={15} aria-hidden="true" />
          <span className="vs-label">{t.safe}</span>
          <select value={safe} onChange={e => setSafe(e.target.value)} aria-label={t.safe}>
            <option value="standard">Standard</option>
            <option value="strict">Strict (kids)</option>
            <option value="off">Off (18+)</option>
          </select>
        </label>
        <AccountMenu account={account} t={t} pathname={pathname} onNavigate={closeDrawer} canSeeHistory={canSeeHistory} />
      </div>
    </aside>

    <div className="vs-main">
      <div className="vs-pagebar">
        {crumbs.length > 1 ? <Breadcrumbs crumbs={crumbs} /> : <span />}
        <Link className="engine-button engine-primary vs-quote-desk" to="/quote">{t.quote}</Link>
      </div>
      <div id="vs-content" tabIndex={-1}>{children}</div>
      <SiteFooter />
    </div>
    <WhatsAppButton message={whatsappMessage} />
    <CookieConsent />
  </div>;
}
