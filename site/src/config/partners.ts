// Local partner listings shown in Local Businesses and as sponsored cards after an answer.
// EMPTY until real partners sign the Partner Advertising Agreement: nothing here is ever invented.
// Sponsored cards are matched on the question's words only; they never change the answer itself.

export interface PartnerListing {
  id: string; name: string; tagline: string; city: string; category: string; url: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum'; keywords: string[]; sponsored: boolean;
}

export const PARTNER_LISTINGS: PartnerListing[] = [];

// Examples shown on the Local Businesses page, clearly labeled as examples of what a listing looks like.
export const EXAMPLE_LISTINGS = [
  { id: 'example-plumber', name: 'Your Plumbing Company', tagline: 'Licensed plumbing repairs and water heaters', city: 'Katy, TX', category: 'Plumbers' },
  { id: 'example-cafe', name: 'Your Café', tagline: 'Breakfast tacos, coffee and catering', city: 'Beaumont, TX', category: 'Restaurants' },
  { id: 'example-salon', name: 'Your Salon', tagline: 'Cuts, color and walk-ins welcome', city: 'Lake Charles, LA', category: 'Beauty' },
];
export const PARTNER_DISCLOSURE = 'Vivid Engine Partners pay to be listed. Listings are labeled, and paying never changes an AI answer.';

export const LOCAL_CATEGORIES = [
  { slug: 'restaurants', name: 'Restaurants' }, { slug: 'plumbers', name: 'Plumbers' }, { slug: 'electricians', name: 'Electricians' },
  { slug: 'hvac', name: 'Heating & air' }, { slug: 'auto-repair', name: 'Auto repair' }, { slug: 'beauty', name: 'Beauty & salons' },
  { slug: 'dentists', name: 'Dentists' }, { slug: 'lawyers', name: 'Lawyers' }, { slug: 'real-estate', name: 'Real estate' },
  { slug: 'home-services', name: 'Home services' }, { slug: 'fitness', name: 'Fitness' }, { slug: 'retail', name: 'Shops & retail' },
];
export const categoryBySlug = (slug: string) => LOCAL_CATEGORIES.find(c => c.slug === slug) ?? null;

export function matchSponsored(question: string): PartnerListing[] {
  const q = question.toLowerCase();
  return PARTNER_LISTINGS.filter(p => p.sponsored && p.keywords.some(k => q.includes(k.toLowerCase())));
}

export function listingsFor(citySlug: string, category: string): PartnerListing[] {
  return PARTNER_LISTINGS.filter(p => p.category === category && p.city.toLowerCase().replace(/[^a-z0-9]+/g, '-').startsWith(citySlug));
}
