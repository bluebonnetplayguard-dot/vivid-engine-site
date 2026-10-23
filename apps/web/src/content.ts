export type Service = {
  slug: string;
  name: string;
  title: string;
  description: string;
  intro: string;
  points: { heading: string; body: string }[];
};

export type Area = {
  slug: string;
  city: string;
  state: string;
  title: string;
  description: string;
  intro: string;
  nearby: string[];
};

export const services: Service[] = [
  {
    slug: 'web-design',
    name: 'Web Design',
    title: 'Web Design for Local Businesses',
    description:
      'Custom, mobile-first websites that load fast, rank well and turn visitors into calls. Built for businesses in Beaumont, TX and Lake Charles, LA.',
    intro:
      'Your website is usually the first thing a customer sees. We design and build sites that load in a blink, read clearly on a phone, and make it easy to call, book or get a quote.',
    points: [
      { heading: 'Built for speed', body: 'Pages are prerendered and lean, so they load quickly on mobile data and score well on Core Web Vitals.' },
      { heading: 'Mobile first', body: 'Most local searches happen on a phone. Every layout starts at phone size and scales up.' },
      { heading: 'Made to convert', body: 'Clear calls to action, click-to-call buttons and simple contact forms on every page.' },
      { heading: 'Search ready', body: 'Clean URLs, page titles, schema markup and a sitemap are part of every build, not an add-on.' },
    ],
  },
  {
    slug: 'local-seo',
    name: 'Local SEO',
    title: 'Local SEO Services',
    description:
      'Get found in Google Maps and local search. Google Business Profile optimization, local citations, on-page SEO and review strategy for Southeast Texas and Southwest Louisiana.',
    intro:
      'When someone nearby searches for what you do, you want to be in the map pack and the top results. Local SEO is how you get there and stay there.',
    points: [
      { heading: 'Google Business Profile', body: 'Categories, services, photos, posts and Q&A set up and kept current so your profile works for you.' },
      { heading: 'Citations and NAP', body: 'Your name, address and phone made consistent across the directories Google trusts.' },
      { heading: 'On-page local SEO', body: 'Service and city pages, title tags and LocalBusiness schema that tell search engines where you work.' },
      { heading: 'Reviews and reporting', body: 'A simple process for earning reviews, plus plain-language monthly reports on calls, clicks and rankings.' },
    ],
  },
];

export const areas: Area[] = [
  {
    slug: 'beaumont-tx',
    city: 'Beaumont',
    state: 'TX',
    title: 'Web Design and Local SEO in Beaumont, TX',
    description:
      'Websites and local SEO for Beaumont businesses. Fast, mobile-friendly sites and Google Maps visibility across the Golden Triangle.',
    intro:
      'We work with Beaumont businesses that want a site they are proud of and more calls from local search, from Downtown and the West End to Port Arthur and Orange.',
    nearby: ['Port Arthur', 'Nederland', 'Port Neches', 'Orange', 'Lumberton', 'Vidor'],
  },
  {
    slug: 'lake-charles-la',
    city: 'Lake Charles',
    state: 'LA',
    title: 'Web Design and Local SEO in Lake Charles, LA',
    description:
      'Websites and local SEO for Lake Charles businesses. Fast, mobile-friendly sites and Google Maps visibility across the Lake Area.',
    intro:
      'We help Lake Charles businesses show up when nearby customers search, with fast websites and local SEO built for the Lake Area market.',
    nearby: ['Sulphur', 'Moss Bluff', 'Westlake', 'DeRidder', 'Jennings', 'Iowa'],
  },
];
