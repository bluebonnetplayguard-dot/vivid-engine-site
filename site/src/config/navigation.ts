// THE route registry. One tree drives the sidebar, the phone drawer, breadcrumbs, the footer, the sitemap,
// robots.txt, the server's SEO manifest and route protection. Add a page here, then add its <Route> in App.jsx
// (scripts/check-routes.mjs fails the build if the two disagree).
//
// Plain data with erasable TypeScript only, so build scripts can import it with `node --experimental-strip-types`.
import { AREAS } from './areas.ts';
import { SERVICES } from './services.ts';
import { PRICING_PAGES } from './pricing-pages.ts';

export type Access = 'public' | 'auth' | 'admin';
export type Lang = 'en' | 'es';

export interface NavNode {
  id: string;
  path: string;                 // may contain :params for dynamic pages (enumerated below for the sitemap)
  label: string;
  labelEs?: string;
  icon?: string;                // sidebar icon name (see ICONS in AppShell)
  access?: Access;              // default 'public'
  index?: boolean;              // in the sitemap; default true for public pages
  hidden?: boolean;             // a real page, but not shown in the sidebar
  paid?: boolean;               // shown with a lock for guests and free accounts
  children?: NavNode[];
}

export interface NavGroup { id: string; label?: string; labelEs?: string; items: NavNode[] }

const services: NavNode[] = SERVICES.map(s => ({ id: `svc-${s.slug}`, path: s.path, label: s.name, labelEs: s.nameEs }));
const areas: NavNode[] = AREAS.map(a => ({ id: `area-${a.slug}`, path: `/areas/${a.slug}`, label: `${a.city}, ${a.state}`, labelEs: `${a.city}, ${a.state}` }));
const pricing: NavNode[] = PRICING_PAGES.map(p => ({ id: `price-${p.slug || 'all'}`, path: p.slug ? `/pricing/${p.slug}` : '/pricing', label: p.label, labelEs: p.labelEs }));

