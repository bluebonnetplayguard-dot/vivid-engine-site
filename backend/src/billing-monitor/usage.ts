import { DbLike, PriceCache } from './prices';

// One row per AI call. Metadata only: no question, no answer, no document text. `queryHash` is a one-way hash
// of the normalised question so identical questions can be counted without being kept.
export interface UsageEntry {
  ts?: Date;
  provider: string;
  model?: string;
  userId?: string | null;
  orgId?: string | null;
  command?: string | null;
  workflow?: string | null;
  feature?: string | null;
  requestId?: string | null;
  attempt?: number;
  usage?: { input?: number | null; output?: number | null; cacheRead?: number | null; cacheWrite?: number | null; thinking?: number | null; searches?: number | null };
  reportedUsd?: number | null;     // the provider told us what the call cost
  failed?: boolean;                // the call failed before anything was billed
  latencyMs?: number | null;
  httpStatus?: number | null;
  errorCode?: string | null;
  queryHash?: string | null;
}

const COLS = ['ts', 'provider', 'model', 'user_id', 'org_id', 'command', 'workflow', 'feature', 'request_id', 'attempt', 'input_tokens', 'output_tokens',
  'cache_read_tokens', 'cache_write_tokens', 'other_units', 'cost_usd', 'cost_status', 'cost_source', 'latency_ms', 'http_status', 'error_code', 'query_hash'];

export class UsageLog {
  private queue: UsageEntry[] = [];
  private flushing: Promise<number> | null = null;

  constructor(private readonly db: DbLike, private readonly prices: PriceCache, private readonly o: { maxQueue?: number; onError?: (msg: string) => void } = {}) {}

  get pending() { return this.queue.length; }

  // Called from the answer path. Never waits for the database and never throws.
  record(e: UsageEntry): void {
    try {
      this.queue.push({ ...e, ts: e.ts ?? new Date() });
      const max = this.o.maxQueue ?? 5000;
      if (this.queue.length > max) { this.queue.splice(0, this.queue.length - max); this.o.onError?.(`Usage queue over ${max}; oldest entries dropped.`); }
    } catch { /* logging must never break an answer */ }
  }

  flush(): Promise<number> {
    this.flushing ??= this.flushOnce().finally(() => { this.flushing = null; });
    return this.flushing;
  }

  private async flushOnce(): Promise<number> {
    let written = 0;
    while (this.queue.length) {
      const batch = this.queue.splice(0, 200);
      try {
        await this.prices.load();
        const params: unknown[] = []; const tuples: string[] = [];
        for (const e of batch) {
          const u = e.usage ?? {}; const at = e.ts ?? new Date();
          const c = this.prices.cost(e.provider, e.model ?? '', { input: u.input, output: u.output, cacheRead: u.cacheRead, cacheWrite: u.cacheWrite, thinking: u.thinking, searches: u.searches, calls: 1 }, at,
            { reportedUsd: e.reportedUsd, failed: e.failed });
          const other: Record<string, number> = {};
          if (u.searches) other.searches = u.searches; if (u.thinking) other.thinking_tokens = u.thinking;
          if (c.missing.length) (other as any).unpriced = c.missing;
          const row = [at, e.provider, e.model ?? '', e.userId ?? null, e.orgId ?? null, e.command ?? null, e.workflow ?? null, e.feature ?? null, e.requestId ?? null, e.attempt ?? 1,
            u.input ?? null, u.output ?? null, u.cacheRead ?? null, u.cacheWrite ?? null, JSON.stringify(other), c.costUsd, c.status, c.source, e.latencyMs ?? null, e.httpStatus ?? null, e.errorCode ?? null, e.queryHash ?? null];
          tuples.push(`(${row.map((_, i) => `$${params.length + i + 1}`).join(',')})`);
          params.push(...row);
        }
        await this.db.query(`INSERT INTO ai_usage_logs(${COLS.join(',')}) VALUES ${tuples.join(',')}`, params);
        written += batch.length;
      } catch (err) {
        this.queue.unshift(...batch);          // keep them for the next try
        this.o.onError?.(`Usage log write failed: ${(err as Error).message}`);
        break;
      }
    }
    return written;
  }

  // Calls that had no price when they happened get one as soon as the price exists.
  async repricePending(limit = 500): Promise<number> {
    await this.prices.load(true);
    const rows = await this.db.query(`SELECT id, ts, provider, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, other_units
                                        FROM ai_usage_logs WHERE cost_status = 'pending' ORDER BY id LIMIT $1`, [limit]);
    let fixed = 0;
    for (const r of rows) {
      const other = r.other_units ?? {};
      const c = this.prices.cost(r.provider, r.model, { input: r.input_tokens, output: r.output_tokens, cacheRead: r.cache_read_tokens, cacheWrite: r.cache_write_tokens, thinking: other.thinking_tokens, searches: other.searches, calls: 1 }, new Date(r.ts));
      if (c.status === 'final') {
        await this.db.query(`UPDATE ai_usage_logs SET cost_usd = $2, cost_status = 'final', cost_source = $3 WHERE id = $1`, [r.id, c.costUsd, c.source]);
        fixed++;
      }
    }
    return fixed;
  }
}
