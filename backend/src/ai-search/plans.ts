// Vivid AI Search plans. This file is the single source of truth: the pricing page reads
// GET /api/ai-search/plans, checkout charges these amounts, and the limits below are enforced
// on every question. Website build and care pricing (shared/pricing.ts) is separate and unchanged.
//
// How the limits were sized (our cost per answered question, at Oct 2026 list prices):
//   Claude Haiku 5.5   $0.10 / $0.50 per million input / output tokens
//   Claude Sonnet 5.5  $2 / $10        Claude Opus 5.5  $4 / $20
//   Claude web search  $10 per 1,000 searches
//   Contributors (rough, per call): Perplexity ~$0.01, Gemini with Google Search ~$0.04, ChatGPT with web search ~$0.03
// Typical answer: ~4-8K input tokens per search plus ~1.5-3K output tokens.
// Each paid tier's monthly cap is set so a customer who uses every question still costs us
// roughly 70% or less of what they pay; typical use is far lower. The daily spend ceiling
// (AI_SEARCH_DAILY_BUDGET_USD) protects against anything unexpected.

export type ContributorId = 'perplexity' | 'gemini' | 'openai';
export type TierId = 'free' | 'starter' | 'plus' | 'pro' | 'max' | 'business';
export type Effort = 'low' | 'medium' | 'high';

export interface Tier {
  id: TierId;
  name: string;
  tagline: string;
  priceMonthly: number;          // USD; for Business this is per seat
  perSeat: boolean;
  minSeats: number;
  model: string;
  modelLabel: string;
  effort: Effort;
  searchesPerAnswer: number;     // Claude web searches allowed per answer
  contributors: ContributorId[]; // other engines consulted for a second opinion
  dailyLimit: number;            // questions per user per day
  monthlyLimit: number;          // questions per month (Business: per seat, pooled across the company)
  perMinute: number;             // burst limit per user
  priority: boolean;             // paid lanes never wait behind the shared free lane
  maxOutputTokens: number;
  historyTurns: number;          // earlier messages in the thread sent as context
  features: string[];
  badge?: string;
}

const HAIKU = 'claude-haiku-5-5';
const SONNET = 'claude-sonnet-5-5';
const OPUS = 'claude-opus-5-5';

