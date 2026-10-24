export const TAB_ROOT_PATHS = ['/', '/portal', '/admin', '/admin/chat', '/admin/pos', '/settings'];
export const PAGES_WITH_OWN_HEADER = ['/portal/domain'];
export const PAGE_PARENTS = {
  '/admin/leads': { path: '/admin', label: 'Admin', title: 'Leads' },
  '/admin/quotes': { path: '/admin', label: 'Admin', title: 'Quotes' },
  '/admin/estimator': { path: '/admin', label: 'Admin', title: 'AI Estimator' },
  '/admin/invoices': { path: '/admin', label: 'Admin', title: 'Invoices' },
  '/admin/costs': { path: '/admin', label: 'Admin', title: 'Costs' },
  '/admin/logo': { path: '/admin', label: 'Admin', title: 'Logo Designer' },
  '/admin/marketing-drafts': { path: '/admin', label: 'Admin', title: 'Marketing Drafts' },
  '/admin/pricing': { path: '/admin', label: 'Admin', title: 'Market Pricing' },
  '/admin/billing': { path: '/admin', label: 'Admin', title: 'AI Billing' },
};

export function pageNavigation(pathname) {
  if (TAB_ROOT_PATHS.includes(pathname) || PAGES_WITH_OWN_HEADER.includes(pathname)) return null;
  if (/^\/portal\/projects\/[^/]+\/?$/.test(pathname)) return { path: '/portal', label: 'Portal', title: 'Project' };
  return PAGE_PARENTS[pathname] || null;
}

// Longest match distinguishes Chat and POS from other Admin screens.
export function tabRootFor(pathname, roots = TAB_ROOT_PATHS) {
  return [...roots].sort((a, b) => b.length - a.length).find(root => pathname === root || (root !== '/' && pathname.startsWith(root + '/')));
}