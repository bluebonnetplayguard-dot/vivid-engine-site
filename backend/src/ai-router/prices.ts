import { EngineId, ProviderResult, Usage } from './types';

// What each engine charges us, in US dollars per million tokens (and per search or per call where that is how it is billed).
// This is the default price book. The Billing Monitor replaces it with the model_prices table so prices are edited in the
// admin screen, not in code. A model with no price gives cost_status 'pending', never a silent zero.
export interface Price { input?: number; output?: number; cacheRead?: number; perSearch?: number; perCall?: number }
export type PriceBook = (provider: EngineId, model: string) => Price | null;

// Anthropic list prices as set out in ai-search/plans.ts (October 2026); web search is $10 per 1,000.
// Gemini and Perplexity are billed per call here until real prices are confirmed in the admin screen.
const CLAUDE: Record<string, Price> = {
  'claude-haiku-5-5': { input: 0.10, output: 0.50, cacheRead: 0.01, perSearch: 0.01 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.20, perSearch: 0.01 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.20, perSearch: 0.01 },
};
export const defaultPriceBook: PriceBook = (provider, model) => {
  if (provider === 'claude') return CLAUDE[model.replace(/^anthropic\//, '')] ?? null;
  if (provider === 'gemini') return { perCall: 0.04 };       // Gemini with Google Search grounding, rough per-call figure
  if (provider === 'perplexity') return { perCall: 0.01 };   // used only when Perplexity does not report its own cost
  return null;
};

export type CostStatus = ProviderResult['costStatus'];
// reported = the cost the provider itself returned. Otherwise computed from tokens and the price book.
export function costOf(price: Price | null, usage: Usage, reported?: number | null): { cost: number; status: CostStatus } {
  if (reported != null && Number.isFinite(reported)) return { cost: reported, status: 'known' };
  if (!price) return { cost: 0, status: 'pending' };
  const tokens = usage.inputTokens + usage.outputTokens + usage.cacheReadTokens;
  if (price.input != null && price.output != null && tokens > 0) {
    const usd = (usage.inputTokens * price.input + usage.outputTokens * price.output + usage.cacheReadTokens * (price.cacheRead ?? price.input)) / 1_000_000 + usage.searches * (price.perSearch ?? 0);
    return { cost: usd, status: 'known' };
  }
  if (price.perCall != null) return { cost: price.perCall, status: 'estimated' };
  return { cost: 0, status: 'pending' };
}
