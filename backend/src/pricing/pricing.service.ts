import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { AuthUser } from '../auth/guard';
import { Db } from '../db';
import { EntitiesService, Rec } from '../entities/entities.service';
import { ApiError, badRequest, notFound } from '../errors';
import { Notifier } from '../notify';
import { RateLimiter } from '../rate-limit';
import { Context, DEFAULT_RULES, MarketPrice, PricingRules, marketStats, mergeRules, recommend } from './engine';
import { MarketResearch, ProviderName, providerConfigured } from './research';

const SCHEDULE_HOURS: Record<string, number> = { hourly: 1, '6h': 6, '12h': 12, daily: 24, weekly: 168, monthly: 720 };
export const AUTO_CONFIRM_PHRASE = 'ENABLE AUTOMATIC PRICING';

const rulesSchema = z.object({
  min_margin_pct: z.number().min(0).max(95),
  max_margin_pct: z.number().min(0).max(99).nullable(),
  max_auto_increase_pct: z.number().min(0).max(50),
  max_auto_decrease_pct: z.number().min(0).max(50),
  max_daily_change_pct: z.number().min(0).max(100),
  min_price: z.number().min(0).nullable(),
  max_price: z.number().min(0).nullable(),
  min_confidence: z.number().min(0).max(1),
  min_sources: z.number().int().min(1).max(50),
  approval_threshold_pct: z.number().min(0).max(100),
  cooldown_hours: z.number().min(0).max(24 * 90),
  max_source_age_hours: z.number().min(1).max(24 * 365),
  deadband_pct: z.number().min(0).max(50),
  red_pct: z.number().min(0).max(100),
  blue_pct: z.number().min(0).max(100),
  market_position_pct: z.number().min(-50).max(50),
  increase_capture_pct: z.number().min(0).max(100),
  volatility_pct: z.number().min(1).max(500),
  include_promotions: z.boolean(),
  rounding: z.enum(['cent', 'dollar', 'ninety_nine']),
}).partial();

const settingsSchema = z.object({
  mode: z.enum(['manual', 'assisted', 'automatic']).optional(),
  auto_enabled: z.boolean().optional(),
  confirm_automatic: z.string().optional(),
  schedule: z.enum(['manual', 'hourly', '6h', '12h', 'daily', 'weekly', 'monthly']).optional(),
  rules: rulesSchema.optional(),
  providers: z.object({ tavily: z.boolean(), exa: z.boolean(), perplexity: z.boolean() }).partial().optional(),
}).strict();

const csvCell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

