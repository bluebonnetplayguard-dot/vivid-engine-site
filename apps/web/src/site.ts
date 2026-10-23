// Business details used across the site, page metadata and structured data.
// Fill in the empty fields before launch; empty values are left out of the schema markup.
export const site = {
  name: 'Vivid Engine Solutions',
  shortName: 'Vivid Engine',
  url: (import.meta.env.VITE_SITE_URL as string | undefined) ?? 'https://www.vividenginesolutions.com',
  tagline: 'Fast websites and local SEO for Southeast Texas and Southwest Louisiana',
  description:
    'Vivid Engine Solutions builds fast, search-ready websites and runs local SEO for businesses in Beaumont, TX, Lake Charles, LA and the surrounding Golden Triangle and Lake Area.',
  email: '',
  phone: '',
  address: {
    street: '',
    city: 'Beaumont',
    region: 'TX',
    postalCode: '',
    country: 'US',
  },
  hours: 'Mo-Fr 09:00-17:00',
  social: [] as string[],
};
