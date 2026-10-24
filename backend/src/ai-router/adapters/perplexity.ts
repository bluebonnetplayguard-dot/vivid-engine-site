import { config } from '../../config';
import { AgentApiError, agentAnswer, agentConfigured, agentStream } from '../../ai-search/perplexity-agent';
import { PriceBook, costOf } from '../prices';
import { AdapterRequest, Hooks, ProviderAdapter, ProviderError, ProviderResult } from '../types';
import { userTurn } from './common';

// Perplexity Agent API: web search with citations. The default for questions that need the live web.
export class PerplexityAdapter implements ProviderAdapter {
  readonly id = 'perplexity' as const;
  constructor(private readonly prices: PriceBook) {}
  configured() { return agentConfigured(); }

  async run(req: AdapterRequest, hooks?: Hooks): Promise<ProviderResult> {
    const model = config.PERPLEXITY_SEARCH_MODEL;
    const input = [...req.history.map(m => ({ type: 'message' as const, role: m.role, content: m.content })), { type: 'message' as const, role: 'user' as const, content: userTurn(req) }];
    const call = { model, input, instructions: `${req.system}\n- Mark every sourced claim with its number like [1], matching the order of the sources you used.`, maxOutputTokens: req.maxOutputTokens, maxResults: Math.max(req.searches * 2, 6), effort: req.effort, signal: req.signal };
    let streamed = false;
    try {
      hooks?.onStatus?.('searching');
      const out = hooks?.onDelta ? await agentStream(call, d => { streamed = true; hooks.onDelta!(d); }) : await agentAnswer(call);
      const usage = { inputTokens: out.inputTokens, outputTokens: out.outputTokens, cacheReadTokens: 0, searches: 0 };
      const { cost, status } = costOf(this.prices('perplexity', model), usage, out.costUsd);
      const citations = out.sources.map((s, i) => ({ n: i + 1, url: s.url, title: s.title, cited: s.cited }));
      hooks?.onSources?.(citations);
      return { answer: out.text, citations, searchQueries: out.searchQueries, usage, cost, costStatus: status, provider: 'perplexity', model, reportedCostUsd: out.costUsd };
    } catch (e) {
      if (e instanceof AgentApiError) throw new ProviderError(e.message, 'perplexity', e.status, streamed);
      if ((e as Error).name === 'AbortError') throw e;
      throw new ProviderError((e as Error).message, 'perplexity', null, streamed);
    }
  }
}