// Market pricing: research, recommendations, approvals, history and the scheduler.
// Prices change only on PricingItem records (the central pricing database). They do
// not change the website's published price list or Stripe checkout amounts.
@Injectable()
export class PricingService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Pricing');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly db: Db,
    private readonly entities: EntitiesService,
    private readonly research: MarketResearch,
    private readonly notifier: Notifier,
    private readonly limiter: RateLimiter,
  ) {}

  // ---------- settings ----------

  async settings(): Promise<Rec> {
    const [row] = await this.entities.filterTrusted('PricingSettings', {}, 'created_date', 1);
    if (row) return row;
    return this.entities.insert('PricingSettings', {
      mode: 'manual', auto_enabled: false, schedule: 'manual', rules: { ...DEFAULT_RULES }, providers: { tavily: true, exa: true, perplexity: true },
    }, null);
  }

  async publicSettings() {
    const s = await this.settings();
    return {
      ...s, rules: mergeRules(s.rules),
      provider_status: { tavily: providerConfigured('tavily'), exa: providerConfigured('exa'), perplexity: providerConfigured('perplexity') },
      auto_confirm_phrase: AUTO_CONFIRM_PHRASE,
    };
  }

  async updateSettings(user: AuthUser, body: unknown) {
    const input = settingsSchema.parse(body);
    const current = await this.settings();
    const patch: Record<string, unknown> = {};
    if (input.schedule) patch.schedule = input.schedule;
    if (input.providers) patch.providers = { ...(current.providers ?? {}), ...input.providers };
    if (input.rules) patch.rules = { ...mergeRules(current.rules), ...input.rules };
    if (input.mode) patch.mode = input.mode;
    const mode = (input.mode ?? current.mode) as string;
    const wantsAuto = input.auto_enabled ?? current.auto_enabled;
    if (input.auto_enabled === true && !current.auto_enabled) {
      if (mode !== 'automatic') throw badRequest('Switch the mode to Automatic before enabling automatic adjustments.');
      if (input.confirm_automatic !== AUTO_CONFIRM_PHRASE) throw badRequest(`Type "${AUTO_CONFIRM_PHRASE}" to confirm.`);
      Object.assign(patch, { auto_enabled: true, auto_enabled_by: user.email, auto_enabled_at: new Date().toISOString() });
      await this.alert('auto_adjustment', 'warning', 'Automatic pricing enabled', `${user.email} enabled automatic price adjustments within the configured limits.`);
    }
    if (input.auto_enabled === false || mode !== 'automatic') patch.auto_enabled = false;
    if (!wantsAuto) patch.auto_enabled = false;
    return this.entities.patch('PricingSettings', current.id, patch);
  }

  // ---------- analysis ----------

  private async alert(type: string, severity: 'info' | 'warning' | 'critical', title: string, message: string, extra: Record<string, unknown> = {}) {
    await this.entities.insert('PricingAlert', { type, severity, title: title.slice(0, 200), message: message.slice(0, 2000), read: false, ...extra }, null);
  }

  private async items(ids?: string[]) {
    const filter: Record<string, unknown> = { active: true };
    if (ids?.length) filter.id = { $in: ids.slice(0, 200) };
    return this.entities.filterTrusted('PricingItem', filter, 'name', 200);
  }

  // Fetches market prices for items (research providers), storing each with its source.
  async refreshCompetitors(ids?: string[]) {
    const s = await this.settings();
    const enabled = (s.providers ?? {}) as Partial<Record<ProviderName, boolean>>;
    const items = await this.items(ids);
    const summary: { item: string; stored: number; verified: number; providers: unknown[] }[] = [];
    for (const item of items) {
      const query = item.search_query || `${item.name} price ${item.region || ''}`.trim();
      const { docs, results } = await this.research.gather(query, enabled);
      for (const r of results.filter(r => !r.ok)) {
        await this.alert('api_failure', 'warning', `${r.provider} research failed`, `${item.name}: ${r.error}`, { pricing_item_id: item.id });
      }
      if (!results.length) {
        summary.push({ item: item.name, stored: 0, verified: 0, providers: [] });
        continue;
      }
      const found = await this.research.extract(item.name, item.region || '', docs);
      let stored = 0, verified = 0;
      for (const f of found) {
        // Duplicate prevention: same source URL and price within 24 hours.
        const dupe = await this.db.one(
          `SELECT 1 FROM records WHERE entity = 'CompetitorPrice' AND data ->> 'pricing_item_id' = $1 AND data ->> 'source_url' = $2
             AND (data ->> 'price')::numeric = $3 AND created_date > now() - interval '24 hours'`,
          [item.id, f.source_url, f.price],
        );
        if (dupe) continue;
        await this.entities.insert('CompetitorPrice', { pricing_item_id: item.id, retrieved_at: new Date().toISOString(), ...f }, null);
        stored++; if (f.verified) verified++;
      }
      if (stored && !verified) {
        await this.alert('unverified_source', 'info', `Unverified prices for ${item.name}`, `${stored} price(s) were found but none could be verified against their source page. They are shown for review and excluded from market averages.`, { pricing_item_id: item.id });
      }
      summary.push({ item: item.name, stored, verified, providers: results });
    }
    return { items: summary, configured: { tavily: providerConfigured('tavily'), exa: providerConfigured('exa'), perplexity: providerConfigured('perplexity') } };
  }

  private async changedLast24h(itemId: string) {
    const rows = await this.db.query<{ old: number; new: number }>(
      `SELECT (data ->> 'old_price')::numeric AS old, (data ->> 'new_price')::numeric AS new FROM records
        WHERE entity = 'PriceHistory' AND data ->> 'pricing_item_id' = $1 AND data ->> 'action' IN ('applied', 'auto_applied', 'restored', 'manual_edit')
          AND created_date > now() - interval '24 hours'`, [itemId],
    );
    return rows.reduce((sum, r) => sum + (Number(r.old) > 0 ? Math.abs((Number(r.new) - Number(r.old)) / Number(r.old)) * 100 : 0), 0);
  }

  // Computes fresh recommendations from stored market prices (no outside calls).
  async generateRecommendations(ids?: string[], actor = 'system') {
    const s = await this.settings();
    const rules = mergeRules(s.rules);
    const items = await this.items(ids);
    const out: Rec[] = [];
    for (const item of items) {
      const prices = (await this.entities.filterTrusted('CompetitorPrice', { pricing_item_id: item.id }, '-created_date', 500)) as unknown as MarketPrice[];
      const stats = marketStats(prices, rules, item.currency || 'USD');
      const [previous] = await this.entities.filterTrusted('PriceRecommendation', { pricing_item_id: item.id }, '-created_date', 1);
      const ctx: Context = {
        mode: s.mode, auto_enabled: !!s.auto_enabled, last_price_change_at: item.last_price_change_at,
        previous_market_average: previous?.market?.average ?? null, changed_last_24h_pct: await this.changedLast24h(item.id),
      };
      const r = recommend(item as any, stats, rules, ctx);
      await this.db.query(
        `UPDATE records SET data = data || '{"status":"superseded"}'::jsonb, updated_date = now()
          WHERE entity = 'PriceRecommendation' AND data ->> 'pricing_item_id' = $1 AND data ->> 'status' IN ('pending', 'info')`, [item.id],
      );
      const rec = await this.entities.insert('PriceRecommendation', {
        pricing_item_id: item.id, item_name: item.name, current_price: r.current_price, recommended_price: r.recommended_price,
        change_pct: r.change_pct, direction: r.direction,
        market: { average: stats.average, median: stats.median, low: stats.low, high: stats.high, count: stats.count, sources: stats.sources, confidence: stats.confidence, newest_age_hours: stats.newest_age_hours, excluded: stats.excluded.length },
        costs: { total: r.total_cost, margin_floor: r.margin_floor, current_gross_margin_pct: r.current_gross_margin_pct },
        gross_margin_pct: r.gross_margin_pct, markup_pct: r.markup_pct, status_color: r.status_color,
        status: r.direction === 'none' ? 'info' : 'pending', requires_approval: r.requires_approval, auto_eligible: r.auto_eligible,
        blocked_reasons: r.blocked_reasons, reasons: r.reasons, explanation: r.explanation, below_floor: r.below_floor,
        mode: s.mode, source_ids: stats.used_ids,
      }, null);
      await this.entities.patch('PricingItem', item.id, { last_analyzed_at: new Date().toISOString() });

      if (r.below_floor) await this.alert('below_margin', 'critical', `${item.name} is below its minimum margin`, r.explanation, { pricing_item_id: item.id, recommendation_id: rec.id });
      if (ctx.previous_market_average && stats.average) {
        const move = ((stats.average - ctx.previous_market_average) / ctx.previous_market_average) * 100;
        if (Math.abs(move) > rules.volatility_pct) await this.alert('volatility', 'warning', `Unusual market move for ${item.name}`, `Verified market average moved ${move.toFixed(1)}% since the last analysis. Automatic changes are held until it settles.`, { pricing_item_id: item.id });
        else if (Math.abs(move) > rules.red_pct) await this.alert(move > 0 ? 'market_increase' : 'market_decrease', 'info', `Market ${move > 0 ? 'rose' : 'fell'} for ${item.name}`, `Verified market average moved ${move.toFixed(1)}% to $${stats.average}.`, { pricing_item_id: item.id });
      }
      if (r.auto_eligible) {
        await this.decide({ id: 'system', email: actor, role: 'admin', full_name: null }, rec.id, 'approve');
        await this.apply({ id: 'system', email: actor, role: 'admin', full_name: null }, [rec.id], true);
        await this.alert('auto_adjustment', 'info', `Automatic price change: ${item.name}`, r.explanation, { pricing_item_id: item.id, recommendation_id: rec.id });
      } else if (r.direction !== 'none') {
        await this.alert('recommendation', r.status_color === 'red' ? 'warning' : 'info',
          `MARKET PRICE ALERT: ${item.name}`,
          `Current $${r.current_price} | Verified market average $${stats.average} | Recommended $${r.recommended_price} (${r.change_pct > 0 ? '+' : ''}${r.change_pct}%). ${r.reasons[0] ?? ''} Action: approve, reject or review.`,
          { pricing_item_id: item.id, recommendation_id: rec.id });
      }
      out.push(rec);
    }
    return { recommendations: out };
  }

  async analyze(ids?: string[], actor = 'system') {
    const research = await this.refreshCompetitors(ids);
    const recs = await this.generateRecommendations(ids, actor);
    return { research, ...recs };
  }

  // ---------- approvals and price changes ----------

  async decide(user: AuthUser, recId: string, action: 'approve' | 'reject') {
    const rec = await this.entities.findTrusted('PriceRecommendation', recId);
    if (!rec) throw notFound('Recommendation not found.');
    if (rec.status !== 'pending') throw new ApiError(409, `This recommendation is ${rec.status}.`);
    return this.entities.patch('PriceRecommendation', rec.id, {
      status: action === 'approve' ? 'approved' : 'rejected', decided_by: user.email, decided_at: new Date().toISOString(),
    });
  }

  private async changePrice(item: Rec, newPrice: number, action: string, reason: string, user: AuthUser, extra: Record<string, unknown> = {}) {
    const total = (item.unit_cost || 0) + (item.operating_cost || 0) + (item.delivery_cost || 0);
    await this.entities.insert('PriceHistory', {
      pricing_item_id: item.id, item_name: item.name, action, old_price: item.current_price, new_price: newPrice,
      total_cost: Math.round(total * 100) / 100, gross_margin_pct: newPrice > 0 ? Math.round(((newPrice - total) / newPrice) * 10000) / 100 : null,
      reason, approved_by: user.email, ...extra,
    }, user.id === 'system' ? null : user.id);
    return this.entities.patch('PricingItem', item.id, { current_price: newPrice, last_price_change_at: new Date().toISOString() });
  }

  async apply(user: AuthUser, recIds: string[], automatic = false) {
    if (!Array.isArray(recIds) || !recIds.length) throw badRequest('Select at least one approved recommendation.');
    const applied: string[] = [];
    const skipped: { id: string; reason: string }[] = [];
    for (const id of recIds.slice(0, 200)) {
      const rec = await this.entities.findTrusted('PriceRecommendation', String(id));
      if (!rec || rec.status !== 'approved') { skipped.push({ id: String(id), reason: 'not an approved recommendation' }); continue; }
      const item = await this.entities.findTrusted('PricingItem', rec.pricing_item_id);
      if (!item) { skipped.push({ id: rec.id, reason: 'item no longer exists' }); continue; }
      if (Math.abs(item.current_price - rec.current_price) > 0.005) { skipped.push({ id: rec.id, reason: 'price changed since this recommendation; analyze again' }); continue; }
      await this.changePrice(item, rec.recommended_price, automatic ? 'auto_applied' : 'applied', rec.explanation, user, {
        recommendation_id: rec.id, market_average: rec.market?.average, market_low: rec.market?.low, market_high: rec.market?.high, source_ids: rec.source_ids,
      });
      await this.entities.patch('PriceRecommendation', rec.id, { status: 'applied', applied_at: new Date().toISOString() });
      applied.push(rec.id);
    }
    return { applied, skipped };
  }

  // Direct administrator price change. Going below the minimum-margin price needs explicit confirmation.
  async setPrice(user: AuthUser, body: any) {
    const item = await this.entities.findTrusted('PricingItem', String(body?.pricing_item_id ?? ''));
    if (!item) throw notFound('Item not found.');
    const price = Number(body?.price);
    if (!Number.isFinite(price) || price <= 0 || price > 10_000_000) throw badRequest('Enter a valid price.');
    const rules = mergeRules((await this.settings()).rules);
    const total = (item.unit_cost || 0) + (item.operating_cost || 0) + (item.delivery_cost || 0);
    const floor = total > 0 ? total / (1 - rules.min_margin_pct / 100) : 0;
    if (price < floor - 0.005 && body?.allow_below_margin !== true) {
      throw new ApiError(409, `$${price} is below the minimum-margin price of $${floor.toFixed(2)}. Confirm to override.`, { code: 'BELOW_MARGIN', floor: Math.round(floor * 100) / 100 });
    }
    return this.changePrice(item, Math.round(price * 100) / 100, 'manual_edit', String(body?.reason ?? 'Manual price change').slice(0, 500), user);
  }

  async restore(user: AuthUser, historyId: string) {
    const h = await this.entities.findTrusted('PriceHistory', String(historyId));
    if (!h || h.old_price == null) throw notFound('History entry not found.');
    const item = await this.entities.findTrusted('PricingItem', h.pricing_item_id);
    if (!item) throw notFound('Item no longer exists.');
    return this.changePrice(item, h.old_price, 'restored', `Restored the price from before the change on ${new Date(h.created_date).toLocaleString('en-US', { timeZone: 'America/Chicago' })}`, user);
  }

  async importPrices(body: any) {
    const rows = Array.isArray(body?.rows) ? body.rows.slice(0, 500) : [];
    if (!rows.length) throw badRequest('Provide rows to import.');
    let stored = 0;
    const errors: string[] = [];
    for (const [i, row] of rows.entries()) {
      try {
        if (!row?.source_url) throw new Error('source_url is required');
        await this.entities.insert('CompetitorPrice', {
          retrieved_at: new Date().toISOString(), source_provider: row.source_provider === 'supplier_api' ? 'supplier_api' : 'manual', ...row,
        }, null);
        stored++;
      } catch (e) { errors.push(`row ${i + 1}: ${(e as Error).message.split('\n')[0].slice(0, 160)}`); }
    }
    return { stored, errors };
  }

  // ---------- dashboard data ----------

  async overview() {
    const s = await this.publicSettings();
    const items = await this.entities.filterTrusted('PricingItem', {}, 'name', 500);
    // Latest decision per item (superseded ones are replaced by a newer analysis).
    const recs = await this.entities.filterTrusted('PriceRecommendation', { status: { $ne: 'superseded' } }, '-created_date', 1000);
    const latest = new Map<string, Rec>();
    for (const r of recs) if (!latest.has(r.pricing_item_id)) latest.set(r.pricing_item_id, r);
    const pending = [...latest.values()].filter(r => r.status === 'pending' || r.status === 'approved');
    const impact = pending.reduce((sum, r) => sum + (r.recommended_price - r.current_price), 0);
    const ages = [...latest.values()].map(r => r.market?.newest_age_hours).filter((a): a is number => typeof a === 'number');
    const unread = await this.db.one<{ n: number }>(`SELECT count(*)::int AS n FROM records WHERE entity = 'PricingAlert' AND NOT COALESCE((data ->> 'read')::boolean, false)`);
    return {
      settings: s,
      totals: {
        products: items.filter(i => i.kind === 'product').length,
        services: items.filter(i => i.kind !== 'product').length,
        needs_review: pending.filter(r => r.status === 'pending').length,
        increases: pending.filter(r => r.direction === 'increase').length,
        decreases: pending.filter(r => r.direction === 'decrease').length,
        potential_gross_profit_impact_per_unit: Math.round(impact * 100) / 100,
        freshest_data_hours: ages.length ? Math.min(...ages) : null,
        unread_alerts: unread?.n ?? 0,
      },
      items: items.map(i => ({ ...i, recommendation: latest.get(i.id) ?? null })),
    };
  }

  async report() {
    const { items } = await this.overview();
    const header = ['Item', 'Type', 'Current price', 'Total cost', 'Market average', 'Market low', 'Market high', 'Verified sources', 'Recommended price', 'Change %', 'Gross margin %', 'Markup %', 'Status', 'Recommendation status', 'Explanation'];
    const lines = items.map((i: Record<string, any>) => {
      const r = i.recommendation;
      const total = (i.unit_cost || 0) + (i.operating_cost || 0) + (i.delivery_cost || 0);
      return [i.name, i.kind, i.current_price, total, r?.market?.average, r?.market?.low, r?.market?.high, r?.market?.sources, r?.recommended_price, r?.change_pct, r?.gross_margin_pct, r?.markup_pct, r?.status_color, r?.status, r?.explanation].map(csvCell).join(',');
    });
    return { filename: `pricing-report-${new Date().toISOString().slice(0, 10)}.csv`, csv: [header.join(','), ...lines].join('\n') };
  }

  // ---------- scheduler ----------

  onModuleInit() {
    this.timer = setInterval(() => this.tick().catch(e => this.log.error(`Scheduled analysis failed: ${(e as Error).message}`)), 5 * 60_000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  private async tick() {
    if (this.running) return;
    const s = await this.settings();
    const hours = SCHEDULE_HOURS[s.schedule as string];
    if (!hours) return;
    const last = s.last_run_at ? new Date(s.last_run_at).getTime() : 0;
    if (Date.now() - last < hours * 3_600_000) return;
    // One run per schedule window even across restarts.
    if (await this.limiter.check([{ scope: 'pricing-schedule', id: `${s.schedule}:${Math.floor(Date.now() / (hours * 3_600_000))}`, max: 1, windowSec: Math.ceil(hours * 3600) }])) return;
    this.running = true;
    try {
      const result = await this.analyze(undefined, 'scheduler');
      const changes = result.recommendations.filter(r => r.direction !== 'none').length;
      await this.entities.patch('PricingSettings', s.id, { last_run_at: new Date().toISOString(), last_run_status: `OK: ${result.recommendations.length} item(s) analyzed, ${changes} recommendation(s).` });
      if (changes) void this.notifier.emailAdmins('Pricing analysis: recommendations ready', `${changes} price recommendation(s) are waiting in Admin > Market Pricing.`);
    } catch (e) {
      await this.entities.patch('PricingSettings', s.id, { last_run_at: new Date().toISOString(), last_run_status: `Failed: ${(e as Error).message.slice(0, 300)}` });
      await this.alert('api_failure', 'critical', 'Scheduled pricing analysis failed', (e as Error).message);
    } finally {
      this.running = false;
    }
  }
}