export const NAV_GROUPS: NavGroup[] = [
  { id: 'main', items: [
    { id: 'home', path: '/', label: 'Home', labelEs: 'Inicio', icon: 'home' },
    { id: 'search', path: '/search', label: 'Search', labelEs: 'Buscar', icon: 'search', index: false },
    { id: 'discover', path: '/discover', label: 'Discover', labelEs: 'Descubrir', icon: 'discover' },
  ] },
  { id: 'make', label: 'Make', labelEs: 'Crear', items: [
    { id: 'build', path: '/build', label: 'Build', labelEs: 'Construir', icon: 'code', children: [
      { id: 'build-website', path: '/build/website', label: 'Website', labelEs: 'Sitio web' },
      { id: 'build-app', path: '/build/app', label: 'App', labelEs: 'Aplicación' },
      { id: 'build-domains', path: '/build/domains', label: 'Domains', labelEs: 'Dominios' },
      { id: 'build-projects', path: '/build/my-projects', label: 'My projects', labelEs: 'Mis proyectos', access: 'auth' },
    ] },
    { id: 'templates', path: '/templates', label: 'Templates', labelEs: 'Plantillas', icon: 'templates' },
    { id: 'create', path: '/create', label: 'Create', labelEs: 'Crear contenido', icon: 'video', children: [
      { id: 'create-images', path: '/create/images', label: 'Images', labelEs: 'Imágenes' },
      { id: 'create-video', path: '/create/video', label: 'Video Studio', labelEs: 'Estudio de video' },
      { id: 'create-production', path: '/create/production', label: 'Production', labelEs: 'Producción' },
      { id: 'create-media', path: '/create/my-media', label: 'My media', labelEs: 'Mis archivos', access: 'auth' },
    ] },
    { id: 'business', path: '/business', label: 'Business Help', labelEs: 'Ayuda para negocios', icon: 'business', children: [
      { id: 'biz-marketing', path: '/business/marketing', label: 'Marketing', labelEs: 'Mercadeo' },
      { id: 'biz-google', path: '/business/google-profile', label: 'Google Business Profile', labelEs: 'Perfil de Google' },
      { id: 'biz-social', path: '/business/social', label: 'Social media', labelEs: 'Redes sociales' },
      { id: 'biz-reviews', path: '/business/reviews', label: 'Reviews', labelEs: 'Reseñas' },
      { id: 'biz-plans', path: '/business/plans', label: 'Business plans', labelEs: 'Planes de negocio' },
    ] },
  ] },
  { id: 'local', label: 'Local', labelEs: 'Local', items: [
    { id: 'local', path: '/local', label: 'Local Partners', labelEs: 'Socios locales', icon: 'partners', children: [
      { id: 'local-dir', path: '/local', label: 'Local businesses', labelEs: 'Negocios locales' },
      { id: 'partners', path: '/partners', label: 'Become a partner', labelEs: 'Hazte socio' },
      { id: 'partners-tiers', path: '/partners/tiers', label: 'Partner tiers', labelEs: 'Niveles' },
      { id: 'partners-apply', path: '/partners/apply', label: 'Apply', labelEs: 'Solicitar' },
      { id: 'partners-dashboard', path: '/partners/dashboard', label: 'Partner dashboard', labelEs: 'Panel de socio', access: 'auth' },
    ] },
    { id: 'services', path: '/services', label: 'Services', labelEs: 'Servicios', icon: 'services', children: services },
    { id: 'areas', path: '/areas', label: 'Areas', labelEs: 'Áreas', icon: 'map', children: areas },
    { id: 'portfolio', path: '/portfolio', label: 'Portfolio', labelEs: 'Portafolio', icon: 'portfolio' },
    { id: 'process', path: '/process', label: 'Process', labelEs: 'Proceso', icon: 'process' },
  ] },
  { id: 'company', label: 'Vivid Engine', items: [
    { id: 'pricing', path: '/pricing', label: 'Pricing', labelEs: 'Precios', icon: 'pricing', children: pricing },
    { id: 'pay', path: '/pay', label: 'Pay', labelEs: 'Pagar', icon: 'pay' },
    { id: 'contact', path: '/contact', label: 'Contact', labelEs: 'Contacto', icon: 'contact', children: [
      { id: 'contact-main', path: '/contact', label: 'Contact us', labelEs: 'Contáctanos' },
      { id: 'quote', path: '/quote', label: 'Get a quote', labelEs: 'Cotización' },
      { id: 'consultation', path: '/consultation', label: 'Free consultation', labelEs: 'Consulta gratis' },
    ] },
    { id: 'help', path: '/help', label: 'Help & About', labelEs: 'Ayuda e información', icon: 'help', children: [
      { id: 'help-main', path: '/help', label: 'Help center', labelEs: 'Centro de ayuda' },
      { id: 'support', path: '/support', label: 'Client support', labelEs: 'Soporte' },
      { id: 'faq', path: '/faq', label: 'FAQ', labelEs: 'Preguntas' },
      { id: 'about', path: '/about', label: 'About us', labelEs: 'Nosotros' },
      { id: 'ai-engines', path: '/about/ai-engines', label: 'Our AI engines', labelEs: 'Nuestros motores de IA' },
    ] },
  ] },
  { id: 'you', label: 'Yours', labelEs: 'Lo tuyo', items: [
    { id: 'favorites', path: '/favorites', label: 'Favorites', labelEs: 'Favoritos', icon: 'favorites', paid: true, index: false },
    { id: 'recents', path: '/recents', label: 'Recents', labelEs: 'Recientes', icon: 'history', paid: true, index: false },
    { id: 'projects', path: '/projects', label: 'Projects', labelEs: 'Proyectos', icon: 'projects', access: 'auth' },
  ] },
];

