import { Logger } from '@nestjs/common';
import { config } from '../config';
import { ContributorId } from './plans';
import { agentAnswer, agentConfigured } from './perplexity-agent';

// Other answer engines consulted for a second opinion. Each runs in parallel with a time
// limit; one that is slow, unconfigured or failing is simply left out of that answer.
// Their text is untrusted input: Claude is told to verify it, never to follow it.

export interface ContributorSource { url: string; title: string }
export interface ContributorAnswer { id: ContributorId; label: string; ok: boolean; text: string; sources: ContributorSource[]; error?: string; costUsd?: number | null }

export const CONTRIBUTOR_LABELS: Record<ContributorId, string> = { perplexity: 'Perplexity', gemini: 'Gemini', openai: 'ChatGPT' };

const TIMEOUT_MS = 25_000;
const MAX_TEXT = 6000;
const log = new Logger('Contributors');

// Gemini and ChatGPT use their own API keys when set; otherwise they run through the
// Perplexity Agent API (one PERPLEXITY_API_KEY), which hosts Google and OpenAI models with web search.
const directKey = (id: ContributorId) => ({ perplexity: undefined, gemini: config.GEMINI_API_KEY, openai: config.OPENAI_API_KEY }[id]);
const viaAgent = (id: ContributorId) => !directKey(id) && agentConfigured();
export const contributorConfigured = (id: ContributorId) => !!directKey(id) || agentConfigured();

const PROMPT = (q: string) => `Answer this question accurately and concisely, using current web sources. Cite the URLs you used.\n\nQuestion: ${q}`;
const AGENT_MODEL: Record<ContributorId, () => string> = {
  perplexity: () => config.PERPLEXITY_SEARCH_MODEL, gemini: () => config.PPLX_GEMINI_MODEL, openai: () => config.PPLX_OPENAI_MODEL,
};

async function askViaAgent(id: ContributorId, question: string, signal: AbortSignal) {
  const out = await agentAnswer({ model: AGENT_MODEL[id](), input: PROMPT(question), maxOutputTokens: 2000, maxResults: 8, signal });
  return { text: out.text, sources: out.sources.map(s => ({ url: s.url, title: s.title })), costUsd: out.costUsd };
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, signal: AbortSignal): Promise<any> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}${data?.error?.message ? `: ${String(data.error.message).slice(0, 200)}` : ''}`), { status: res.status });
  return data;
}

const cleanSources = (list: ContributorSource[]) => {
  const seen = new Set<string>();
  return list.filter(s => /^https?:\/\//i.test(s.url) && !seen.has(s.url) && seen.add(s.url)).slice(0, 8)
    .map(s => ({ url: s.url.slice(0, 500), title: (s.title || s.url).slice(0, 200) }));
};

// GEMINI_SEARCH_MODEL may list several models, best first ("gemini-4-argon,gemini-3.8-flash").
// A model that is retired, over quota or not allowed for the key (403/404/429) or failing (5xx)
// passes the question to the next one; if every direct model fails, the Perplexity Agent API is tried.
const GEMINI_RETRY = (status: number) => status === 403 || status === 404 || status === 429 || status >= 500;

async function askGeminiModel(model: string, question: string, signal: AbortSignal) {
  const data = await postJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { 'x-goog-api-key': config.GEMINI_API_KEY! }, {
    contents: [{ role: 'user', parts: [{ text: PROMPT(question) }] }],
    tools: [{ google_search: {} }],
  }, signal);
  const cand = data?.candidates?.[0];
  const text = (cand?.content?.parts ?? []).filter((p: any) => !p?.thought).map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join('');
  const chunks: any[] = cand?.groundingMetadata?.groundingChunks ?? [];
  return { text, sources: chunks.filter(c => c?.web?.uri).map(c => ({ url: String(c.web.uri), title: String(c.web.title ?? '') })) };
}

async function askGemini(question: string, signal: AbortSignal) {
  const models = config.GEMINI_SEARCH_MODEL.split(',').map(m => m.trim()).filter(Boolean);
  let last: unknown;
  for (const model of models) {
    try {
      return await askGeminiModel(model, question, signal);
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (!status || !GEMINI_RETRY(status)) throw e;
      log.warn(`gemini ${model} unavailable (${status}), trying next`);
      last = e;
    }
  }
  if (agentConfigured()) return askViaAgent('gemini', question, signal);
  throw last ?? new Error('no Gemini model configured');
}

async function askOpenAI(question: string, signal: AbortSignal) {
  const data = await postJson('https://api.openai.com/v1/responses', { Authorization: `Bearer ${config.OPENAI_API_KEY}` }, {
    model: config.OPENAI_SEARCH_MODEL,
    input: PROMPT(question),
    tools: [{ type: 'web_search' }],
  }, signal);
  const parts: any[] = (data?.output ?? []).filter((o: any) => o?.type === 'message').flatMap((o: any) => o.content ?? []).filter((c: any) => c?.type === 'output_text');
  const text = typeof data?.output_text === 'string' && data.output_text ? data.output_text : parts.map(p => String(p.text ?? '')).join('\n');
  const sources = parts.flatMap(p => (p.annotations ?? []).filter((a: any) => a?.type === 'url_citation' && a.url).map((a: any) => ({ url: String(a.url), title: String(a.title ?? '') })));
  return { text, sources };
}

type Runner = (q: string, s: AbortSignal) => Promise<{ text: string; sources: ContributorSource[]; costUsd?: number | null }>;
const DIRECT: Partial<Record<ContributorId, Runner>> = { gemini: askGemini, openai: askOpenAI };
const runnerFor = (id: ContributorId): Runner => (viaAgent(id) || !DIRECT[id] ? (q, s) => askViaAgent(id, q, s) : DIRECT[id]!);

// Runs every requested, configured contributor at once. Never throws.
export async function consultContributors(ids: ContributorId[], question: string, onDone?: (a: ContributorAnswer) => void, parent?: AbortSignal): Promise<ContributorAnswer[]> {
  const active = ids.filter(contributorConfigured);
  return Promise.all(active.map(async (id): Promise<ContributorAnswer> => {
    const signal = parent ? AbortSignal.any([parent, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS);
    let answer: ContributorAnswer;
    try {
      const out = await runnerFor(id)(question, signal);
      const text = out.text.trim().slice(0, MAX_TEXT);
      answer = text ? { id, label: CONTRIBUTOR_LABELS[id], ok: true, text, sources: cleanSources(out.sources), costUsd: out.costUsd ?? null }
        : { id, label: CONTRIBUTOR_LABELS[id], ok: false, text: '', sources: [], error: 'empty answer' };
    } catch (e) {
      const msg = (e as Error).name === 'TimeoutError' || (e as Error).name === 'AbortError' ? 'timed out' : (e as Error).message.slice(0, 200);
      log.warn(`${id} failed: ${msg}`);
      answer = { id, label: CONTRIBUTOR_LABELS[id], ok: false, text: '', sources: [], error: msg };
    }
    onDone?.(answer);
    return answer;
  }));
}
