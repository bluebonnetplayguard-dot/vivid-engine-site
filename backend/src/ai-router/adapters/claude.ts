import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config';
import { AgentApiError, agentConfigured, agentStream } from '../../ai-search/perplexity-agent';
import { PriceBook, costOf } from '../prices';
import { AdapterRequest, Hooks, ProviderAdapter, ProviderError, ProviderResult } from '../types';
import { SourceList, userTurn } from './common';

const MAX_CONTINUATIONS = 3;

// Claude: reasoning, writing and code, with live web search when the question needs it. Answers through
// Anthropic's API; if that key is missing or Claude fails before saying anything, the same Claude model answers
// through the Perplexity Agent API instead (when that key is set).
export class ClaudeAdapter implements ProviderAdapter {
  readonly id = 'claude' as const;
  private readonly client = config.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: config.ANTHROPIC_API_KEY }) : null;
  constructor(private readonly prices: PriceBook) {}
  configured() { return !!this.client || agentConfigured(); }

  // A short answer with no web search, for small jobs like suggesting follow-up questions. Never throws.
  async quick(system: string, prompt: string, maxTokens = 400): Promise<{ text: string; cost: number; model: string; usage: { inputTokens: number; outputTokens: number }; latencyMs: number } | null> {
    if (!this.client) return null;
    const model = 'claude-haiku-5-5';
    const started = Date.now();
    try {
      const res = await this.client.messages.create({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] });
      const text = res.content.map((b: any) => (b.type === 'text' ? b.text : '')).join('');
      const { cost } = costOf(this.prices('claude', model), { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens, cacheReadTokens: 0, searches: 0 });
      return { text, cost, model, usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens }, latencyMs: Date.now() - started };
    } catch { return null; }
  }

  async run(req: AdapterRequest, hooks?: Hooks): Promise<ProviderResult> {
    const model = req.model;
    const turn = userTurn(req);
    const sources = new SourceList();
    const queries: string[] = [];
    let text = '';
    const emit = (t: string) => { text += t; hooks?.onDelta?.(t); };
    let usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, searches: 0 };
    let reported: number | null = null;
    let viaPerplexity = !this.client;

    if (this.client) try {
      const content: Anthropic.Beta.BetaContentBlockParam[] = [];
      for (const a of req.attachments ?? []) {
        if (a.mime.startsWith('image/')) content.push({ type: 'image', source: { type: 'base64', media_type: a.mime as any, data: a.data } });
        else if (a.mime === 'application/pdf') content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.data } } as any);
      }
      content.push({ type: 'text', text: turn });
      const messages: Anthropic.Beta.BetaMessageParam[] = [...req.history.map(m => ({ role: m.role, content: m.content })), { role: 'user', content }];
      const withFallback = model !== 'claude-haiku-5-5';   // Haiku has no server-side fallback (Sonnet/Opus only)
      for (let step = 0; step <= MAX_CONTINUATIONS; step++) {
        const stream = this.client.beta.messages.stream({
          model, max_tokens: req.maxOutputTokens,
          system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
          messages,
          tools: [withFallback
            ? { type: 'web_search_20260209' as const, name: 'web_search' as const, max_uses: req.searches }
            : { type: 'web_search_20250305' as const, name: 'web_search' as const, max_uses: req.searches }],
          output_config: { effort: req.effort },
          cache_control: { type: 'ephemeral' },
          ...(withFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
        }, { signal: req.signal });

        const pending = new Map<number, number[]>();   // text block index -> source numbers cited inside it
        for await (const event of stream as AsyncIterable<any>) {
          if (event.type === 'content_block_start') {
            const block = event.content_block;
            if (block.type === 'server_tool_use' && block.name === 'web_search') hooks?.onStatus?.('searching');
            if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
              for (const r of block.content) sources.seen(r.url, r.title);
              hooks?.onSources?.(sources.all());
            }
          } else if (event.type === 'content_block_delta') {
            if (event.delta.type === 'text_delta') emit(event.delta.text);
            else if (event.delta.type === 'citations_delta' && event.delta.citation?.url) {
              const n = sources.cite(event.delta.citation.url, event.delta.citation.title ?? '');
              if (n) { const list = pending.get(event.index) ?? []; if (!list.includes(n)) list.push(n); pending.set(event.index, list); }
            }
          } else if (event.type === 'content_block_stop') {
            const list = pending.get(event.index);
            if (list?.length) { emit(list.sort((a, b) => a - b).map(n => `[${n}]`).join('')); pending.delete(event.index); hooks?.onSources?.(sources.all()); }
          }
        }
        const final = await stream.finalMessage();
        usage.inputTokens += final.usage.input_tokens + (final.usage.cache_creation_input_tokens ?? 0);
        usage.outputTokens += final.usage.output_tokens;
        usage.cacheReadTokens += final.usage.cache_read_input_tokens ?? 0;
        usage.searches += final.usage.server_tool_use?.web_search_requests ?? 0;
        for (const block of final.content as any[]) if (block.type === 'server_tool_use' && typeof block.input?.query === 'string' && !queries.includes(block.input.query)) queries.push(String(block.input.query).slice(0, 200));
        if (final.stop_reason === 'pause_turn') {
          // A long server-side search turn paused; send it back so Claude continues where it stopped.
          messages.push({ role: 'assistant', content: final.content as unknown as Anthropic.Beta.BetaContentBlockParam[] });
          continue;
        }
        if (final.stop_reason === 'refusal') emit("\n\nI can't help with that request.");
        else if (final.stop_reason === 'max_tokens') emit("\n\n_(Answer cut short: it reached this plan's length limit. Ask me to continue.)_");
        break;
      }
    } catch (e) {
      if (req.signal?.aborted) throw e;
      const status = e instanceof Anthropic.APIError ? (e.status ?? null) : null;
      if (text || !agentConfigured() || !(e instanceof Anthropic.APIError)) throw new ProviderError((e as Error).message, 'claude', status, !!text);
      viaPerplexity = true;   // nothing was shown yet: answer through the Perplexity Agent API instead
      usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, searches: 0 };
    }

    if (viaPerplexity) {
      try {
        hooks?.onStatus?.('searching');
        const out = await agentStream({
          model: `anthropic/${model}`, instructions: req.system,
          input: [...req.history.map(m => ({ type: 'message' as const, role: m.role, content: m.content })), { type: 'message' as const, role: 'user' as const, content: turn }],
          maxOutputTokens: req.maxOutputTokens, maxResults: 10, effort: req.effort, signal: req.signal,
        }, d => emit(d));
        for (const s of out.sources) s.cited ? sources.cite(s.url, s.title) : sources.seen(s.url, s.title);
        for (const q of out.searchQueries) if (!queries.includes(q)) queries.push(q);
        usage = { inputTokens: out.inputTokens, outputTokens: out.outputTokens, cacheReadTokens: 0, searches: 0 };
        reported = out.costUsd;
      } catch (e) {
        if (e instanceof AgentApiError) throw new ProviderError(e.message, 'claude', e.status, !!text);
        throw new ProviderError((e as Error).message, 'claude', null, !!text);
      }
    }

    const { cost, status } = costOf(this.prices('claude', model), usage, reported);
    return { answer: text, citations: sources.all(), searchQueries: queries, usage, cost, costStatus: status, provider: 'claude', model: viaPerplexity ? `perplexity:anthropic/${model}` : model, reportedCostUsd: reported };
  }
}
