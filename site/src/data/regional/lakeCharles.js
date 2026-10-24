const lakeCharles = {
  path: '/locations/lake-charles-app-development',
  title: 'App Development & Web Design in Lake Charles, LA | Vivid Engine Solutions',
  description: 'Custom iPhone & Android apps, websites, POS and CRM for Lake Charles and Sulphur businesses. We meet in person anywhere in Calcasieu Parish.',
  ogTitle: 'Custom App Development & Web Design in Lake Charles, LA',
  ogDescription: 'Apps, websites, POS and CRM for Southwest Louisiana businesses, with in-person consultations across Calcasieu, Cameron, Beauregard and Jefferson Davis parishes.',
  parent: 'Locations', parentPath: '/areas', crumb: 'Lake Charles', breadcrumbName: 'Lake Charles App Development',
  eyebrow: 'Lake Charles · Sulphur · Southwest Louisiana', heading: 'Custom App Development & Web Design in', highlight: 'Lake Charles, LA',
  lede: "Apps your customers install on their phones, client portals, booking tools, POS and CRM systems, designed with you in person and maintained by the same local team after launch.",
  primary: 'Plan your app', secondary: ['How we build apps', '/services/custom-app-development'], where: 'Serving Calcasieu, Cameron, Beauregard & Jefferson Davis parishes',
  serviceName: 'Custom App Development & Web Design in Lake Charles, LA',
  serviceTypes: ['Mobile app development', 'Web app development', 'Website design', 'POS and CRM systems', 'Website maintenance'],
  schemaAreas: [
    ['City', 'Lake Charles', 'Calcasieu Parish, Louisiana'], ['City', 'Sulphur'], ['City', 'Westlake'], ['City', 'Moss Bluff'], ['City', 'DeRidder'], ['City', 'Jennings'], ['City', 'Cameron'],
    ['AdministrativeArea', 'Calcasieu Parish, Louisiana'], ['AdministrativeArea', 'Cameron Parish, Louisiana'], ['AdministrativeArea', 'Beauregard Parish, Louisiana'], ['AdministrativeArea', 'Jefferson Davis Parish, Louisiana'],
  ],
  local: {
    label: 'We come to you', title: 'We come to your shop or office in Calcasieu Parish',
    paragraphs: [
      "An app only works if it fits how your crew, counter staff and customers already do things. So we don't plan it over a video call. We come out to your business in Lake Charles, Sulphur or wherever you're based, watch the real workflow, and design around it.",
      "Then we build it, put it in your customers' hands, and **stay on as your local support**: updates, security and changes as your business grows.",
    ],
    coverageTitle: 'Where we meet clients in Southwest Louisiana',
    coverage: [['Calcasieu Parish', 'Lake Charles, Sulphur, Westlake, Moss Bluff, Iowa, DeQuincy'], ['Cameron Parish', 'Cameron, Hackberry'], ['Beauregard Parish', 'DeRidder'], ['Jefferson Davis Parish', 'Jennings, Welsh']],
    related: 'On the Texas side? See [Beaumont & Southeast Texas](/locations/beaumont-web-design).',
  },
  sections: [
    {
      label: 'Apps for Southwest Louisiana businesses', title: 'What we build', description: 'Every app is custom. These are the kinds of tools local businesses ask us for most.', band: true, columns: 3,
      cards: [
        { title: 'Customer apps', paragraphs: ['Ordering, booking, loyalty and account apps your customers install on iPhone or Android, with your brand front and center.'], tags: ['iOS', 'Android', 'Google Play'] },
        { title: 'Booking & scheduling', paragraphs: ['Customers book themselves, and every appointment lands in your Google Calendar automatically. No more phone tag.'], tags: ['Calendar sync'] },
        { title: 'POS & payments', paragraphs: ['Square-powered point of sale for the counter and online, built into your app with inventory and receipts.'], tags: ['Square POS'] },
        { title: 'CRM & client portals', paragraphs: ['One place for clients, jobs, invoices and inventory, plus a secure portal where your clients log in.'], tags: ['CRM', 'Portals'] },
        { title: 'Staff & field tools', paragraphs: ['Job checklists, estimates, photo logs and time tracking for crews working across the parish.'], tags: ['Works offline'] },
        { title: 'Websites that match', paragraphs: ['A fast, mobile-first website that shares the same branding and data as your app. [See our web design work](/locations/beaumont-web-design).'], tags: ['Web design'] },
      ],
    },
    {
      label: 'Tech stack', title: 'Built on proven technology',
      cards: [
        { title: 'Front end', paragraphs: ['React and modern web standards, installable web apps (PWA) that load fast and keep working with weak signal.'] },
        { title: 'iOS & Android', paragraphs: ['Apps installed from Google Play or straight to the home screen, with Sign in with Apple, passkeys (Face ID / fingerprint) and 2-step verification.'] },
        { title: 'Payments & POS', paragraphs: ['Square for point of sale and online checkout. Square payment links and customer financing can be added too.'] },
        { title: 'Data & integrations', paragraphs: ['Secure cloud database and hosting with backups, Google Calendar sync and custom CRM connections.'] },
      ],
    },
    {
      label: 'How it works', title: "From idea to app in your customers' hands", band: true,
      steps: [['Sit-down at your business', 'We meet in person in Lake Charles or nearby and map what the app needs to do.'], ['Plan & quote', 'A clear scope and price before any build work starts.'], ['Design & build', 'You test it on your own phone as we go.'], ['Launch & support', 'Published, then maintained monthly by the same team.']],
    },
    {
      label: 'Pricing', title: 'Clear pricing, no surprises', description: 'Start with what you need and add features as you grow. Every project gets a written quote first.',
      prices: [['Installable app add-on', '$1,500', 'and up', 'Your site as an app on iPhone and Android, plus a Google Play listing.'], ['Full Engine', '$3,500', 'and up', 'Custom web or Google Play app with a client portal and secure logins.'], ['Monthly care', '$49', '/mo and up', 'Hosting, security and backups. Turnkey Care ($99/mo) adds edits, a domain and the site assistant.']],
      paymentNote: 'Websites start at $999. Add online booking ($299), Square POS (from $1,500) or a custom CRM (from $2,500).', addonsLink: true,
    },
  ],
  faqTitle: 'Lake Charles app development FAQ',
  faqs: [
    ['Do you build apps for iPhone and Android?', 'Yes. We build apps your customers and staff can install on iPhone and Android, list them on Google Play, and add sign-in with Apple, passkeys and 2-step verification.'],
    ['Will you come to my business in Lake Charles?', 'Yes. We meet in person anywhere in Calcasieu Parish, and in Cameron, Beauregard and Jefferson Davis parishes, to plan the app around how your business actually works.'],
    ['Do I need a website before an app?', "Not always. Many Southwest Louisiana businesses start with one custom site that also installs as an app, which keeps cost down. We'll recommend what fits during your free audit."],
    ['Who maintains the app after launch?', 'We do. Basic Care ($49/mo) keeps it hosted, secure and backed up. Turnkey Care ($99/mo) adds monthly edits, store listing changes, the site assistant and priority support.'],
  ],
  cta: { title: 'Have an app idea for your Lake Charles business?', description: "Tell us what you have in mind and we'll set up a time to meet at your business.", secondary: ['See pricing', '/pricing'], related: [2, 0] },
};
export default lakeCharles;