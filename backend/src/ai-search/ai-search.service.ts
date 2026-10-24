import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import type { Request, Response } from 'express';
import { AuthUser } from '../auth/guard';
import { config } from '../config';
import { Db } from '../db';
import { ApiError, badRequest, forbidden, notFound } from '../errors';
import { AiRouterService } from '../ai-router/ai-router.service';
import { policyFor } from '../ai-router/policy';
import { ENGINES, ENGINE_LABELS, Attachment, Depth, EngineChoice, Focus, Mode, ProviderError, RouterError, RouterRequest } from '../ai-router/types';
import { HistoryService } from '../history/history.service';
import { HistoryAccess, shouldSave } from '../history/rules';
import { RateLimiter } from '../rate-limit';
import { isEmail, str } from '../shared/guards';
import { Tier, tierById } from './plans';

// Vivid AI Search. Questions go through the AI router (ai-router/): Perplexity for the live web, Claude for
// reasoning and writing, Gemini for pictures and files, or all three combined. This service owns the person:
// their plan and limits, guest quotas, saved history, and the streamed response.

const MAX_QUESTION = 4000;
const FREE_LANE_MAX = 4;          // free answers running at once, site-wide
const ACTIVE_STATUSES = ['active', 'trialing', 'past_due'];
const ID_RE = /^[a-f0-9]{24}$/;
// If someone holds more than one paid plan, the strongest one applies.
const TIER_RANK: Record<string, number> = { search_free: 0, free: 0, starter: 1, plus: 2, search_pro: 3, pro: 3, business: 3.5, max: 4, search_max: 4.5 };
// Search comes bundled with some Website/App plans bought through Square (plan_subscriptions).
const BUNDLED_SEARCH: Record<string, 'search_pro' | 'search_max'> = { search_pro: 'search_pro', bundle_launch: 'search_pro', search_max: 'search_max', all_in_one: 'search_max' };

const MODES: Mode[] = ['search', 'build', 'create', 'business'];
const DEPTHS: Depth[] = ['quick', 'pro', 'deep'];
const FOCUSES: Focus[] = ['web', 'local', 'news', 'shopping', 'images', 'videos', 'academic', 'business'];
const CHOICES: EngineChoice[] = ['auto', 'perplexity', 'claude', 'gemini', 'combined'];
const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined => (typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : undefined);

const FILE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf'];
function parseAttachments(raw: unknown): Attachment[] {
  if (!Array.isArray(raw) || !raw.length) return [];
  const out: Attachment[] = []; let total = 0;
  for (const a of raw.slice(0, 3)) {
    const mime = String(a?.mime ?? '').toLowerCase(); const data = typeof a?.data === 'string' ? a.data : '';
    if (!FILE_TYPES.includes(mime) || !data || !/^[A-Za-z0-9+/=]+$/.test(data)) throw badRequest('That file type is not supported. Use PNG, JPEG, WebP, GIF or PDF.');
    total += data.length;
    if (total > 420_000) throw badRequest('Attachments are too large. Keep them under about 300 KB in total.');
    out.push({ mime, data, name: str(a?.name, 80) || undefined });
  }
  return out;
}

export interface Entitlement {
  tier: Tier;
  planId: string;                            // the plan or bundle id the router prices and limits by
  subscription: Record<string, any> | null;  // the subscription this user draws from (own, or the company's)
  role: 'free' | 'owner' | 'member';
}

@Injectable()
export class AiSearchService {
  private readonly log = new Logger('AiSearch');
  private freeInFlight = 0;
  private readonly inFlight = new Map<string, number>();

  constructor(private readonly db: Db, private readonly limiter: RateLimiter, private readonly hist: HistoryService, private readonly ai: AiRouterService) {}

  // Saved history is a paid feature and lives in HistoryService (encrypted at rest, plan rules in history/rules.ts).
  history(user: AuthUser): Promise<HistoryAccess> { return this.hist.access(user); }

  engines() {
    const status = this.ai.router.status();
    return ENGINES.map(id => ({ id, label: ENGINE_LABELS[id], available: !!status.find(s => s.id === id)?.available }));
  }

  // ---------- plans, seats and limits ----------

