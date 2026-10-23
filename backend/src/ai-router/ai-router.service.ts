import { Injectable, Logger } from '@nestjs/common';
import { config } from '../config';
import { Db } from '../db';
import { ApiError } from '../errors';
import { ClaudeAdapter } from './adapters/claude';
import { GeminiAdapter } from './adapters/gemini';
import { PerplexityAdapter } from './adapters/perplexity';
import { Allowance, CreditLedger, allowance, assertWithinCap, crossed, marginCheck } from './credits';
import { defaultPriceBook } from './prices';
import { ESTIMATE_USD, checkCombined, checkDepth, estimateUsd, isFree, monthlyCapUsd, policyFor } from './policy';
import { AiRouter } from './router';
import { ENGINES, ENGINE_LABELS, EngineId, Hooks, RouterError, RouterRequest, RouterResult } from './types';

export interface AnswerContext {
  userId: string;
  subscriptionId?: string | null;   // Business seats share one pool
  seats?: number;                   // Business: allowance grows with seats
  guest?: boolean;                  // not signed in: no ledger, the per-address quota applies instead
}
export interface Answered extends RouterResult { allowance: Allowance | null; notices: ('warn80' | 'limit100')[]; chargedUsd: number }

// The Nest face of the router: builds the engines from the environment, keeps each account inside its monthly
// allowance (credit ledger), flags accounts whose price no longer covers 2.5x cost, and reports engine health.
@Injectable()
export class AiRouterService {
  private readonly log = new Logger('AiRouter');
  readonly router: AiRouter;
  readonly ledger: CreditLedger;
  private readonly claude: ClaudeAdapter;
  private readonly lastError = new Map<EngineId, { at: number; message: string }>();
  private readonly lastOk = new Map<EngineId, number>();

  constructor(private readonly db: Db) {
    const prices = defaultPriceBook;
    this.claude = new ClaudeAdapter(prices);
    this.router = new AiRouter({ adapters: [new PerplexityAdapter(prices), this.claude, new GeminiAdapter(prices)], log: m => this.log.warn(m) });
    this.router.onBillingError = (engine, message) => this.log.error(`${ENGINE_LABELS[engine]} reported a billing or key problem and is paused for a few minutes: ${message.slice(0, 160)}`);
    this.ledger = new CreditLedger(db);
  }

  capFor(planId: string, seats = 1) {
    const p = policyFor(planId);
    return Math.round(monthlyCapUsd(p, config.AI_MARGIN_MULTIPLIER) * (p.perSeat ? Math.max(1, seats) : 1) * 100) / 100;
  }

  async allowanceFor(ctx: AnswerContext, planId: string): Promise<Allowance> {
    return allowance(this.capFor(planId, ctx.seats), await this.ledger.spent({ userId: ctx.userId, subscriptionId: ctx.subscriptionId }));
  }

  private async platformSpent(): Promise<number> {
    const row = await this.db.one<{ s: string }>(`SELECT COALESCE(sum(cost_usd), 0) AS s FROM ai_usage WHERE at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`);
    return Number(row?.s ?? 0);
  }

  // Everything that can be refused before an answer starts: plan limits, the account's monthly allowance, the platform cap.
  // Call this before sending any response headers so the person gets a normal error with a clear message.
  async preflight(ctx: AnswerContext, req: RouterRequest): Promise<{ cap: number; spentBefore: number }> {
    try {
      const policy = policyFor(req.planId);
      checkDepth(policy, req.depth);
      if (req.engine === 'combined') checkCombined(policy);
      const cap = this.capFor(req.planId, ctx.seats);
      const estimate = estimateUsd(req.depth, req.engine === 'combined' ? 4 : 1);   // three engines and the one that writes the merged answer
      const spentBefore = ctx.guest ? 0 : await this.ledger.spent({ userId: ctx.userId, subscriptionId: ctx.subscriptionId });
      if (!ctx.guest) assertWithinCap(spentBefore, estimate, cap);
      if (config.AI_MONTHLY_CAP_USD > 0) assertWithinCap(await this.platformSpent(), estimate, config.AI_MONTHLY_CAP_USD, 'platform');
      return { cap, spentBefore };
    } catch (e) { return this.fail(e); }
  }

