// The nine service-area cities. Each has its own title, description, heading and copy so no two city pages read
// alike. Facts here are general geography only; nothing claims past clients or results.
// CONFIRM the city list before launch: the brief's copy was cut off after Beaumont (see BUSINESS.serviceAreas).

export interface Area {
  slug: string; city: string; state: 'TX' | 'LA'; county: string; region: string;
  lat: number; lng: number;
  title: string; description: string; h2: string;
  intro: string[];               // two or three paragraphs written for this city
  focus: string[];               // what local businesses here most often ask us for
  nearby: string[];
}

export const AREAS: Area[] = [
  {
    slug: 'houston', city: 'Houston', state: 'TX', county: 'Harris County', region: 'Greater Houston', lat: 29.7604, lng: -95.3698,
    title: 'Website Design, Apps & AI Search in Houston, TX',
    description: 'Custom websites, apps and AI tools for Houston small businesses, from the Heights to the Energy Corridor. Free consultation, in person or by phone.',
    h2: 'Built for a city where customers compare everything',
    intro: [
      'Houston customers usually find a business on their phone, compare two or three options, and call the one that answers their question fastest. A Houston website has to load quickly on a busy freeway exit, say clearly what you do and where, and make the next step obvious.',
      'We build sites and small apps for Houston businesses that want something better than a template: service pages written for the neighborhoods you actually serve, quote and booking forms that reach your phone, and a maintenance plan so the site keeps working after launch.',
    ],
    focus: ['Service businesses covering several parts of town', 'Restaurants and retail with online ordering', 'Professional offices that need booking and intake forms'],
    nearby: ['Katy', 'Pearland', 'Sugar Land', 'Waller'],
  },
  {
    slug: 'waller', city: 'Waller', state: 'TX', county: 'Waller County', region: 'Greater Houston', lat: 30.0566, lng: -95.9263,
    title: 'Websites & Online Tools for Waller, TX Businesses',
    description: 'Website design and maintenance for Waller and Waller County businesses along US 290. Simple, fast sites that work on a phone. Free consultation.',
    h2: 'Small-town reputation, online',
    intro: [
      'In Waller, a lot of business still comes from word of mouth, and the first thing a referred customer does is look you up. A clean, current website with your hours, services and a way to reach you turns that search into a call.',
      'We work with Waller County businesses on practical sites: a few clear pages, a Google Business Profile that matches them, and online payments or booking when you need them. We can meet in person along the US 290 corridor.',
    ],
    focus: ['Contractors and trades serving Waller County', 'Farm, ranch and equipment businesses', 'Shops and services near Prairie View and Hempstead'],
    nearby: ['Hempstead', 'Prairie View', 'Katy', 'Houston'],
  },
  {
    slug: 'katy', city: 'Katy', state: 'TX', county: 'Harris, Fort Bend and Waller counties', region: 'Greater Houston', lat: 29.7858, lng: -95.8245,
    title: 'Katy, TX Web Design, Apps & Local SEO',
    description: 'Websites, booking and local search for Katy businesses along I-10 and the Grand Parkway. Mobile-first design, Square payments and monthly care.',
    h2: 'For a fast-growing, family-focused market',
    intro: [
      'Katy has grown quickly along I-10 and the Grand Parkway, and new neighborhoods mean new customers searching for a dentist, a tutor, a lawn service or a place to eat. Being easy to find, and easy to book, matters more here than having the flashiest site.',
      'We build Katy websites around the questions families ask before they choose: do you serve my area, what does it cost, when can you come, and how do I book. Then we keep the site current so it does not fall behind newer competitors.',
    ],
    focus: ['Family services, tutoring and childcare', 'Home services across new subdivisions', 'Restaurants and fitness studios that take bookings'],
    nearby: ['Houston', 'Sugar Land', 'Waller'],
  },
  {
    slug: 'pearland', city: 'Pearland', state: 'TX', county: 'Brazoria County', region: 'Greater Houston', lat: 29.5636, lng: -95.286,
    title: 'Pearland, TX Website Design & Maintenance',
    description: 'Custom websites, online payments and Google Business Profile help for Pearland businesses near SH 288. Free consultation, no long-term contract.',
    h2: 'A neighborhood business, found by neighbors',
    intro: [
      'Pearland sits just south of Houston along SH 288, and many of its customers live within a few miles of the businesses they choose. A site that shows your service area, reviews and hours clearly, and that matches your Google listing, helps you win those nearby searches.',
      'We build fast, mobile-first sites for Pearland businesses, connect Square for payments or deposits when you need them, and offer monthly care that covers hosting, security, backups and small edits.',
    ],
    focus: ['Medical, dental and wellness offices', 'Home and auto services', 'Local shops that want online orders'],
    nearby: ['Houston', 'Sugar Land'],
  },
  {
    slug: 'sugar-land', city: 'Sugar Land', state: 'TX', county: 'Fort Bend County', region: 'Greater Houston', lat: 29.6197, lng: -95.6349,
    title: 'Sugar Land, TX Websites, Apps & Business Tools',
    description: 'Professional websites, client portals and booking for Sugar Land and Fort Bend County businesses. Built mobile-first, with monthly care plans.',
    h2: 'Polished sites for a professional crowd',
    intro: [
      'Sugar Land customers expect a business to look established online. A clear, well-written site with real service details, easy scheduling and secure forms builds that trust before the first meeting.',
      'For Fort Bend County practices and firms, we build sites with intake forms, client portals and appointment requests, and we set up page titles, descriptions and structured data so search engines understand what you offer.',
    ],
    focus: ['Professional practices and consultants', 'Clinics that need online intake', 'Growing companies that want a client portal'],
    nearby: ['Houston', 'Katy', 'Pearland'],
  },
  {
    slug: 'winnie', city: 'Winnie', state: 'TX', county: 'Chambers County', region: 'Southeast Texas', lat: 29.8202, lng: -94.3838,
    title: 'Winnie, TX Websites for Local Businesses',
    description: 'Affordable websites and Google listings for Winnie and Chambers County businesses on I-10 between Houston and Beaumont. In-person consultations.',
    h2: 'Between Houston and Beaumont, and easy to find',
    intro: [
      'Winnie sits on I-10 between Houston and Beaumont, so many of its customers are passing through or coming from nearby communities in Chambers County. A simple site with directions, hours and a tap-to-call button does a lot of work for a business here.',
      'We keep Winnie projects practical: a few strong pages, a Google Business Profile that is complete and accurate, and a site that is easy for you to keep current. We can meet you in person.',
    ],
    focus: ['Restaurants and stops along I-10', 'Agriculture and rice-country businesses', 'Trades serving Chambers County'],
    nearby: ['Beaumont', 'Houston'],
  },
  {
    slug: 'beaumont', city: 'Beaumont', state: 'TX', county: 'Jefferson County', region: 'Southeast Texas', lat: 30.0802, lng: -94.1266,
    title: 'Beaumont, TX Web Design, Apps & Maintenance',
    description: 'Websites, apps and business tools for Beaumont and Golden Triangle businesses. Mobile-first design, Square POS, local SEO and in-person consultations.',
    h2: 'Serving the Golden Triangle in person',
    intro: [
      'Beaumont anchors the Golden Triangle with Port Arthur and Orange, and its businesses serve everyone from plant workers on shift schedules to families across Jefferson County. Clear hours, quick quotes and a site that works on a phone matter here.',
      'We build Beaumont websites and tools around how local customers actually decide, and we can sit down with you in person to plan the project. After launch, monthly care keeps the site secure, backed up and up to date.',
    ],
    focus: ['Industrial and contractor services', 'Restaurants and retail in Jefferson County', 'Businesses that want Square POS and online booking'],
    nearby: ['Port Arthur', 'Orange', 'Nederland', 'Winnie'],
  },
  {
    slug: 'lake-charles', city: 'Lake Charles', state: 'LA', county: 'Calcasieu Parish', region: 'Southwest Louisiana', lat: 30.2266, lng: -93.2174,
    title: 'Lake Charles, LA Website Design & Apps',
    description: 'Website design, apps and maintenance for Lake Charles and Calcasieu Parish businesses. Mobile-friendly sites, clear service pages and in-person help.',
    h2: 'Helping Southwest Louisiana businesses get found',
    intro: [
      'A Lake Charles website needs to help people decide before they call: what you do, whether you serve their part of Calcasieu Parish, and how quickly they can get help. Clear service pages and an easy way to reach you do more than decoration.',
      'We design sites around those practical needs, from straightforward service sites to client portals and payment tools, and we confirm the scope with you before deciding which tools belong in the project.',
    ],
    focus: ['Local service companies across Calcasieu Parish', 'Hospitality and entertainment businesses', 'Professional practices that take appointments'],
    nearby: ['Sulphur', 'Westlake', 'Moss Bluff'],
  },
  {
    slug: 'lafayette', city: 'Lafayette', state: 'LA', county: 'Lafayette Parish', region: 'Southwest Louisiana', lat: 30.2241, lng: -92.0198,
    title: 'Lafayette, LA Web Design, Apps & AI Tools',
    description: 'Custom websites, apps and AI search tools for Lafayette and Acadiana businesses. Mobile-first sites, online payments and monthly care plans.',
    h2: 'For Acadiana businesses with a story to tell',
    intro: [
      'Lafayette is the hub of Acadiana, where many businesses are family-owned and proud of where they come from. A good site tells that story quickly, then gets out of the way so customers can order, book or call.',
      'We build Lafayette websites and small apps that load fast on a phone, show your menu, services or listings clearly, and connect to payments and booking when you need them. Monthly care keeps everything current.',
    ],
    focus: ['Restaurants, caterers and food businesses', 'Family-owned shops and services', 'Companies along the I-10 and I-49 corridors'],
    nearby: ['Lake Charles', 'Broussard', 'Youngsville'],
  },
];

export const areaBySlug = (slug: string) => AREAS.find(a => a.slug === slug) ?? null;