  async entitlement(user: AuthUser): Promise<Entitlement> {
    const own = await this.db.query(
      `SELECT * FROM ai_subscriptions WHERE owner_user_id = $1 AND status = ANY($2) ORDER BY created_date DESC`, [user.id, ACTIVE_STATUSES]);
    const best = own.sort((a, b) => (TIER_RANK[b.tier] ?? 0) - (TIER_RANK[a.tier] ?? 0))[0];
    const bundled = await this.db.one<{ plan_id: string }>(
      `SELECT plan_id FROM plan_subscriptions WHERE owner_user_id = $1 AND status = ANY($2) AND plan_id = ANY($3)
        ORDER BY CASE WHEN plan_id IN ('search_max', 'all_in_one') THEN 0 ELSE 1 END, created_date DESC LIMIT 1`, [user.id, ACTIVE_STATUSES, Object.keys(BUNDLED_SEARCH)]);
    if (best && (!bundled || (TIER_RANK[best.tier] ?? 0) >= (TIER_RANK[BUNDLED_SEARCH[bundled.plan_id]] ?? 0))) return { tier: tierById(best.tier), planId: best.tier, subscription: best, role: 'owner' };
    if (bundled) return { tier: tierById(BUNDLED_SEARCH[bundled.plan_id]), planId: bundled.plan_id, subscription: null, role: 'owner' };

    // A seat on a company's Business plan, matched by account or by invited email.
    const seat = await this.db.one(
      `SELECT s.*, seat.id AS seat_id, seat.user_id AS seat_user_id,
              (SELECT count(*) FROM ai_seats x WHERE x.subscription_id = s.id AND (x.created_date, x.id) <= (seat.created_date, seat.id))::int AS seat_rank
         FROM ai_seats seat JOIN ai_subscriptions s ON s.id = seat.subscription_id
        WHERE (seat.user_id = $1 OR lower(seat.email) = lower($2)) AND s.tier = 'business' AND s.status = ANY($3)
        ORDER BY seat.created_date LIMIT 1`, [user.id, user.email, ACTIVE_STATUSES]);
    if (seat && seat.seat_rank <= seat.seats) {
      if (!seat.seat_user_id) { await this.db.query('UPDATE ai_seats SET user_id = $1 WHERE id = $2', [user.id, seat.seat_id]); await this.hist.refreshEntitlements(user.id); }
      return { tier: tierById('business'), planId: 'business', subscription: seat, role: 'member' };
    }
    return { tier: tierById('search_free'), planId: 'search_free', subscription: null, role: 'free' };
  }