// Pages that exist but are not in the sidebar.
export const OTHER_PAGES: NavNode[] = [
  { id: 'account', path: '/account', label: 'Account', labelEs: 'Cuenta', access: 'auth' },
  { id: 'search-account', path: '/ai-search/account', label: 'Your AI Search plan', access: 'auth' },
  { id: 'checkout', path: '/checkout', label: 'Checkout', labelEs: 'Pago', index: false },
  { id: 'start', path: '/start', label: 'Start a project', access: 'auth' },
  { id: 'local-city', path: '/local/:city/:category', label: 'Local businesses', index: false },
  { id: 'maintenance', path: '/maintenance', label: 'Website maintenance' },
  { id: 'domain-leasing', path: '/domain-leasing', label: 'Domain leasing' },
  { id: 'app-dev', path: '/services/custom-app-development', label: 'Custom app development' },
  { id: 'estimator', path: '/vivid-estimator', label: 'Vivid Estimator' },
  { id: 'video', path: '/video', label: 'Video Studio' },
  { id: 'loc-beaumont', path: '/locations/beaumont-web-design', label: 'Beaumont web design' },
  { id: 'loc-lake-charles', path: '/locations/lake-charles-app-development', label: 'Lake Charles app development' },
  { id: 'old-towns', path: '/service-areas/:slug', label: 'Service area', index: false },
  { id: 'video-pricing', path: '/video/pricing', label: 'Video Studio plans' },
  { id: 'video-account', path: '/video/account', label: 'Your Video Studio plan', access: 'auth' },
  { id: 'video-edit', path: '/video/edit/:id', label: 'Video editor', access: 'auth' },
  { id: 'delete-account', path: '/delete-account', label: 'Delete your account', index: false },
  { id: 'login', path: '/login', label: 'Sign in', labelEs: 'Iniciar sesión', index: false },
  { id: 'register', path: '/register', label: 'Create an account', index: false },
  { id: 'forgot', path: '/forgot-password', label: 'Forgot password', index: false },
  { id: 'reset', path: '/reset-password', label: 'Reset password', index: false },
  { id: 'portal', path: '/portal', label: 'Client portal', access: 'auth' },
  { id: 'portal-project', path: '/portal/projects/:id', label: 'Project', access: 'auth' },
  { id: 'portal-domain', path: '/portal/domain', label: 'Your domain', access: 'auth' },
  { id: 'settings', path: '/settings', label: 'Settings', access: 'auth' },
  { id: 'admin', path: '/admin', label: 'Admin', access: 'admin', children: [
    'leads', 'quotes', 'estimator', 'invoices', 'costs', 'logo', 'pos', 'chat', 'marketing-drafts', 'pricing', 'billing',
  ].map(p => ({ id: `admin-${p}`, path: `/admin/${p}`, label: p, access: 'admin' as Access })) },
  { id: 'legal', path: '/legal', label: 'Legal', labelEs: 'Legal', children: [
    ['terms', 'Terms of Service'], ['privacy', 'Privacy Policy'], ['acceptable-use', 'Acceptable Use'], ['refund', 'Refund Policy'],
    ['partner-agreement', 'Partner Advertising Agreement'], ['recommendations', 'How Recommendations Work'], ['cookies', 'Cookie Policy'],
    ['accessibility', 'Accessibility'], ['dmca', 'Copyright (DMCA)'], ['ai-disclaimer', 'AI Disclaimer'],
  ].map(([slug, label]) => ({ id: `legal-${slug}`, path: `/legal/${slug}`, label })) },
];

// Old addresses that now live elsewhere. The app redirects them; the server can send 301s from the same list.
export const REDIRECTS: Record<string, string> = {
  '/ai-search': '/search',
  '/ai-search/pricing': '/pricing/search',
  '/service-areas': '/areas',
  '/service-areas/beaumont-tx': '/areas/beaumont',
  '/service-areas/lake-charles-la': '/areas/lake-charles',
  '/services/website-maintenance': '/maintenance',
  '/services/domain-leasing': '/domain-leasing',
  '/privacy': '/legal/privacy',
};

// ---------- helpers ----------

function walk(nodes: NavNode[], parent: NavNode | null, out: { node: NavNode; parent: NavNode | null }[]) {
  for (const n of nodes) {
    out.push({ node: n, parent });
    if (n.children) walk(n.children.filter(c => c.path !== n.path), n, out);
  }
  return out;
}
const ALL = walk([...NAV_GROUPS.flatMap(g => g.items), ...OTHER_PAGES], null, []);

export const allRoutes = (): NavNode[] => {
  const seen = new Set<string>(); const out: NavNode[] = [];
  for (const { node } of ALL) if (!seen.has(node.path)) { seen.add(node.path); out.push(node); }
  return out;
};

