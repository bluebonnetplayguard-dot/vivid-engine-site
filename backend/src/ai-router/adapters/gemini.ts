import { config } from '../../config';
import { PriceBook, costOf } from '../prices';
import { AdapterRequest, Hooks, ProviderAdapter, ProviderError, ProviderResult } from '../types';
import { SourceList, insertMarkers, userTurn } from './common';
import { agentAnswer, agentConfigured } from '../../ai-search/perplexity-agent';

// Gemini: images, video and other files, plus Google Search grounding for current facts.
// GEMINI_SEARCH_MODEL may list several models, best first. A model that is retired, over quota or not allowed for
// the key (403/404/429) or failing (5xx) passes the question to the next one; if every direct model fails and a
// Perplexity key exists, Gemini answers through the Perplexity Agent API instead.
const RETRY_NEXT = (status: number) => status === 403 || status === 404 || status === 429 || status >= 500;

export class GeminiAdapter implements ProviderAdapter {
  readonly id = 'gemini' as const;
  constructor(private readonly prices: PriceBook) {}
  configured() { return !!config.GEMINI_API_KEY || agentConfigured(); }

  private async callModel(model: string, req: AdapterRequest) {
    const parts: any[] = (req.attachments ?? []).map(a => ({ inlineData: { mimeType: a.mime, data: a.data } }));
    parts.push({ text: userTurn(req) });
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.GEMINI_API_KEY! }, signal: req.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: `${req.system}\n- Mark sourced claims with the grounding citations; do not write your own numbers.` }] },
        contents: [...req.history.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })), { role: 'user', parts }],
        tools: [{ google_search: {} }],
        generationConfig: { maxOutputTokens: req.maxOutputTokens },
      }),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new ProviderError(`Gemini HTTP ${res.status}${data?.error?.message ? `: ${String(data.error.message).slice(0, 200)}` : ''}`, 'gemini', res.status);
    return data;
  }

  async run(req: AdapterRequest, hooks?: Hooks): Promise<ProviderResult> {
    hooks?.onStatus?.('searching');
    const models = config.GEMINI_SEARCH_MODEL.split(',').map(m => m.trim()).filter(Boolean);
    let last: unknown;
    if (config.GEMINI_API_KEY) for (const model of models) {
      try {
        const data = await this.callModel(model, req);
        const cand = data?.candidates?.[0];
        let text: string = (cand?.content?.parts ?? []).filter((p: any) => !p?.thought).map((p: any) => (typeof p?.text === 'string' ? p.text : '')).join('');
        if (!text.trim()) throw new ProviderError('Gemini returned an empty answer.', 'gemini', 502);
        const meta = cand?.groundingMetadata ?? {};
        const chunks: any[] = meta.groundingChunks ?? [];
        const sources = new SourceList();
        const numberFor = new Map<number, number>();
        const marked = insertMarkers(text, meta.groundingSupports ?? [], i => {
          if (numberFor.has(i)) return numberFor.get(i)!;
          const c = chunks[i]?.web; if (!c?.uri) return null;
          const n = sources.cite(String(c.uri), String(c.title ?? '')); if (n) numberFor.set(i, n); return n;
        });
        for (const c of chunks) if (c?.web?.uri) sources.seen(String(c.web.uri), String(c.web.title ?? ''));
        text = marked;
        const u = data?.usageMetadata ?? {};
        const usage = { inputTokens: Number(u.promptTokenCount) || 0, outputTokens: (Number(u.candidatesTokenCount) || 0) + (Number(u.thoughtsTokenCount) || 0), cacheReadTokens: Number(u.cachedContentTokenCount) || 0, searches: (meta.webSearchQueries ?? []).length };
        const { cost, status } = costOf(this.prices('gemini', model), usage);
        // Gemini cannot stream numbered markers, so the finished answer is handed over in pieces.
        if (hooks?.onDelta) for (let i = 0; i < text.length; i += 120) hooks.onDelta(text.slice(i, i + 120));
        hooks?.onSources?.(sources.all());
        return { answer: text, citations: sources.all(), searchQueries: (meta.webSearchQueries ?? []).map(String).slice(0, 12), usage, cost, costStatus: status, provider: 'gemini', model, groundedWithGoogle: chunks.length > 0 || (meta.webSearchQueries ?? []).length > 0 };
      } catch (e) {
        if (req.signal?.aborted) throw e;
        last = e;
        const status = (e as ProviderError).status;
        if (status == null || !RETRY_NEXT(status)) throw e instanceof ProviderError ? e : new ProviderError((e as Error).message, 'gemini', null);
      }
    }
    if (agentConfigured() && !req.attachments?.length) {
      try {
        const out = await agentAnswer({ model: config.PPLX_GEMINI_MODEL, input: userTurn(req), instructions: req.system, maxOutputTokens: req.maxOutputTokens, maxResults: 8, signal: req.signal });
        const sources = new SourceList(); for (const s of out.sources) s.cited ? sources.cite(s.url, s.title) : sources.seen(s.url, s.title);
        const usage = { inputTokens: out.inputTokens, outputTokens: out.outputTokens, cacheReadTokens: 0, searches: 0 };
        const { cost, status } = costOf(this.prices('gemini', config.PPLX_GEMINI_MODEL), usage, out.costUsd);
        hooks?.onDelta?.(out.text);
        return { answer: out.text, citations: sources.all(), searchQueries: out.searchQueries, usage, cost, costStatus: status, provider: 'gemini', model: `perplexity:${config.PPLX_GEMINI_MODEL}`, reportedCostUsd: out.costUsd };
      } catch (e) { last = e; }
    }
    throw last instanceof ProviderError ? last : new ProviderError(last ? (last as Error).message : 'Gemini is not configured.', 'gemini', last ? null : 503);
  }
}