  private async counts(user: AuthUser, ent: Entitlement) {
    const today = await this.db.one<{ n: number }>(
      `SELECT count(*)::int AS n FROM ai_usage WHERE user_id = $1 AND at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`, [user.id]);
    const pooled = ent.tier.id === 'business' && ent.subscription;
    const month = await this.db.one<{ n: number }>(
      `SELECT count(*)::int AS n FROM ai_usage WHERE ${pooled ? 'subscription_id' : 'user_id'} = $1 AND at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
      [pooled ? ent.subscription!.id : user.id]);
    const monthlyLimit = ent.tier.monthlyLimit * (pooled ? Number(ent.subscription!.seats) : 1);
    return { today: today?.n ?? 0, month: month?.n ?? 0, dailyLimit: ent.tier.dailyLimit, monthlyLimit };
  }

  private poolOf(ent: Entitlement) {
    const pooled = ent.tier.id === 'business' && ent.subscription;
    return { subscriptionId: pooled ? String(ent.subscription!.id) : null, seats: pooled ? Number(ent.subscription!.seats) : 1 };
  }

  async status(user: AuthUser) {
    const ent = await this.entitlement(user);
    const usage = await this.counts(user, ent);
    const sub = ent.subscription;
    const history = await this.hist.publicState(user);
    const policy = policyFor(ent.planId);
    const pool = this.poolOf(ent);
    const al = await this.ai.allowanceFor({ userId: user.id, ...pool }, ent.planId);
    return {
      entitlements: { history },
      tier: { id: ent.tier.id, name: ent.tier.name, modelLabel: ent.tier.modelLabel, planId: ent.planId },
      router: { engines: this.engines(), combined: policy.combined, maxDepth: policy.maxDepth },
      allowance: { pct: al.pct, level: al.level, credits: al.credits },   // dollars and caps stay private
      role: ent.role,
      usage,
      subscription: sub ? {
        status: sub.status, seats: Number(sub.seats), company_name: sub.company_name ?? null,
        current_period_end: sub.current_period_end ?? null, can_manage_billing: ent.role === 'owner' && sub.provider === 'square' && !!sub.square_subscription_id, provider: sub.provider, cancels_on: sub.canceled_date ?? null,
      } : null,
    };
  }

  private async dailySpend(): Promise<number> {
    const row = await this.db.one<{ total: string }>(
      `SELECT COALESCE(sum(cost_usd), 0) AS total FROM ai_usage WHERE at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`);
    return Number(row?.total ?? 0);
  }

  // ---------- asking ----------

  // user is null for a visitor who is not signed in: one quick search, nothing saved, limited per network address.
  async ask(user: AuthUser | null, body: any, req: Request, res: Response) {
    const question = str(body?.question, MAX_QUESTION + 1);
    if (!question) throw badRequest('Type a question.');
    if (question.length > MAX_QUESTION) throw badRequest(`Questions can be up to ${MAX_QUESTION} characters.`);
    const guest = !user;
    const threadId = guest || body?.threadId == null || body.threadId === '' ? null : String(body.threadId);
    if (threadId && !ID_RE.test(threadId)) throw badRequest('Invalid conversation.');
    if (!this.engines().some(e => e.available)) throw new ApiError(503, 'AI Search is not configured yet.');

    const mode = pick(body?.mode, MODES) ?? 'search';
    const engine = pick(body?.engine, CHOICES) ?? 'auto';
    const depth = pick(body?.depth, DEPTHS) ?? 'quick';
    const focus = pick(body?.focus, FOCUSES);
    const attachments = guest ? [] : parseAttachments(body?.attachments);

    let who: { id: string; email: string | null };
    let ent: Entitlement;
    if (user) {
      who = { id: user.id, email: user.email };
      ent = await this.entitlement(user);
    } else {
      if (config.GUEST_QUESTIONS_PER_DAY <= 0) throw new ApiError(401, 'Sign in to search.', { code: 'AUTH_REQUIRED' });
      const ip = req.ip || 'unknown';
      try {
        await this.limiter.enforce([
          { scope: 'ai-guest-day', id: ip, max: config.GUEST_QUESTIONS_PER_DAY, windowSec: 86400 },
          { scope: 'ai-guest-minute', id: ip, max: 3, windowSec: 60 },
          { scope: 'ai-app-minute', id: 'all', max: 300, windowSec: 60 },
        ], `You have used today's free searches. Create a free account to keep going.`);
      } catch (e) {
        if (e instanceof ApiError && e.getStatus() === 429) throw new ApiError(429, e.message, { code: 'GUEST_LIMIT' });
        throw e;
      }
      who = { id: `guest:${createHmac('sha256', config.PUBLIC_CLIENT_SECRET).update(`guest:${ip}`).digest('hex').slice(0, 20)}`, email: null };
      ent = { tier: tierById('search_free'), planId: 'search_free', subscription: null, role: 'free' };
    }
    const tier = ent.tier;
    const pool = this.poolOf(ent);

    if (user) {
      await this.limiter.enforce([
        { scope: 'ai-search-user-minute', id: user.id, max: tier.perMinute, windowSec: 60 },
        { scope: 'ai-search-app-minute', id: 'all', max: 300, windowSec: 60 },
      ], 'You are asking very quickly. Wait a moment and try again.');

      const usage = await this.counts(user, ent);
      if (usage.today >= usage.dailyLimit) {
        throw new ApiError(429, `You've used all ${usage.dailyLimit} questions for today on the ${tier.name} plan. They reset at midnight UTC${tier.id === 'search_max' || tier.id === 'max' ? '.' : ', or upgrade for more.'}`, { code: 'QUOTA_DAY' });
      }
      if (usage.month >= usage.monthlyLimit) {
        throw new ApiError(429, `You've used all ${usage.monthlyLimit} questions for this month on the ${tier.name} plan.${tier.id === 'search_max' || tier.id === 'max' || tier.id === 'business' ? '' : ' Upgrade for more.'}`, { code: 'QUOTA_MONTH' });
      }
    }
    if (config.AI_SEARCH_DAILY_BUDGET_USD > 0 && (await this.dailySpend()) >= config.AI_SEARCH_DAILY_BUDGET_USD) {
      this.log.warn('Daily AI Search budget reached; pausing questions until midnight UTC.');
      throw new ApiError(503, 'AI Search is taking a short break because of high demand. Please try again later today.', { code: 'BUDGET' });
    }

