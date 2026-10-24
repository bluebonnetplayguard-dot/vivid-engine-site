import { CostResult, PriceRow, TokenType, Units, computeCost, pickPrice } from './cost';

export interface DbLike {
  query(text: string, params?: unknown[]): Promise<any[]>;
  one(text: string, params?: unknown[]): Promise<any | null>;
}

// The model_prices table, kept in memory for a minute. The same rows price both the usage log and the router's
// own cost figures, so a price edited in the admin screen changes both.
export class PriceCache {
  private rows: PriceRow[] = [];
  private loadedAt = 0;
  private everLoaded = false;

  constructor(private readonly db: DbLike, private readonly ttlMs = 60_000, private readonly clock: () => number = Date.now) {}

  get ready() { return this.everLoaded; }
  list() { return this.rows; }
  invalidate() { this.loadedAt = 0; }

  async load(force = false): Promise<void> {
    if (!force && this.everLoaded && this.clock() - this.loadedAt < this.ttlMs) return;
    this.rows = (await this.db.query('SELECT provider, model, token_type, price_usd, unit, price_window, effective_from, effective_to FROM model_prices')) as PriceRow[];
    this.loadedAt = this.clock(); this.everLoaded = true;
  }

  // gemini-3.8-flash, perplexity:google/gemini-3.8-flash and anthropic/claude-sonnet-5-5 all price by their last part.
  static modelKey(model: string) { return (model.split(/[/:]/).pop() ?? model).trim(); }

  cost(provider: string, model: string, units: Units, at: Date, opts: { reportedUsd?: number | null; failed?: boolean } = {}): CostResult {
    return computeCost(this.rows, provider, PriceCache.modelKey(model), units, at, opts);
  }

  // For the router's adapters: a function giving the per-token and per-call prices of a model right now.
  // Until the table has loaded once, `fallback` answers; afterwards a model with no price gives null (cost pending).
  asPriceBook<P extends { input?: number; output?: number; cacheRead?: number; perSearch?: number; perCall?: number }>(fallback: (provider: any, model: string) => P | null) {
    return (provider: string, model: string): P | null => {
      if (!this.everLoaded) return fallback(provider, model);
      const now = new Date(this.clock()); const key = PriceCache.modelKey(model);
      const get = (t: TokenType) => { const r = pickPrice(this.rows, provider, key, t, now, 'any'); return r ? Number(r.price_usd) : undefined; };
      const p = { input: get('input'), output: get('output'), cacheRead: get('cache_read'), perSearch: get('search'), perCall: get('call') } as P;
      return Object.values(p).some(v => v != null) ? p : null;
    };
  }
}
