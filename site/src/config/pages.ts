// Copy for the simple content pages, keyed by path. Rendered by pages/InfoPage.jsx (one H1, sections, calls to
// action) and read by the SEO manifest at build time, so the static HTML and the app always say the same thing.
// Nothing here claims clients, results, reviews or numbers we cannot show.

export interface Section { h2: string; text?: string; items?: { title: string; text?: string; to?: string }[] }
export interface Cta { label: string; to: string; primary?: boolean }
export interface PageCopy { title: string; description: string; h1: string; intro: string; sections: Section[]; ctas?: Cta[]; noindex?: boolean; earlyAccess?: string }

export const PAGES: Record<string, PageCopy> = {
  '/discover': {
    title: 'Discover: Ideas, Guides and Local Questions', h1: 'Discover',
    description: 'Ideas to ask Vivid AI Search about: local questions for Greater Houston, SE Texas and SW Louisiana, how-to guides, shopping comparisons and business help.',
    intro: 'Not sure what to ask? Start with one of these. Every answer comes with numbered sources you can check.',
    sections: [
      { h2: 'Around here', items: [
        { title: 'Things to do in Houston this weekend', to: '/search?q=Things%20to%20do%20in%20Houston%20this%20weekend' },
        { title: 'Best family restaurants in Katy', to: '/search?q=Best%20family%20restaurants%20in%20Katy' },
        { title: 'Hurricane season checklist for Southeast Texas', to: '/search?q=Hurricane%20season%20checklist%20for%20Southeast%20Texas' },
        { title: 'Events in Lake Charles this month', to: '/search?q=Events%20in%20Lake%20Charles%20this%20month' },
      ] },
      { h2: 'How do I…', items: [
        { title: 'Fix a running toilet', to: '/search?q=How%20do%20I%20fix%20a%20running%20toilet' },
        { title: 'Lower my electric bill in summer', to: '/search?q=How%20do%20I%20lower%20my%20electric%20bill%20in%20a%20Texas%20summer' },
        { title: 'Read a car repair estimate', to: '/search?q=How%20do%20I%20read%20a%20car%20repair%20estimate' },
      ] },
      { h2: 'For your business', items: [
        { title: 'Get on Google Maps', to: '/search?q=How%20do%20I%20get%20my%20business%20on%20Google%20Maps' },
        { title: 'Price my services', to: '/search?q=How%20should%20I%20price%20my%20services' },
        { title: 'Ask for more reviews', to: '/search?q=Ideas%20to%20get%20more%20Google%20reviews' },
      ] },
    ],
    ctas: [{ label: 'Ask anything', to: '/', primary: true }, { label: 'Browse templates', to: '/templates' }],
  },
  '/build': {
    title: 'Build a Website or App with Vivid Engine', h1: 'Build',
    description: 'Plan a website or app with AI, build it yourself with our builders, or have our local team build it for you. Websites from $999 done for you.',
    intro: 'Three ways to get something built: plan it with AI, build it yourself, or let our team build it for you.',
    sections: [
      { h2: 'Choose how', items: [
        { title: 'Plan it with AI', text: 'Describe your business in the ask box (Build mode) and get a page-by-page plan you can keep.', to: '/?mode=build' },
        { title: 'Build it yourself', text: 'Our Website and App Builders are opening soon. Join early access to hold today’s price.', to: '/build/website' },
        { title: 'We build it for you', text: 'Custom websites from $999, each with 3 months of the matching plan included.', to: '/pricing/custom-builds' },
      ] },
      { h2: 'What we build', items: [
        { title: 'Websites', to: '/build/website' }, { title: 'Apps and client portals', to: '/build/app' }, { title: 'Domains and email', to: '/build/domains' },
      ] },
    ],
    ctas: [{ label: 'Get a quote', to: '/quote', primary: true }, { label: 'Book a free consultation', to: '/consultation' }],
  },
  '/build/website': {
    title: 'Website Builder and Custom Websites', h1: 'Build a website',
    description: 'Build your own site with the Vivid Website Builder (early access) or have us build a custom, mobile-first website from $999.',
    intro: 'Make your own site with our builder, or have our team design and build it for you. Either way you get a fast, mobile-first site you can grow.',
    earlyAccess: 'web_core',
    sections: [
      { h2: 'Website Builder', text: 'Spark, Core, Business and Business Elite plans, priced 13% below the average of Wix, Squarespace and Webflow. The builder is opening soon: join early access and we will hold your price.', items: [{ title: 'See website plans', to: '/pricing/websites' }] },
      { h2: 'We build it for you', text: 'Starter ($999) and Launch ($1,500) custom sites include 3 months of the matching website plan. We plan the pages with you first.', items: [{ title: 'See build packages', to: '/pricing/custom-builds' }, { title: 'Website design service', to: '/services/website-design' }] },
    ],
    ctas: [{ label: 'Join early access', to: '/contact?topic=early-access&plan=web_core', primary: true }, { label: 'Get a quote', to: '/quote' }],
  },
  '/build/app': {
    title: 'App Builder and Custom App Development', h1: 'Build an app',
    description: 'Build your own app with the Vivid App Builder (early access) or have us build a custom web or Google Play app with logins and a client portal.',
    intro: 'From a simple internal tool to a client portal with secure logins, there are two ways to get your app.',
    earlyAccess: 'app_starter',
    sections: [
      { h2: 'App Builder', text: 'Starter, Builder, Pro and Elite plans with monthly credits, priced 13% below the average of Base44, Lovable, Bolt and Replit. Opening soon.', items: [{ title: 'See App Builder plans', to: '/pricing/app-builder' }] },
      { h2: 'Custom apps', text: 'Full Engine builds start at $3,500 and are quoted after a consultation: web apps, Google Play apps, client portals and secure logins.', items: [{ title: 'Custom app development', to: '/services/custom-app-development' }] },
    ],
    ctas: [{ label: 'Join early access', to: '/contact?topic=early-access&plan=app_starter', primary: true }, { label: 'Book a free consultation', to: '/consultation' }],
  },
  '/build/domains': {
    title: 'Domains and Business Email', h1: 'Domains and email',
    description: 'We find, register and manage your web address with DNS, SSL and business email set up for you. Managed domain leasing $9.95/mo.',
    intro: 'Your web address is part of your brand. We can find a good one, register it, and manage DNS, SSL and email so you never have to.',
    sections: [
      { h2: 'Options', items: [
        { title: 'Managed domain leasing', text: '$9.95/mo. Registration, DNS, SSL and renewals handled. Leasing does not transfer ownership.', to: '/domain-leasing' },
        { title: 'Business email', text: '$6 per user per month.', to: '/pricing/custom-builds' },
        { title: 'Included with Turnkey Care', text: 'One domain is included with the $99/mo Turnkey Care plan.', to: '/maintenance' },
      ] },
    ],
    ctas: [{ label: 'Ask about a domain', to: '/contact?topic=domain', primary: true }],
  },
  '/templates': {
    title: 'Templates for Search, Build and Business', h1: 'Templates',
    description: 'Ready-made prompts for Vivid AI Search: compare products, plan a website, write social posts, price your services and more.',
    intro: 'Pick a template, fill in the blanks, and ask. Templates open in the ask box so you can edit them first.',
    sections: [],
    ctas: [{ label: 'Ask anything', to: '/', primary: true }],
  },
  '/create': {
    title: 'Create Images, Video and Social Content', h1: 'Create',
    description: 'Make video in Vivid Video Studio, get image and post ideas from AI, or have our team produce a professional video for your business.',
    intro: 'Make it yourself with our tools, or have our team make it for you.',
    sections: [
      { h2: 'Make it yourself', items: [
        { title: 'Video Studio', text: 'Edit in your browser with templates, AI captions and voiceover.', to: '/create/video' },
        { title: 'Images and posts', text: 'Ideas, captions and image prompts in Create mode.', to: '/create/images' },
      ] },
      { h2: 'We make it for you', items: [{ title: 'Video production', text: 'Owner Spotlight videos from $1,495, social clips from $350.', to: '/create/production' }] },
    ],
    ctas: [{ label: 'Open Video Studio', to: '/video', primary: true }, { label: 'See production pricing', to: '/pricing/production' }],
  },
  '/create/images': {
    title: 'Create Images and Social Posts with AI', h1: 'Images and posts',
    description: 'Use Create mode in Vivid AI Search for image ideas, captions, flyers and social posts for your business. Gemini handles pictures and files.',
    intro: 'Describe what you need and Create mode will draft it: image ideas, flyer copy, captions and hashtags. Attach a photo when you are signed in and ask Gemini about it.',
    sections: [
      { h2: 'Try', items: [
        { title: 'Ideas for a grand opening flyer', to: '/search?q=Ideas%20for%20a%20grand%20opening%20flyer' },
        { title: 'Write captions for five social posts', to: '/search?q=Write%20captions%20for%205%20social%20posts%20for%20my%20business' },
        { title: 'Logo ideas for a coffee truck', to: '/search?q=Logo%20ideas%20for%20a%20coffee%20truck' },
      ] },
    ],
    ctas: [{ label: 'Open the ask box', to: '/?mode=create', primary: true }],
  },
  '/create/video': {
    title: 'Video Studio: Edit Video in Your Browser', h1: 'Video Studio',
    description: 'Edit video in your browser with a timeline, templates, AI captions, AI voiceover and script-to-video. Free plan included.',
    intro: 'Vivid Video Studio runs in your browser. Your files stay on your computer while you edit.',
    sections: [{ h2: 'What you can do', items: [{ title: 'Timeline editing and templates' }, { title: 'AI captions and voiceover' }, { title: 'Script to video' }] }],
    ctas: [{ label: 'Open Video Studio', to: '/video', primary: true }, { label: 'Video Studio plans', to: '/video/pricing' }],
  },
  '/create/production': {
    title: 'Video Production: Spotlights, Ads and Social Clips', h1: 'Video production',
    description: 'Owner Spotlight videos from $1,495, full promos, ad cuts and social clips from $350, made by our team for your business.',
    intro: 'When you want it done by people, we plan, shoot and edit it for you.',
    sections: [{ h2: 'Packages', items: [
      { title: 'Owner Spotlight Basic', text: '$1,495', to: '/pricing/production' }, { title: 'Standard', text: '$2,950', to: '/pricing/production' },
      { title: 'Pro Ad Premium', text: '$5,950', to: '/pricing/production' }, { title: 'Social clips', text: '$350 each or 5 for $1,500', to: '/pricing/production' },
    ] }],
    ctas: [{ label: 'Book a free consultation', to: '/consultation?topic=production', primary: true }, { label: 'See all production pricing', to: '/pricing/production' }],
  },
  '/business': {
    title: 'Business Help for Local Businesses', h1: 'Business Help',
    description: 'Practical help running a local business: marketing ideas, Google Business Profile, social media, reviews and simple business plans, with AI and a local team.',
    intro: 'Ask in Business Help mode, use a template, or hand it to our team.',
    sections: [{ h2: 'Topics', items: [
      { title: 'Marketing', text: 'Promotions, flyers and seasonal ideas.', to: '/business/marketing' },
      { title: 'Google Business Profile', text: 'Get found on Google Maps and Search.', to: '/business/google-profile' },
      { title: 'Social media', text: 'What to post, how often, and where.', to: '/business/social' },
      { title: 'Reviews', text: 'Ask for reviews and answer them well.', to: '/business/reviews' },
      { title: 'Business plans', text: 'One-page plans, pricing and costs.', to: '/business/plans' },
    ] }],
    ctas: [{ label: 'Ask a business question', to: '/?mode=biz', primary: true }, { label: 'Local SEO service', to: '/services/local-seo' }],
  },
  '/business/marketing': {
    title: 'Marketing Help for Local Businesses', h1: 'Marketing help',
    description: 'Marketing ideas for local businesses: promotions, flyers, email and seasonal campaigns, drafted with AI and reviewed by you.',
    intro: 'Good local marketing is simple and consistent. Use AI to draft it, then make it yours.',
    sections: [{ h2: 'Start with', items: [
      { title: 'Plan a three-month promotion calendar', to: '/search?q=Plan%20a%20three-month%20promotion%20calendar%20for%20my%20business' },
      { title: 'Write a grand opening email', to: '/search?q=Write%20a%20grand%20opening%20email%20for%20my%20business' },
      { title: 'Ideas for a slow season', to: '/search?q=Marketing%20ideas%20for%20a%20slow%20season' },
    ] }],
    ctas: [{ label: 'Ask a marketing question', to: '/?mode=biz', primary: true }, { label: 'Google Ads management', to: '/services/local-seo' }],
  },
  '/business/google-profile': {
    title: 'Google Business Profile Help', h1: 'Google Business Profile',
    description: 'Set up and improve your Google Business Profile: categories, hours, photos, service areas and posts, so local customers can find you.',
    intro: 'For most local businesses, the Google listing is the first thing customers see. Make it complete and keep it current.',
    sections: [{ h2: 'Checklist', items: [
      { title: 'The right primary category and a few secondary ones' }, { title: 'Accurate hours, including holidays' },
      { title: 'Service areas that match where you really work' }, { title: 'Recent photos of your work, team and place' },
      { title: 'A website link to a page that matches the listing' }, { title: 'Replies to every review' },
    ] }],
    ctas: [{ label: 'Ask about my listing', to: '/search?q=What%20should%20my%20Google%20Business%20Profile%20include', primary: true }, { label: 'Have us set it up', to: '/services/local-seo' }],
  },
  '/business/social': {
    title: 'Social Media Help for Small Businesses', h1: 'Social media',
    description: 'What to post, how often and where: social media ideas, captions and short video for small businesses, drafted with AI.',
    intro: 'Pick one or two places your customers really are, and post there regularly.',
    sections: [{ h2: 'Start with', items: [
      { title: 'Write a month of posts', to: '/search?q=Write%20a%20month%20of%20social%20posts%20for%20my%20business' },
      { title: 'Short video ideas', to: '/search?q=Short%20video%20ideas%20for%20my%20business' },
      { title: 'Social clips made for you', text: 'From $350 each.', to: '/pricing/production' },
    ] }],
    ctas: [{ label: 'Ask a social media question', to: '/?mode=biz', primary: true }],
  },
  '/business/reviews': {
    title: 'Get and Answer Customer Reviews', h1: 'Reviews',
    description: 'How to ask customers for reviews, and how to reply to good and bad reviews professionally. Drafts with AI, your voice.',
    intro: 'Reviews help new customers decide. Ask at the right moment, make it easy, and answer every one.',
    sections: [{ h2: 'Start with', items: [
      { title: 'Ideas to get more Google reviews', to: '/search?q=Ideas%20to%20get%20more%20Google%20reviews' },
      { title: 'Reply to a bad review', to: '/search?q=How%20do%20I%20reply%20to%20a%20bad%20review%20professionally' },
    ] }],
    ctas: [{ label: 'Draft a review reply', to: '/?mode=biz', primary: true }],
  },
  '/business/plans': {
    title: 'Simple Business Plans and Pricing Help', h1: 'Business plans',
    description: 'Write a one-page business plan, price your services and estimate costs, with AI help and sources you can check.',
    intro: 'A one-page plan is enough to start: who your customers are, what you charge, what it costs, and what you will do first.',
    sections: [{ h2: 'Start with', items: [
      { title: 'One-page business plan', to: '/search?q=Help%20me%20write%20a%20one-page%20business%20plan' },
      { title: 'Price my services', to: '/search?q=How%20should%20I%20price%20my%20services' },
    ] }],
    ctas: [{ label: 'Start a plan', to: '/?mode=biz', primary: true }],
  },
  '/partners': {
    title: 'Become a Vivid Engine Partner', h1: 'Become a Vivid Engine Partner',
    description: 'List your local business in Vivid Engine Local Businesses and appear in clearly labeled sponsored cards. Bronze to Platinum tiers from $129/mo.',
    intro: 'Partners are local businesses listed in Local Businesses and shown in labeled sponsored cards after related answers.',
    sections: [
      { h2: 'How it works', items: [
        { title: 'Labeled, always', text: 'Listings say "Vivid Engine Partner" and sponsored cards say "Sponsored · Vivid Engine Partners".' },
        { title: 'After the answer, never inside it', text: 'At most two cards, after the answer, and never beside an answer grounded with Google Search. Paying never changes the answer.' },
        { title: 'Simple tiers', text: 'Bronze, Silver, Gold and Platinum, 10% off on yearly billing.', to: '/partners/tiers' },
      ] },
    ],
    ctas: [{ label: 'Apply', to: '/partners/apply', primary: true }, { label: 'See partner tiers', to: '/partners/tiers' }, { label: 'How recommendations work', to: '/legal/recommendations' }],
  },
  '/partners/tiers': {
    title: 'Partner Tiers: Bronze to Platinum', h1: 'Partner tiers',
    description: 'Vivid Engine Partner tiers: Bronze $129, Silver $234, Gold $399 and Platinum $749 a month, 10% off yearly. Labeled listings and sponsored cards.',
    intro: 'Every tier is labeled and follows the same rules. Higher tiers add listings, sponsored cards and reporting.',
    sections: [],
    ctas: [{ label: 'Apply', to: '/partners/apply', primary: true }, { label: 'Partner Advertising Agreement', to: '/legal/partner-agreement' }],
  },
  '/partners/apply': {
    title: 'Apply to Become a Vivid Engine Partner', h1: 'Apply to be a partner',
    description: 'Tell us about your business to apply for a Vivid Engine Partner listing. We review every application before a listing goes live.',
    intro: 'Tell us about your business and the tier you are interested in. We review every application and confirm the details with you before anything goes live.',
    sections: [],
    ctas: [],
  },
  '/portfolio': {
    title: 'Portfolio: Websites, Apps and Tools We Build', h1: 'Portfolio',
    description: 'The kind of websites, apps and business tools Vivid Engine Solutions builds for local businesses. Ask us for examples relevant to your business.',
    intro: 'We are a small local team, and we would rather show you relevant work in person than fill a page with logos. Ask for examples like your business with your quote.',
    sections: [{ h2: 'What we build', items: [
      { title: 'Service-business websites', text: 'Clear service pages, service areas and quote forms that reach your phone.' },
      { title: 'Booking and payments', text: 'Online booking with calendar sync and Square payments.' },
      { title: 'Client portals and apps', text: 'Secure logins, project status, documents and invoices.' },
      { title: 'POS and CRM', text: 'Custom point of sale on Square and a CRM for clients and jobs.' },
    ] }],
    ctas: [{ label: 'Ask for examples', to: '/quote', primary: true }],
  },
  '/process': {
    title: 'Our Process: From Sit-Down to Turnkey Care', h1: 'How we work',
    description: 'A free audit, an in-person sit-down, design and build with check-ins, launch, add-ons as you grow, and monthly care. Written quote before work starts.',
    intro: 'A real, ordered process, not a form you fill out and wait on. Every project gets a written quote before work starts.',
    sections: [],
    ctas: [{ label: 'Book a free consultation', to: '/consultation', primary: true }, { label: 'See pricing', to: '/pricing' }],
  },
  '/pay': {
    title: 'Pay Online', h1: 'Pay online',
    description: 'Pay an approved Vivid Engine invoice online by card, Apple Pay, Google Pay, Cash App Pay or Afterpay where eligible. Processed securely by Square.',
    intro: 'Pay an approved invoice or a one-time purchase online. Payments are processed by Square; your card details never touch our servers.',
    sections: [],
    ctas: [],
  },
  '/quote': {
    title: 'Get a Quote', h1: 'Get a quote',
    description: 'Tell us about your website, app or project and get a written quote from Vivid Engine Solutions. Free, no pressure, usually within one business day.',
    intro: 'Tell us what you need. We reply with questions or a written quote, and nothing starts until you approve it.',
    sections: [],
    ctas: [],
  },
  '/consultation': {
    title: 'Book a Free Consultation', h1: 'Book a free consultation',
    description: 'Book a free consultation with Vivid Engine Solutions, in person across Greater Houston, SE Texas and SW Louisiana, or by phone or WhatsApp.',
    intro: 'We can meet at your business, talk by phone, or chat on WhatsApp. Tell us a good time and what you would like to talk about.',
    sections: [],
    ctas: [],
  },
  '/help': {
    title: 'Help Center', h1: 'Help center',
    description: 'Help with Vivid AI Search, saved history, plans and billing, websites, apps and client tools. Reach a person on WhatsApp.',
    intro: 'Find an answer, or reach a person. We are a local team and we answer WhatsApp messages ourselves.',
    sections: [
      { h2: 'AI Search', items: [
        { title: 'Which engine answers my question?', text: 'Auto picks Perplexity for live web search, Claude for writing and reasoning, and Gemini for pictures and files. Every answer says which one, and why.', to: '/about/ai-engines' },
        { title: 'Are my conversations saved?', text: 'Only on paid plans, and never in private mode. Guests and Free accounts save nothing.', to: '/recents' },
        { title: 'How many questions can I ask?', text: 'Guests get a few searches a day, Free accounts 5 a day, and paid plans more.', to: '/pricing/search' },
      ] },
      { h2: 'Plans and billing', items: [
        { title: 'Change or cancel a plan', to: '/ai-search/account' },
        { title: 'Refund policy', to: '/legal/refund' },
        { title: 'Pay an invoice', to: '/pay' },
      ] },
      { h2: 'Websites and client tools', items: [
        { title: 'Client support', to: '/support' }, { title: 'Client portal', to: '/portal' }, { title: 'FAQ', to: '/faq' },
      ] },
    ],
    ctas: [{ label: 'Contact us', to: '/contact', primary: true }],
  },
  '/about/ai-engines': {
    title: 'Our AI Engines: Perplexity, Claude and Gemini', h1: 'Our AI engines',
    description: 'Vivid AI Search sends each question to Perplexity, Claude or Gemini, or all three. How we choose, how sources work, and what we store.',
    intro: 'Vivid AI Search uses three engines from three companies. Each is good at different things, so we pick the one that fits your question, or ask all three.',
    sections: [
      { h2: 'Who does what', items: [
        { title: 'Perplexity', text: 'Live web search with numbered citations. Our default for questions about the world as it is now.' },
        { title: 'Claude', text: 'Reasoning, writing and code. Used for drafting, explaining and planning, with web search when needed.' },
        { title: 'Gemini', text: 'Pictures, video and files. Used when you attach something or ask about images.' },
        { title: 'Combined', text: 'On paid plans, all three answer and one writes a single answer from them, saying where they disagree.' },
      ] },
      { h2: 'What we promise', items: [
        { title: 'You can see which engine answered', text: 'Every answer shows "via" the engine, and "Why this engine?" explains the choice.' },
        { title: 'Sources are numbered', text: 'Markers like [2] link to the source they came from. Check important information yourself.' },
        { title: 'Your data', text: 'Each engine processes your question to answer it. We save conversations only on paid plans and never in private mode.', to: '/legal/privacy' },
        { title: 'No endorsement', text: 'We name the engines so you know who answered. That does not mean those companies endorse Vivid Engine.' },
      ] },
    ],
    ctas: [{ label: 'Ask a question', to: '/', primary: true }, { label: 'AI disclaimer', to: '/legal/ai-disclaimer' }],
  },
};

export const pageCopy = (path: string): PageCopy | null => PAGES[path] ?? null;