    const mine = this.inFlight.get(who.id) ?? 0;
    if (mine >= (tier.priority ? 2 : 1)) throw new ApiError(429, 'Wait for your current answer to finish first.', { code: 'BUSY' });
    if (!tier.priority && this.freeInFlight >= FREE_LANE_MAX) {
      throw new ApiError(429, 'The free lane is busy right now. Try again in a minute, or upgrade for the priority lane.', { code: 'FREE_LANE_BUSY' });
    }

    // Plan limits and the monthly allowance are checked now, while a normal error can still be returned.
    const ctx = { userId: who.id, ...pool, guest };
    const base: RouterRequest = { question, history: [], mode, engine, depth, focus, attachments, planId: ent.planId, trace: this.ai.trace(ctx, question) };
    const pre = await this.ai.preflight(ctx, base);

    // Saving: paid plans only, never in private mode, never while read-only after a downgrade.
    // Unsaved conversations send their own recent turns (body.history) so follow-ups still have context.
    const access = user ? await this.hist.access(user) : null;
    const save = !!user && !!access && shouldSave(access, body?.private === true) && this.hist.enabled;
    let thread: { id: string; title: string } | null = null;
    let history: { role: 'user' | 'assistant'; content: string }[];
    if (save && user) {
      if (threadId) thread = { id: threadId, title: await this.hist.title(user, threadId) };
      else {
        const title = question.replace(/\s+/g, ' ').slice(0, 80);
        thread = { id: await this.hist.open(user, title, mode, ent.planId), title };
      }
      history = threadId ? await this.hist.recentTurns(user, thread.id, tier.historyTurns) : [];
    } else {
      if (threadId && access?.readOnly) throw forbidden('This conversation is read-only because your plan has ended. Start a new search, or renew to continue it.');
      history = (Array.isArray(body?.history) ? body.history : [])
        .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
        .slice(-tier.historyTurns)
        .map((m: any) => ({ role: m.role as 'user' | 'assistant', content: String(m.content).slice(0, 8000) }));
    }
    // The person's own settings, passed to the engine as preferences (never as instructions from a web page).
    const prefs: string[] = [];
    if (body?.lang === 'es') prefs.push('Answer in Spanish.');
    if (body?.safeResults === 'strict') prefs.push('Keep the answer and sources suitable for children.');
    // Memory (Search Max / All-In-One, only when switched on): a few earlier answers on the same subject, as data.
    const remembered = user ? await this.hist.memory(user, question, thread?.id ?? null) : [];
    while (history.length && history[0].role !== 'user') history.shift();
    // The engines need strictly alternating turns; drop any repeats a client might send.
    history = history.filter((m, i, all) => i === 0 || m.role !== all[i - 1].role);
    if (history.length && history[history.length - 1].role === 'user') history.pop();

    // Reserve the question now so parallel or cancelled requests still count toward the limit.
    const usageRow = await this.db.one<{ id: string }>(
      'INSERT INTO ai_usage(user_id, subscription_id, tier, model, provider, engine, mode, depth, guest) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
      [who.id, pool.subscriptionId ?? ent.subscription?.id ?? null, ent.planId, 'pending', null, engine, mode, depth, guest]);
    if (thread && user) await this.hist.addMessage(user, thread.id, { role: 'user', content: question });

