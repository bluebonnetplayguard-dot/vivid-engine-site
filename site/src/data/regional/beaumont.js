const beaumont = {
  path: '/locations/beaumont-web-design',
  title: 'Web Design & App Development in Beaumont, TX | Vivid Engine Solutions',
  description: 'Custom websites, apps, POS and CRM for Beaumont, Port Arthur, Orange and Southeast Texas businesses. Locally owned, in-person consultations, sites from $999.',
  parent: 'Locations', parentPath: '/#areas', crumb: 'Beaumont', breadcrumbName: 'Beaumont Web Design',
  eyebrow: 'Beaumont · Port Arthur · Orange', heading: 'Web Design & App Development in', highlight: 'Beaumont, TX',
  lede: 'Custom websites, mobile apps, POS and CRM systems for Southeast Texas businesses, built by a local team that meets you in person and keeps everything running after launch.',
  primary: 'Get a free site audit', secondary: ['See pricing', '/#pricing'], where: 'Serving Jefferson, Orange & Hardin counties',
  serviceName: 'Web Design & App Development in Beaumont, TX',
  serviceTypes: ['Website design', 'Website maintenance', 'App development', 'Domain leasing', 'POS and CRM systems'],
  schemaAreas: [
    ['City', 'Beaumont', 'Jefferson County, Texas'], ['City', 'Port Arthur'], ['City', 'Nederland'], ['City', 'Orange'], ['City', 'Vidor'], ['City', 'Lumberton'], ['City', 'Silsbee'],
    ['AdministrativeArea', 'Jefferson County, Texas'], ['AdministrativeArea', 'Orange County, Texas'], ['AdministrativeArea', 'Hardin County, Texas'],
  ],
  offers: [
    { '@type': 'Offer', name: 'Starter: custom website, up to 5 pages', price: '999', priceCurrency: 'USD' },
    { '@type': 'Offer', name: 'Launch: custom website, up to 10 pages', price: '1500', priceCurrency: 'USD' },
    { '@type': 'Offer', name: 'Basic Care: hosting, security and backups', priceSpecification: { '@type': 'UnitPriceSpecification', price: '49', priceCurrency: 'USD', unitText: 'MONTH' } },
    { '@type': 'Offer', name: 'Turnkey Care: full maintenance, domain, edits and site assistant', priceSpecification: { '@type': 'UnitPriceSpecification', price: '99', priceCurrency: 'USD', unitText: 'MONTH' } },
  ],
  local: {
    label: 'Local, in person', title: 'We come to your shop or office in the Golden Triangle',
    paragraphs: [
      'Most web companies want a video call and a form. We drive to you. Whether you run a restaurant on Calder, a contractor yard in Lumberton or a storefront in Port Arthur, we sit down at your business, see how you actually work, and plan the build around it.',
      "After launch we don't disappear. **We host it, secure it, back it up and keep it updated**, so your site keeps bringing in customers while you run your business.",
    ],
    coverageTitle: 'Where we meet clients in Southeast Texas',
    coverage: [['Jefferson County', 'Beaumont, Port Arthur, Nederland, Port Neches, Groves'], ['Orange County', 'Orange, Vidor, Bridge City'], ['Hardin County', 'Lumberton, Silsbee, Kountze']],
    related: 'Just across the state line? See [Lake Charles & Southwest Louisiana](/locations/lake-charles-app-development).',
  },
  sections: [
    {
      label: 'What we build for Beaumont businesses', title: 'Everything your business needs online, under one roof', description: 'One local team for the whole job, instead of five different vendors.', band: true, columns: 3,
      cards: [
        { icon: 'Monitor', title: 'Custom website design', paragraphs: ['Fully custom, mobile-first sites that load fast and turn visitors into calls. No drag-and-drop templates.'], tags: ['Mobile-first', 'Fast'] },
        { icon: 'Settings', title: 'Website maintenance & hosting', paragraphs: ['Hosting, security patches, backups, monitoring and content updates handled for you every month.'], tags: ['From $49/mo'] },
        { icon: 'Smartphone', title: 'Mobile apps', paragraphs: ['Apps your customers install on iPhone and Android, including Google Play listings. [More on app development](/services/custom-app-development).'], tags: ['iOS', 'Android'] },
        { icon: 'CreditCard', title: 'POS built on Square', paragraphs: ['In-person and online payments built right into your site or app, with inventory and receipts in one place.'], tags: ['Square', 'Inventory'] },
        { icon: 'Calendar', title: 'CRM with calendar sync', paragraphs: ['Track clients, jobs and inventory, with bookings synced to Google Calendar automatically.'], tags: ['CRM', 'Google Calendar'] },
        { icon: 'Globe', title: 'Domains, SEO & Google Business Profile', paragraphs: ['Domain leasing, business email, local SEO and a Google Business Profile set up so Beaumont customers find you first.'], tags: ['Local SEO', 'Domains'] },
      ],
    },
    {
      label: "How it's built", title: 'Modern technology, maintained for you', description: "You don't need to know any of this. It just means your site is fast, secure and easy to grow.",
      cards: [
        { title: 'Websites & web apps', paragraphs: ['React and modern HTML/CSS, installable web apps (PWA) that work offline, built mobile-first for every browser.'] },
        { title: 'iPhone & Android', paragraphs: ['Apps customers install from Google Play or their home screen, with Sign in with Apple, passkeys and 2-step verification.'] },
        { title: 'Payments', paragraphs: ['Square-powered POS and online checkout, plus Square payment links and customer financing options.'] },
        { title: 'Back office', paragraphs: ['Custom CRM, client portals and Google Calendar sync on secure cloud hosting with daily backups.'] },
      ],
    },
    {
      label: 'How it works', title: 'From first sit-down to launch', band: true,
      steps: [['Free audit', "We review your current site and flag what's costing you customers."], ['In-person sit-down', 'We meet at your Beaumont-area business and scope the build.'], ['Design & build', 'Custom design and development, with check-ins as we go.'], ['Launch & care', 'Go live, then we handle hosting, security and updates monthly.']],
    },
    {
      label: 'Pricing', title: 'Straightforward and spelled out',
      prices: [['Starter', '$999', 'one-time', 'Up to 5 pages, custom mobile-first design, contact form and Google Business Profile setup.'], ['Launch · best value', '$1,500', 'one-time', 'Up to 10 pages, blog, gallery, and inquiries sent to your phone by text and email.'], ['Monthly care', '$49', '/mo and up', 'Hosting, security and backups. Turnkey Care ($99/mo) adds a domain, edits and the site assistant.']],
      paymentNote: 'Add only what you need: domains $9.95/mo, online booking, Square POS, CRM, local SEO and more.', addonsLink: true,
    },
  ],
  faqTitle: 'Beaumont web design FAQ',
  faqs: [
    ['Do you meet with Beaumont businesses in person?', 'Yes. We come to your shop or office anywhere in Jefferson, Orange and Hardin counties to plan the build face to face. No Zoom required.'],
    ['How much does a website cost?', 'A custom website starts at $999 one-time for up to 5 pages, or $1,500 for up to 10 pages with a blog and gallery. Hosting, security and backups start at $49 per month, and Turnkey Care at $99 per month adds a domain, monthly edits and the site assistant. Extras like online booking, Square POS or local SEO are optional add-ons.'],
    ['Can you take over my existing website?', "Yes. We start with a free audit of your current site, then either rebuild it or take over hosting, security and updates so you don't have to manage it."],
    ['Can I pay over time?', 'Invoices can be paid online through Square, and larger projects can be financed with monthly payments through Hearth, subject to credit approval.'],
  ],
  cta: { title: 'Ready for a website that works as hard as you do?', description: 'Tell us about your business and a local team member will follow up, usually the same day.', secondary: ['App development', '/services/custom-app-development'], related: [1, 2] },
};
export default beaumont;