  async answer(ctx: AnswerContext, req: RouterRequest, hooks?: Hooks, pre?: { cap: number; spentBefore: number }): Promise<Answered> {
    const policy = policyFor(req.planId);
    const { cap, spentBefore } = pre ?? await this.preflight(ctx, req);

    let result: RouterResult;
    try { result = await this.router.route(req, hooks); }
    catch (e) {
      for (const a of (e as { attempts?: unknown }).attempts as { engine: EngineId; error?: string }[] ?? []) if (a.error) this.lastError.set(a.engine, { at: Date.now(), message: a.error });
      throw e;
    }
    for (const a of result.attempts) { if (a.ok) this.lastOk.set(a.engine, Date.now()); else if (a.error) this.lastError.set(a.engine, { at: Date.now(), message: a.error }); }

    // What we charge the account: the real cost, or a cautious estimate when no price is known yet (marked pending).
    const rows = result.perEngine?.length ? result.perEngine : [{ provider: result.provider, model: result.model, cost: result.cost, ok: true }];
    const pending = result.costStatus === 'pending';
    let charged = 0; let before = spentBefore; let after = spentBefore;
    if (!ctx.guest) {
      for (const r of rows.filter(x => x.ok)) {
        const usd = pending && r.cost === 0 ? ESTIMATE_USD[req.depth] : r.cost;
        const entry = await this.ledger.record({ userId: ctx.userId, subscriptionId: ctx.subscriptionId, planId: req.planId, provider: r.provider, model: r.model, costUsd: usd, costStatus: pending && r.cost === 0 ? 'pending' : result.costStatus });
        if (charged === 0) before = entry.before;
        after = entry.after; charged += usd;
      }
    } else charged = pending ? ESTIMATE_USD[req.depth] : result.cost;
    result.cost = charged;

    const notices: ('warn80' | 'limit100')[] = [];
    let al: Allowance | null = null;
    if (!ctx.guest) {
      al = allowance(cap, after);
      for (const level of crossed(before, after, cap)) if (await this.ledger.firstNotice(ctx.userId, level)) notices.push(level);
      if (!isFree(policy)) {
        const m = marginCheck(policy.priceMonthlyUsd * (policy.perSeat ? Math.max(1, ctx.seats ?? 1) : 1), after, config.AI_MARGIN_MULTIPLIER);
        if (!m.ok) { await this.ledger.flagMargin({ userId: ctx.userId, planId: req.planId, priceUsd: policy.priceMonthlyUsd, costUsd: after, multiplier: config.AI_MARGIN_MULTIPLIER }); this.log.warn(`Margin flag: ${req.planId} account is below ${config.AI_MARGIN_MULTIPLIER}x cost this month.`); }
      }
    }
    return Object.assign(result, { allowance: al, notices, chargedUsd: charged });
  }

  // Three to five short follow-up questions. Costs a fraction of a cent; skipped quietly when Claude is not available.
  async followUps(question: string, answer: string): Promise<{ questions: string[]; cost: number }> {
    const out = await this.claude.quick(
      'You suggest follow-up questions. Reply with only a JSON array of 3 to 5 short questions (under 90 characters each) the person might ask next. No other text.',
      `Question: ${question.slice(0, 600)}\n\nAnswer:\n${answer.slice(0, 3000)}`);
    if (!out) return { questions: [], cost: 0 };
    try {
      const list = JSON.parse(out.text.slice(out.text.indexOf('['), out.text.lastIndexOf(']') + 1));
      const questions = (Array.isArray(list) ? list : []).filter((q): q is string => typeof q === 'string').map(q => q.trim()).filter(q => q.length > 3 && q.length <= 140).slice(0, 5);
      return { questions: questions.length >= 3 ? questions : [], cost: out.cost };
    } catch { return { questions: [], cost: out.cost }; }
  }

  // For GET /api/admin/health/providers. Never includes a key or a response body.
  providerHealth() {
    return ENGINES.map(id => {
      const s = this.router.status().find(x => x.id === id)!;
      const err = this.lastError.get(id);
      const recentError = err && Date.now() - err.at < 15 * 60_000 && (this.lastOk.get(id) ?? 0) < err.at;
      return {
        id, label: ENGINE_LABELS[id],
        status: !s.configured ? 'missing' : !s.available || recentError ? 'error' : 'connected',
        lastError: recentError || !s.available ? { at: new Date(err?.at ?? Date.now()).toISOString(), message: (err?.message ?? 'Paused after a billing or key problem.').replace(/(sk|key|Bearer)[-_ ]?[A-Za-z0-9._-]{8,}/g, '[hidden]').slice(0, 160) } : null,
        lastSuccess: this.lastOk.get(id) ? new Date(this.lastOk.get(id)!).toISOString() : null,
      };
    });
  }

  fail(e: unknown): never {
    if (e instanceof RouterError) throw new ApiError(e.status, e.message, { code: e.code });
    throw e;
  }
}