    this.inFlight.set(who.id, mine + 1);
    if (!tier.priority) this.freeInFlight++;
    const abort = new AbortController();
    // The response closing before we end it means the visitor left or pressed Stop.
    // (Not req 'close': on current Node it fires once the request body is read.)
    res.on('close', () => { if (!res.writableEnded) abort.abort(); });

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    const send = (event: string, data: unknown) => { if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
    if (thread) send('thread', { id: thread.id, title: thread.title });
    else send('unsaved', { reason: guest ? 'guest' : body?.private === true ? 'private' : access?.readOnly ? 'read-only' : 'plan' });

    let streamed = '';
    let answered: Awaited<ReturnType<AiRouterService['answer']>> | null = null;
    let followCost = 0;
    try {
      answered = await this.ai.answer(ctx, { ...base, history, preferences: prefs, extraContext: remembered.length ? remembered.map(r => `<note>${r}</note>`).join('\n') : undefined, signal: abort.signal }, {
        onDelta: t => { streamed += t; send('delta', { text: t }); },
        onStatus: (stage, detail) => send(stage === 'routing' ? 'routing' : 'status', { stage, ...detail }),
        onSources: s => send('sources', s.slice(0, 16)),
      }, pre);
      const r = answered;
      const finalText = r.answer || streamed;
      if (finalText !== streamed) send('answer', { text: finalText });   // the engine's final wording replaces what streamed (citation markers tidied)
      send('routing', { stage: 'routing', engine: r.engine, why: r.why, routedTo: r.routedTo.map(id => ENGINE_LABELS[id]), provider: r.provider, model: r.model });
      send('sources', r.citations.slice(0, 16));
      if (thread && user) await this.hist.addMessage(user, thread.id, { role: 'assistant', content: finalText || '(no answer)', engine: r.engine === 'combined' ? 'combined' : r.provider, sources: r.citations });
      for (const level of r.notices) send('usage_warning', { level, message: level === 'warn80' ? "You've used 80% of this month's AI allowance." : "You've used this month's AI allowance. It resets on the 1st, or upgrade for more." });
      if (finalText.length > 200) {
        const f = await this.ai.followUps(question, finalText, base.trace);
        followCost = f.cost;
        if (f.questions.length) send('followups', { questions: f.questions });
      }
      send('done', {
        usage: user ? await this.counts(user, ent) : { guest: true },
        allowance: r.allowance ? { pct: r.allowance.pct, level: r.allowance.level, credits: r.allowance.credits } : null,
        engine: r.engine, provider: r.provider, model: r.model, why: r.why, routedTo: r.routedTo, searchQueries: r.searchQueries,
        groundedWithGoogle: !!r.groundedWithGoogle, sponsoredAllowed: !r.groundedWithGoogle,
      });
    } catch (e) {
      if (abort.signal.aborted) this.log.log('Client closed the answer stream.');
      else {
        this.log.error(`AI Search failed: ${(e as Error).message}`);
        const router = e instanceof RouterError;
        const busy = e instanceof ProviderError && (e.status === 429 || (e.status ?? 0) >= 500 || e.billing);
        send('error', { message: router || (e instanceof ApiError) ? (e as Error).message : busy ? 'The AI service is busy right now. Please try again in a minute.' : 'Something went wrong while answering. Please try again.', code: router ? (e as RouterError).code : undefined });
      }
      if (streamed && thread && user) await this.hist.addMessage(user, thread.id, { role: 'assistant', content: streamed }).catch(() => {});
    } finally {
      const r = answered;
      await this.db.query(
        `UPDATE ai_usage SET input_tokens = $2, output_tokens = $3, cache_read_tokens = $4, searches = $5, contributors = $6, cost_usd = $7, model = $8, provider = $9, cost_status = $10 WHERE id = $1`,
        [usageRow!.id, r?.usage.inputTokens ?? 0, r?.usage.outputTokens ?? 0, r?.usage.cacheReadTokens ?? 0, r?.usage.searches ?? 0,
          JSON.stringify((r?.perEngine ?? []).map(x => ({ id: x.provider, ok: x.ok }))), ((r?.chargedUsd ?? 0) + followCost).toFixed(5), r?.model ?? 'none', r?.provider ?? null, r?.costStatus ?? 'known'],
      ).catch(e => this.log.error(`usage update failed: ${(e as Error).message}`));
      this.inFlight.set(who.id, (this.inFlight.get(who.id) ?? 1) - 1);
      if ((this.inFlight.get(who.id) ?? 0) <= 0) this.inFlight.delete(who.id);
      if (!tier.priority) this.freeInFlight = Math.max(0, this.freeInFlight - 1);
      res.end();
    }
  }

  // ---------- saved conversations (kept for the existing site; the same data is under /api/history) ----------

  private legacyShape(c: any) { return { id: c.id, title: c.title, updated_date: c.updated_date, pinned: c.pinned, favorite: c.favorite, space: c.space?.name ?? null, auto_delete_days: c.auto_delete_days }; }

