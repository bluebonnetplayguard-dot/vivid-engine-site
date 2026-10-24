// The AI router: one entry point that sends a question to Perplexity, Claude or Gemini (or all three)
// and always hands back the same shape. Nothing in this folder knows about HTTP, Nest or the database
// except ledger.ts, so the rules can be tested with fake engines.

export type EngineId = 'perplexity' | 'claude' | 'gemini';
export type EngineChoice = 'auto' | EngineId | 'combined';
export type Mode = 'search' | 'build' | 'create' | 'business';
export type Depth = 'quick' | 'pro' | 'deep';
export type Focus = 'web' | 'local' | 'news' | 'shopping' | 'images' | 'videos' | 'academic' | 'business';

export const ENGINES: EngineId[] = ['perplexity', 'claude', 'gemini'];
export const ENGINE_LABELS: Record<EngineId, string> = { perplexity: 'Perplexity', claude: 'Claude', gemini: 'Gemini' };

export interface Turn { role: 'user' | 'assistant'; content: string }
export interface Attachment { mime: string; data: string /* base64 */; name?: string }
export interface Citation { n: number; url: string; title: string; cited: boolean }
export interface Usage { inputTokens: number; outputTokens: number; cacheReadTokens: number; searches: number }

export interface RouterRequest {
  question: string;
  history: Turn[];
  mode: Mode;
  engine: EngineChoice;
  depth: Depth;
  focus?: Focus;
  attachments?: Attachment[];
  planId: string;                 // decides which engines, depths and models are allowed
  extraContext?: string;          // already-sanitised notes (for example remembered conversations); passed as data
  signal?: AbortSignal;
  trace?: Trace;                  // who and what this call is for, for the usage log (never the question itself)
}

// Metadata for the Billing Monitor's usage log. Carried along with a request; never contains question text.
export interface Trace { userId?: string | null; orgId?: string | null; workflow?: string; feature?: string; requestId?: string; queryHash?: string }

// Fired once per call to an engine, successful or not, including automatic retries and the merge step of Combined.
export interface CallEvent {
  engine: EngineId; ok: boolean; role: 'answer' | 'merge'; attempt: number; latencyMs: number;
  result?: ProviderResult; status?: number | null; error?: string; billing?: boolean; req: RouterRequest;
}

// What every engine returns.
export interface ProviderResult {
  answer: string;
  citations: Citation[];          // numbered 1..n in the order the answer cites them
  searchQueries: string[];
  usage: Usage;
  cost: number;                   // USD to us, 0 when unknown (see costStatus)
  costStatus: 'known' | 'estimated' | 'pending';
  provider: EngineId;
  model: string;
  groundedWithGoogle?: boolean;   // answer used Google Search grounding: no sponsored block may sit beside it
  reportedCostUsd?: number | null;   // the provider itself said what the call cost (Perplexity Agent API does)
}

export interface Attempt { engine: EngineId; ok: boolean; error?: string; retried?: boolean; billing?: boolean }

// What the router returns: the shape the spec asks for, plus how it got there.
export interface RouterResult extends ProviderResult {
  engine: EngineChoice;           // what was asked for
  routedTo: EngineId[];           // engines that actually contributed
  why: string;                    // plain-language "Why this engine?"
  fallbackFrom: EngineId | null;
  attempts: Attempt[];
  perEngine?: { provider: EngineId; model: string; cost: number; ok: boolean }[];   // combined mode
}

export interface AdapterRequest extends RouterRequest {
  model: string;
  maxOutputTokens: number;
  searches: number;               // how many web searches / results this answer may use
  effort: 'low' | 'medium' | 'high';
  system: string;
}

export interface Hooks {
  onDelta?: (text: string) => void;
  onStatus?: (stage: string, detail?: Record<string, unknown>) => void;
  onSources?: (sources: Citation[]) => void;
}

export interface ProviderAdapter {
  readonly id: EngineId;
  configured(): boolean;
  run(req: AdapterRequest, hooks?: Hooks): Promise<ProviderResult>;
}

export class RouterError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message); this.name = 'RouterError'; }
}

// Adapters throw this so the router can tell "try again", "this provider is out of money or keys", and "give up".
export class ProviderError extends Error {
  constructor(message: string, readonly provider: EngineId, readonly status: number | null = null, readonly started = false) { super(message); this.name = 'ProviderError'; }
  get billing() { return this.status === 401 || this.status === 402 || this.status === 403 || /credit|billing|quota|insufficient|balance|payment/i.test(this.message); }
  get retryable() { return !this.billing && (this.status == null || this.status === 408 || this.status === 409 || this.status === 429 || this.status >= 500); }
}
