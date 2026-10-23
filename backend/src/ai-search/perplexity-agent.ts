import { config } from '../config';

// Perplexity Agent API (POST https://api.perplexity.ai/v1/agent): web-grounded answers from
// Anthropic, OpenAI, Google and Perplexity models through one PERPLEXITY_API_KEY.
// Request and response shapes follow https://docs.perplexity.ai/api-reference/agent-post:
//   request:  model, input (string | message items), instructions, max_output_tokens (required for anthropic/*),
//             tools [{ type: 'web_search', max_results }], reasoning { effort }, stream
//   response: output[] items; type 'message' -> content[] { type: 'output_text', text, annotations[] { type: 'url_citation', url, title } };
//             type 'search_results' -> results[] { url, title, snippet }; usage { input_tokens, output_tokens, cost { total_cost } }
//   stream:   SSE events 'response.output_text.delta' { delta } ... 'response.completed' { response } | 'response.failed'
// output_text is an SDK convenience only; the raw JSON has no such field. The key is read from the
// environment and never logged.

const ENDPOINT = 'https://api.perplexity.ai/v1/agent';

export const agentConfigured = () => !!config.PERPLEXITY_API_KEY;

export interface AgentSource { url: string; title: string; cited: boolean }
export interface AgentResult { text: string; sources: AgentSource[]; searchQueries: string[]; inputTokens: number; outputTokens: number; costUsd: number | null }

export interface AgentRequest {
  model: string;
  input: string | { type: 'message'; role: 'user' | 'assistant'; content: string }[];
  instructions?: string;
  maxOutputTokens: number;
  maxResults?: number;              // web_search results, 1-50
  effort?: 'minimal' | 'low' | 'medium' | 'high';
  signal?: AbortSignal;
}

export class AgentApiError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfter?: number) { super(message); this.name = 'AgentApiError'; }
}

function body(req: AgentRequest, stream: boolean) {
  return JSON.stringify({
    model: req.model,
    input: req.input,
    ...(req.instructions ? { instructions: req.instructions } : {}),
    max_output_tokens: req.maxOutputTokens,
    tools: [{ type: 'web_search', max_results: Math.min(Math.max(req.maxResults ?? 8, 1), 50) }],
    ...(req.effort ? { reasoning: { effort: req.effort } } : {}),
    ...(stream ? { stream: true } : {}),
  });
}

async function post(req: AgentRequest, stream: boolean): Promise<Response> {
  if (!config.PERPLEXITY_API_KEY) throw new AgentApiError('Perplexity is not configured.', 503);
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.PERPLEXITY_API_KEY}`, 'Content-Type': 'application/json', Accept: stream ? 'text/event-stream' : 'application/json' },
    body: body(req, stream),
    signal: req.signal,
  });
  if (!res.ok) {
    // Status first: some error bodies are empty or not JSON.
    let message = `Perplexity Agent API HTTP ${res.status}`;
    try { const data: any = await res.json(); if (data?.error?.message) message += `: ${String(data.error.message).slice(0, 200)}`; } catch { /* no JSON body */ }
    const retry = Number(res.headers.get('retry-after'));
    throw new AgentApiError(message, res.status, Number.isFinite(retry) && retry > 0 ? retry : undefined);
  }
  return res;
}

// Pulls answer text, citations and search results out of a completed response object.
export function parseResponse(response: any): AgentResult {
  if (response?.status === 'failed' || response?.error?.message) {
    throw new AgentApiError(`Perplexity Agent API failed: ${String(response?.error?.message ?? 'unknown error').slice(0, 200)}`, 502);
  }
  const sources: AgentSource[] = [];
  const add = (url: unknown, title: unknown, cited: boolean) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return;
    const found = sources.find(s => s.url === url);
    if (found) { found.cited ||= cited; return; }
    if (sources.length < 40) sources.push({ url: url.slice(0, 500), title: String(title || url).slice(0, 200), cited });
  };
  let text = '';
  const searchQueries: string[] = [];
  for (const item of Array.isArray(response?.output) ? response.output : []) {
    if (item?.type === 'message') {
      for (const part of Array.isArray(item.content) ? item.content : []) {
        if (part?.type !== 'output_text') continue;
        text += String(part.text ?? '');
        for (const a of Array.isArray(part.annotations) ? part.annotations : []) if (a?.type === 'url_citation') add(a.url, a.title, true);
      }
    } else if (item?.type === 'search_results') {
      for (const q of [item?.query, ...(Array.isArray(item?.queries) ? item.queries : [])]) if (typeof q === 'string' && q.trim() && !searchQueries.includes(q.trim())) searchQueries.push(q.trim().slice(0, 200));
      for (const r of Array.isArray(item.results) ? item.results : []) add(r?.url, r?.title, false);
    }
  }
  const usage = response?.usage ?? {};
  const cost = Number(usage?.cost?.total_cost);
  return {
    text, sources: [...sources.filter(s => s.cited), ...sources.filter(s => !s.cited)], searchQueries: searchQueries.slice(0, 12),
    inputTokens: Number(usage.input_tokens) || 0, outputTokens: Number(usage.output_tokens) || 0,
    costUsd: Number.isFinite(cost) ? cost : null,
  };
}

// One complete answer (used for second opinions).
export async function agentAnswer(req: AgentRequest): Promise<AgentResult> {
  const res = await post(req, false);
  return parseResponse(await res.json());
}

// Streams the answer: onDelta gets each text piece; resolves with the final parsed result.
export async function agentStream(req: AgentRequest, onDelta: (text: string) => void): Promise<AgentResult> {
  const res = await post(req, true);
  if (!res.body) throw new AgentApiError('Perplexity Agent API returned no stream.', 502);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let streamed = '';
  let final: AgentResult | null = null;
  const handle = (raw: string) => {
    const data = raw.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n');
    if (!data || data === '[DONE]') return;
    let event: any;
    try { event = JSON.parse(data); } catch { return; }
    if (event?.type === 'response.output_text.delta' && typeof event.delta === 'string') { streamed += event.delta; onDelta(event.delta); }
    else if (event?.type === 'response.completed') final = parseResponse(event.response);
    else if (event?.type === 'response.failed') parseResponse({ ...event.response, status: 'failed' }); // throws
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value.replace(/\r\n/g, '\n');
    let split;
    while ((split = buffer.indexOf('\n\n')) !== -1) { handle(buffer.slice(0, split)); buffer = buffer.slice(split + 2); }
  }
  if (buffer.trim()) handle(buffer);
  const result: AgentResult = final ?? { text: streamed, sources: [], searchQueries: [], inputTokens: 0, outputTokens: 0, costUsd: null };
  // Deltas are what the visitor saw; keep them as the saved text if the final event differs.
  return { ...result, text: streamed || result.text };
}