  async threads(user: AuthUser, query: { q?: string; space?: string; favorites?: string } = {}) {
    return (await this.hist.list(user, query)).map(c => this.legacyShape(c));
  }
  async spaces(user: AuthUser) {
    return (await this.hist.spaces(user)).map(sp => ({ name: sp.name, threads: sp.conversations, id: sp.id }));
  }
  async thread(user: AuthUser, id: string) {
    const c = await this.hist.get(user, id);
    return { ...this.legacyShape(c), readOnly: c.readOnly, messages: c.messages.map(m => ({ id: m.id, role: m.role, content: m.content, sources: m.sources.map(({ url, title, cited }) => ({ url, title, cited })), contributors: [], created_date: m.created_date })) };
  }
  async updateThread(user: AuthUser, id: string, body: any) {
    const patch: any = { ...body };
    if (body?.space !== undefined) {   // older clients send a Space by name
      const name = body.space === null || body.space === '' ? null : str(body.space, 60);
      if (!name) patch.spaceId = null;
      else {
        const existing = (await this.hist.spaces(user)).find(sp => sp.name.toLowerCase() === name.toLowerCase());
        patch.spaceId = existing?.id ?? (await this.hist.createSpace(user, name)).id;
      }
    }
    return this.legacyShape(await this.hist.update(user, id, patch));
  }
  async exportThreads(user: AuthUser) { return this.hist.exportAll(user); }
  async deleteThread(user: AuthUser, id: string) { await this.hist.remove(user, id); return { deleted: true }; }

  // ---------- Business seats (owner only) ----------

  private async ownedBusiness(user: AuthUser) {
    const sub = await this.db.one(`SELECT * FROM ai_subscriptions WHERE owner_user_id = $1 AND tier = 'business' AND status = ANY($2) ORDER BY created_date DESC LIMIT 1`, [user.id, ACTIVE_STATUSES]);
    if (!sub) throw forbidden('Only the owner of a Business plan can manage seats.');
    return sub;
  }

  async team(user: AuthUser) {
    const sub = await this.ownedBusiness(user);
    const members = await this.db.query(
      `SELECT seat.id, seat.email, seat.role, seat.user_id IS NOT NULL AS joined, seat.created_date,
              (SELECT count(*)::int FROM ai_usage u WHERE u.subscription_id = $1 AND u.user_id = seat.user_id
                 AND u.at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') AS questions_this_month
         FROM ai_seats seat WHERE seat.subscription_id = $1 ORDER BY seat.created_date, seat.id`, [sub.id]);
    return { seats: Number(sub.seats), company_name: sub.company_name, members };
  }

  async addMember(user: AuthUser, body: any) {
    const sub = await this.ownedBusiness(user);
    const email = String(body?.email ?? '').trim().toLowerCase();
    if (email.length > 150 || !isEmail(email)) throw badRequest('Enter a valid email address.');
    const used = await this.db.one<{ n: number }>('SELECT count(*)::int AS n FROM ai_seats WHERE subscription_id = $1', [sub.id]);
    if ((used?.n ?? 0) >= Number(sub.seats)) throw badRequest(`All ${sub.seats} seats are in use. Add seats from Manage billing first.`);
    const existing = await this.db.one<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [email]);
    const row = await this.db.one(
      `INSERT INTO ai_seats(subscription_id, email, user_id) VALUES ($1, $2, $3) ON CONFLICT (subscription_id, email) DO NOTHING RETURNING id`,
      [sub.id, email, existing?.id ?? null]);
    if (!row) throw badRequest('That person already has a seat.');
    if (existing) await this.hist.refreshEntitlements(existing.id);
    return this.team(user);
  }

  async removeMember(user: AuthUser, seatId: string) {
    const sub = await this.ownedBusiness(user);
    if (!ID_RE.test(seatId)) throw notFound('Seat not found.');
    const rows = await this.db.query(`DELETE FROM ai_seats WHERE id = $1 AND subscription_id = $2 AND role <> 'owner' RETURNING id, user_id`, [seatId, sub.id]);
    if (!rows.length) throw badRequest('That seat cannot be removed.');
    if (rows[0].user_id) await this.hist.refreshEntitlements(rows[0].user_id);
    return this.team(user);
  }
}
