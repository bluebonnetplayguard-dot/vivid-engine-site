const appDevelopment = {
  path: '/services/custom-app-development',
  title: 'Custom App Development for Local Businesses | Vivid Engine Solutions',
  description: 'Custom iPhone, Android and web apps for SETX & SWLA businesses: booking, Square POS, CRM and client portals, built and maintained by a local team.',
  ogTitle: 'Custom App Development for Local Businesses',
  ogDescription: 'iPhone, Android and web apps for SETX and SWLA businesses, planned in person and maintained after launch.',
  parent: 'Services', parentPath: '/services', crumb: 'Custom App Development',
  eyebrow: 'iPhone · Android · Web', heading: 'Custom App Development for', highlight: 'SETX & SWLA', headingEnd: ' Businesses',
  lede: "Apps built around how your business actually runs: customer apps, booking, POS, CRM, client portals and staff tools. Planned with you in person, launched on your customers' phones, and maintained by the same local team.",
  primary: 'Plan your app', secondary: ['Which kind of app?', '/services/custom-app-development#options'], where: 'Beaumont · Port Arthur · Orange · Lake Charles · Sulphur',
  serviceName: 'Custom App Development', serviceTypes: 'Mobile and web app development',
  serviceDescription: 'Custom iPhone, Android and web apps for local businesses: customer apps, booking and scheduling, POS, CRM, client portals and staff tools, maintained after launch.',
  schemaAreas: [['AdministrativeArea', 'Jefferson County, Texas'], ['AdministrativeArea', 'Orange County, Texas'], ['AdministrativeArea', 'Hardin County, Texas'], ['AdministrativeArea', 'Calcasieu Parish, Louisiana'], ['AdministrativeArea', 'Cameron Parish, Louisiana'], ['AdministrativeArea', 'Beauregard Parish, Louisiana'], ['AdministrativeArea', 'Jefferson Davis Parish, Louisiana']],
  catalog: ['Customer mobile apps (iOS and Android)', 'Booking and scheduling apps with Google Calendar sync', 'Square POS systems', 'Custom CRM and client portals', 'Staff and field service tools'],
  sections: [
    {
      label: 'What we build', title: 'Apps that save time and bring in customers', columns: 3,
      cards: [
        { title: 'Customer apps', paragraphs: ["Ordering, booking, rewards and account apps with your branding, installed on your customers' phones."], tags: ['iOS', 'Android'] },
        { title: 'Booking & scheduling', paragraphs: ['Online booking that drops straight into Google Calendar, with reminders so fewer people no-show.'], tags: ['Google Calendar'] },
        { title: 'Square POS', paragraphs: ['Take payments at the counter, on the job site or online, with inventory and receipts in one system.'], tags: ['Square'] },
        { title: 'Custom CRM', paragraphs: ['Clients, jobs, quotes, invoices and inventory in one place, built for your workflow instead of a generic one.'], tags: ['CRM'] },
        { title: 'Client portals', paragraphs: ['A secure login where your clients see their projects, documents and invoices, and pay online.'], tags: ['Secure login'] },
        { title: 'Staff & field tools', paragraphs: ['Checklists, estimates, photo logs and time tracking for crews, designed to keep working with weak signal.'], tags: ['Offline-ready'] },
      ],
    },
    {
      id: 'options', label: 'Choosing the right kind of app', title: 'Installable web app, store app, or both?', description: "We'll recommend the right fit at your sit-down. Here's the short version.", band: true,
      cards: [
        { title: 'Installable web app', paragraphs: ["Runs from your website and installs to any phone's home screen in one tap. One build works on iPhone, Android and computers, and updates go live instantly with no store review.", '**Best for:** booking, client portals, staff tools, and businesses that want an app without the cost of two separate builds.'] },
        { title: 'Google Play & app store listing', paragraphs: ["The same app, also listed in the store so customers can search for it and install it the way they're used to. We handle the store listing, icons, screenshots and review process.", '**Best for:** customer-facing apps where being found in the store matters.'] },
      ],
    },
    {
      label: 'Tech stack', title: "What's under the hood",
      cards: [
        { title: 'Front end: React & PWA', paragraphs: ['React and modern web standards for fast, accessible screens that work on every phone and browser, installable and usable offline.'] },
        { title: 'iOS & Android delivery', paragraphs: ['Home-screen installs on iPhone and Android, plus Google Play publishing for store visibility.'] },
        { title: 'Sign-in & security', paragraphs: ['Email and password with 2-step verification, passkeys (Face ID / fingerprint) and Sign in with Apple. Admin areas are locked to staff only.'] },
        { title: 'Payments: Square', paragraphs: ['Square POS and checkout built in, Square payment links, and customer financing for bigger purchases. Card details never touch your app.'] },
        { title: 'Cloud back end', paragraphs: ['Secure cloud database, hosting and server functions with daily backups and monitoring.'] },
        { title: 'Integrations', paragraphs: ['Google Calendar sync, CRM data, email notifications and the tools your business already uses.'] },
      ],
    },
    {
      label: 'How it works', title: 'A clear process, start to finish', band: true,
      steps: [['In-person sit-down', 'We meet at your business and map what the app needs to do.'], ['Written scope & price', 'You approve features and cost before any build work starts.'], ['Build & test', 'You try it on your own phone as we go and give feedback.'], ['Launch & Turnkey Care', 'We publish it, then handle hosting, security and updates monthly.']],
    },
  ],
  showAreas: true, faqTitle: 'App development FAQ',
  faqs: [
    ["What's the difference between an installable web app and a store app?", "An installable web app runs from your website and can be added to any phone's home screen, so one build works everywhere and updates instantly. A store app is listed on Google Play or the App Store so customers can find it there. Many businesses start with an installable web app and add a store listing later."],
    ['How much does a custom app cost?', 'Turning your website into an installable app with a Google Play listing starts at $1,500. Fully custom apps with client portals and logins (Full Engine) start at $3,500. Add-ons like online booking ($299), Square POS (from $1,500) or a custom CRM (from $2,500) are optional. You get a written scope and price before any build work starts, and larger projects can be financed.'],
    ['How do you keep customer data secure?', 'Apps use secure sign-in with passwords plus 2-step verification, passkeys (Face ID or fingerprint) and Sign in with Apple. Card payments are handled by Square, so card details never touch your app.'],
    ['Do you maintain the app after it launches?', 'Yes. Basic Care ($49/mo) covers hosting, security updates and backups. Turnkey Care ($99/mo) adds monthly edits, store listing changes, the site assistant and priority support.'],
  ],
  cta: { title: 'Tell us about the app you need', description: "We'll set up a time to meet at your business, usually within the week.", secondary: ['Pay over time', '/pay'] },
};
export default appDevelopment;