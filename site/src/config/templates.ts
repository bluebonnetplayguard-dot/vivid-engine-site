// Starter templates for the ask box. Vivid Engine Templates are ours; Community Templates are shared by users
// once sharing opens (empty until then: nothing here is invented).
export type Mode = 'search' | 'build' | 'create' | 'business';
export interface PromptTemplate { id: string; title: string; prompt: string; mode: Mode; category: string }

export const VIVID_TEMPLATES: PromptTemplate[] = [
  { id: 'compare-products', title: 'Compare two products', prompt: 'Compare [product A] and [product B] for [how I will use it]. Show a table and say which fits better.', mode: 'search', category: 'Research' },
  { id: 'explain-bill', title: 'Explain a bill or letter', prompt: 'Explain this in plain words and tell me what I need to do next: [paste the text]', mode: 'search', category: 'Everyday' },
  { id: 'local-plan', title: 'Plan a weekend nearby', prompt: 'Plan a family weekend near [city] for [budget]. Include places to eat and what to book ahead.', mode: 'search', category: 'Local' },
  { id: 'homework', title: 'Help with homework', prompt: 'Explain [topic] step by step for a [grade] student, then give me three practice questions.', mode: 'search', category: 'School' },
  { id: 'site-plan', title: 'Plan a website', prompt: 'Plan the pages and sections for a website for my [type of business] in [city].', mode: 'build', category: 'Build' },
  { id: 'app-plan', title: 'Plan an app', prompt: 'Plan a simple app for [who] to [do what]. List the screens and the data it needs.', mode: 'build', category: 'Build' },
  { id: 'promo-script', title: 'Write a promo video script', prompt: 'Write a 30-second promo video script for my [business] with a clear call to action.', mode: 'create', category: 'Create' },
  { id: 'social-posts', title: 'Write social posts', prompt: 'Write five social media posts for my [business] for this month, with captions and hashtags.', mode: 'create', category: 'Create' },
  { id: 'price-list', title: 'Write a price list', prompt: 'Help me write a clear price list for my [services]. Ask me questions first if you need to.', mode: 'business', category: 'Business' },
  { id: 'google-profile', title: 'Improve my Google listing', prompt: 'What should my Google Business Profile include for a [type of business] in [city]? Give me a checklist.', mode: 'business', category: 'Business' },
  { id: 'review-reply', title: 'Reply to a review', prompt: 'Write a kind, professional reply to this customer review: [paste the review]', mode: 'business', category: 'Business' },
  { id: 'one-page-plan', title: 'One-page business plan', prompt: 'Help me write a one-page business plan for [idea] in [city]: customers, pricing, costs and first steps.', mode: 'business', category: 'Business' },
];

export const COMMUNITY_TEMPLATES: PromptTemplate[] = [];