const toRe = (path: string) => new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:[^/]+/g, '[^/]+')}/?$`);
const ROUTE_RES = allRoutes().map(n => ({ n, re: toRe(n.path), dynamic: n.path.includes(':') }));

// The registry entry for a URL path (exact paths win over :param paths).
export function findRoute(pathname: string): NavNode | null {
  const exact = ROUTE_RES.find(r => !r.dynamic && r.re.test(pathname));
  return (exact ?? ROUTE_RES.find(r => r.dynamic && r.re.test(pathname)))?.n ?? null;
}

export const accessFor = (pathname: string): Access => {
  if (/^\/admin(\/|$)/.test(pathname)) return 'admin';
  return findRoute(pathname)?.access ?? 'public';
};

export const labelOf = (n: { label: string; labelEs?: string }, lang: Lang = 'en') => (lang === 'es' && n.labelEs ? n.labelEs : n.label);

// Home > Section > Page. Built from the tree, so every subpage gets the same trail everywhere.
export function breadcrumbsFor(pathname: string, lang: Lang = 'en'): { path: string; label: string }[] {
  const route = findRoute(pathname);
  if (!route || pathname === '/') return [];
  const chain: NavNode[] = [];
  let entry = ALL.find(e => e.node === route) ?? null;
  while (entry) { chain.unshift(entry.node); entry = entry.parent ? ALL.find(e => e.node === entry!.parent) ?? null : null; }
  const crumbs = [{ path: '/', label: lang === 'es' ? 'Inicio' : 'Home' }, ...chain.map(n => ({ path: n.path.includes(':') ? pathname : n.path, label: labelOf(n, lang) }))];
  return crumbs.filter((c, i) => i === 0 || c.path !== crumbs[i - 1].path);
}

// Every concrete public URL that should be in the sitemap (dynamic paths are listed by their own config).
export function sitemapPaths(): string[] {
  const out = new Set<string>();
  for (const n of allRoutes()) {
    if ((n.access ?? 'public') !== 'public' || n.index === false || n.path.includes(':')) continue;
    out.add(n.path);
  }
  for (const r of Object.keys(REDIRECTS)) out.delete(r);
  return [...out].sort((a, b) => (a === '/' ? -1 : b === '/' ? 1 : a.localeCompare(b)));
}

// Paths kept out of search engines: signed-in areas, admin, checkout and answer pages.
export function noindexPatterns(): string[] {
  const pats = allRoutes().filter(n => (n.access ?? 'public') !== 'public' || n.index === false)
    .map(n => `^${n.path.replace(/:[^/]+/g, '[^/]+')}$`);
  return [...new Set([...pats, '^/admin(/.*)?$', '^/portal(/.*)?$', '^/checkout(/.*)?$', '^/search(/.*)?$', '^/ai-search(/.*)?$'])];
}

export function robotsTxt(origin: string): string {
  const disallow = ['/admin', '/portal', '/account', '/settings', '/checkout', '/search', '/ai-search', '/recents', '/favorites', '/projects', '/partners/dashboard', '/build/my-projects', '/create/my-media', '/video/edit', '/video/account', '/start', '/login', '/register', '/forgot-password', '/reset-password', '/api/'];
  return ['User-agent: *', ...disallow.map(d => `Disallow: ${d}`), 'Allow: /', '', `Sitemap: ${origin}/sitemap.xml`, ''].join('\n');
}

// Footer columns, from the same tree.
export function footerColumns(lang: Lang = 'en') {
  const group = (id: string) => NAV_GROUPS.flatMap(g => g.items).find(n => n.id === id);
  const kids = (id: string) => (group(id)?.children ?? []).map(n => ({ to: n.path, label: labelOf(n, lang) }));
  const legal = OTHER_PAGES.find(n => n.id === 'legal')!.children!;
  return [
    { title: lang === 'es' ? 'Buscar' : 'Search', links: [{ to: '/search', label: lang === 'es' ? 'Búsqueda con IA' : 'AI Search' }, { to: '/discover', label: labelOf(group('discover')!, lang) }, { to: '/pricing/search', label: lang === 'es' ? 'Planes de búsqueda' : 'Search plans' }, { to: '/about/ai-engines', label: lang === 'es' ? 'Nuestros motores de IA' : 'Our AI engines' }] },
    { title: lang === 'es' ? 'Construir' : 'Build', links: [...kids('build').filter(l => l.to !== '/build/my-projects'), { to: '/templates', label: labelOf(group('templates')!, lang) }, { to: '/create', label: labelOf(group('create')!, lang) }] },
    { title: lang === 'es' ? 'Servicios' : 'Services', links: kids('services') },
    { title: lang === 'es' ? 'Áreas' : 'Areas', links: kids('areas') },
    { title: lang === 'es' ? 'Precios' : 'Pricing', links: kids('pricing') },
    { title: lang === 'es' ? 'Ayuda' : 'Help', links: [...kids('help'), { to: '/contact', label: lang === 'es' ? 'Contacto' : 'Contact' }, { to: '/pay', label: lang === 'es' ? 'Pagar en línea' : 'Pay online' }] },
    { title: 'Legal', links: legal.map(n => ({ to: n.path, label: n.label })) },
  ];
}