export const TIERS: Tier[] = [
  {
    id: 'free', name: 'Free', tagline: 'Try AI search and website planning.', priceMonthly: 0, perSeat: false, minSeats: 1,
    model: HAIKU, modelLabel: 'Claude Haiku 5.5', effort: 'low', searchesPerAnswer: 2, contributors: [],
    dailyLimit: 5, monthlyLimit: 60, perMinute: 3, priority: false, maxOutputTokens: 8000, historyTurns: 4,
    features: ['5 questions a day', 'Live web search with sources', 'Website planning and copy help'],
  },
  {
    id: 'starter', name: 'Starter', tagline: 'More questions, plus a second opinion.', priceMonthly: 8, perSeat: false, minSeats: 1,
    model: HAIKU, modelLabel: 'Claude Haiku 5.5', effort: 'medium', searchesPerAnswer: 3, contributors: ['perplexity'],
    dailyLimit: 25, monthlyLimit: 150, perMinute: 6, priority: true, maxOutputTokens: 10000, historyTurns: 8,
    features: ['150 questions a month (25 a day)', 'Perplexity contributes to every answer', 'Priority lane: no waiting behind free users', 'Deeper searches (3 per answer)', 'Saved conversations with pins and Spaces'],
  },
  {
    id: 'plus', name: 'Plus', tagline: 'A stronger model for real research.', priceMonthly: 20, perSeat: false, minSeats: 1,
    model: SONNET, modelLabel: 'Claude Sonnet 5.5', effort: 'low', searchesPerAnswer: 4, contributors: ['perplexity', 'gemini'],
    dailyLimit: 30, monthlyLimit: 120, perMinute: 8, priority: true, maxOutputTokens: 16000, historyTurns: 10,
    features: ['120 questions a month (30 a day)', 'Claude Sonnet 5.5', 'Perplexity and Gemini contribute', 'Longer, more detailed answers', 'Saved conversations with pins and Spaces'],
    badge: 'Most popular',
  },
  {
    id: 'pro', name: 'Pro', tagline: 'Three engines checked against each other.', priceMonthly: 45, perSeat: false, minSeats: 1,
    model: SONNET, modelLabel: 'Claude Sonnet 5.5', effort: 'medium', searchesPerAnswer: 6, contributors: ['perplexity', 'gemini', 'openai'],
    dailyLimit: 40, monthlyLimit: 200, perMinute: 10, priority: true, maxOutputTokens: 24000, historyTurns: 14,
    features: ['200 questions a month (40 a day)', 'Perplexity, Gemini and ChatGPT contribute', 'Deeper research (6 searches per answer)', 'Full website plans, page copy and code snippets', 'Saved history you can search and export'],
  },
  {
    id: 'max', name: 'Max', tagline: 'Our most capable model for the hardest questions.', priceMonthly: 129, perSeat: false, minSeats: 1,
    model: OPUS, modelLabel: 'Claude Opus 5.5', effort: 'medium', searchesPerAnswer: 8, contributors: ['perplexity', 'gemini', 'openai'],
    dailyLimit: 60, monthlyLimit: 250, perMinute: 12, priority: true, maxOutputTokens: 32000, historyTurns: 20,
    features: ['250 questions a month (60 a day)', 'Claude Opus 5.5, our most capable model', 'All three engines contribute', 'Deepest research (8 searches per answer)', 'Saved history you can search and export'],
  },
  {
    id: 'business', name: 'Business', tagline: 'Pro-level research for your whole team.', priceMonthly: 35, perSeat: true, minSeats: 2,
    model: SONNET, modelLabel: 'Claude Sonnet 5.5', effort: 'medium', searchesPerAnswer: 6, contributors: ['perplexity', 'gemini', 'openai'],
    dailyLimit: 40, monthlyLimit: 150, perMinute: 10, priority: true, maxOutputTokens: 24000, historyTurns: 14,
    features: ['Billed per seat, 2 seats minimum', '150 questions per seat a month, shared by the team', 'Perplexity, Gemini and ChatGPT contribute', 'Add and remove teammates any time', 'One invoice for the company', 'Saved history you can search and export'],
  },
];

// Saved conversation history rules live in ../history/rules.ts and the pricing catalog (shared/pricing-catalog.ts).

export const tierById = (id: string | null | undefined): Tier => TIERS.find(t => t.id === id) ?? TIERS[0];
export const PAID_TIER_IDS = TIERS.filter(t => t.priceMonthly > 0).map(t => t.id);

// Per-million-token list prices used to estimate what each answer cost us.
export const MODEL_RATES: Record<string, { input: number; output: number; cacheRead: number }> = {
  [HAIKU]: { input: 0.10, output: 0.50, cacheRead: 0.01 },
  [SONNET]: { input: 2, output: 10, cacheRead: 0.20 },
  [OPUS]: { input: 4, output: 20, cacheRead: 0.20 },
};
export const WEB_SEARCH_COST = 0.01;
export const CONTRIBUTOR_COST: Record<ContributorId, number> = { perplexity: 0.01, gemini: 0.04, openai: 0.03 };

// What the public pricing page shows (no internal cost fields).
export function publicTiers() {
  return TIERS.map(({ id, name, tagline, priceMonthly, perSeat, minSeats, modelLabel, contributors, dailyLimit, monthlyLimit, priority, features, badge }) =>
    ({ id, name, tagline, priceMonthly, perSeat, minSeats, modelLabel, contributors, dailyLimit, monthlyLimit, priority, features, badge: badge ?? null }));
}
