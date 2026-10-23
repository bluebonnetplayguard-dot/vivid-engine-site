// Sidebar and footer navigation. Every link points at a route that exists in App.jsx
// (or a section on the home page). Add a page to App.jsx first, then list it here.
export const NAV_GROUPS = [
  {
    id: 'main',
    items: [
      { id: 'search', label: 'Search', to: '/', icon: 'search' },
      { id: 'history', label: 'History', to: '/ai-search', icon: 'history', paid: true },
    ],
  },
  {
    id: 'create',
    label: 'Create',
    items: [
      { id: 'build', label: 'Build apps & sites', to: '/start', icon: 'code', children: [
        { label: 'Start a project', to: '/start' },
        { label: 'Custom app development', to: '/services/custom-app-development' },
        { label: 'Vivid Estimator', to: '/vivid-estimator' },
      ] },
      { id: 'video', label: 'Video Studio', to: '/video', icon: 'video', children: [
        { label: 'Open Video Studio', to: '/video' },
        { label: 'Video plans', to: '/video/pricing' },
      ] },
    ],
  },
  {
    id: 'company',
    label: 'Vivid Engine',
    items: [
      { id: 'services', label: 'Services', to: '/services', icon: 'services', children: [
        { label: 'Website design', to: '/services' },
        { label: 'Website maintenance', to: '/maintenance' },
        { label: 'Domain leasing', to: '/domain-leasing' },
        { label: 'App development', to: '/services/custom-app-development' },
      ] },
      { id: 'areas', label: 'Areas', to: '/service-areas', icon: 'map' },
      { id: 'portfolio', label: 'Portfolio', to: '/#work', icon: 'portfolio' },
      { id: 'process', label: 'Process', to: '/#process', icon: 'process' },
      { id: 'pricing', label: 'Pricing', to: '/pricing', icon: 'pricing', children: [
        { label: 'AI Search plans', to: '/ai-search/pricing' },
        { label: 'Websites & care', to: '/pricing' },
        { label: 'Video plans', to: '/video/pricing' },
      ] },
      { id: 'pay', label: 'Pay', to: '/#pay', icon: 'pay' },
      { id: 'help', label: 'Help & About', to: '/support', icon: 'help', children: [
        { label: 'Help & support', to: '/support' },
        { label: 'About us', to: '/about' },
        { label: 'FAQ', to: '/faq' },
        { label: 'Contact', to: '/contact' },
      ] },
    ],
  },
];

export const FOOTER_COLUMNS = [
  { title: 'Search', links: [{ label: 'Vivid AI Search', to: '/ai-search' }, { label: 'Search plans', to: '/ai-search/pricing' }, { label: 'History', to: '/ai-search' }] },
  { title: 'Build', links: [{ label: 'Start a project', to: '/start' }, { label: 'App development', to: '/services/custom-app-development' }, { label: 'Video Studio', to: '/video' }, { label: 'Vivid Estimator', to: '/vivid-estimator' }] },
  { title: 'Services', links: [{ label: 'Website design', to: '/services' }, { label: 'Website maintenance', to: '/maintenance' }, { label: 'Domain leasing', to: '/domain-leasing' }, { label: 'Service areas', to: '/service-areas' }] },
  { title: 'Pricing', links: [{ label: 'AI Search plans', to: '/ai-search/pricing' }, { label: 'Websites & care', to: '/pricing' }, { label: 'Video plans', to: '/video/pricing' }, { label: 'Pay online', to: '/#pay' }] },
  { title: 'Help', links: [{ label: 'Help & support', to: '/support' }, { label: 'About us', to: '/about' }, { label: 'FAQ', to: '/faq' }, { label: 'Contact', to: '/contact' }, { label: 'Client login', to: '/login?returnTo=%2Fportal' }] },
  { title: 'Legal', links: [{ label: 'Privacy Policy', to: '/privacy' }, { label: 'Delete account', to: '/delete-account' }] },
];
