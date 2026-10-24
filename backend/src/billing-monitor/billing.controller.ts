import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AdminOnly, AuthUser, CurrentUser, Public } from '../auth/guard';
import { ApiError, badRequest, notFound } from '../errors';
import { BillingMonitorService } from './billing-monitor.service';
import { parsePeriod } from './reports';

const id = (v: string) => { const n = Number(v); if (!Number.isInteger(n) || n < 1) throw notFound(); return n; };

const budgetBody = z.object({
  scope: z.enum(['global', 'provider', 'user', 'workflow']),
  scope_ref: z.string().max(120).default(''),
  period: z.enum(['day', 'month']),
  amount_usd: z.coerce.number().positive().max(10_000_000),
  warn_pcts: z.array(z.number().int().min(1).max(500)).min(1).max(8).default([50, 80, 100]),
  hard_stop: z.boolean().default(false),
  note: z.string().max(200).optional(),
});
const budgetPatch = z.object({
  amount_usd: z.coerce.number().positive().max(10_000_000).optional(),
  warn_pcts: z.array(z.number().int().min(1).max(500)).min(1).max(8).optional(),
  hard_stop: z.boolean().optional(),
  enabled: z.boolean().optional(),
  override_hours: z.number().min(0).max(24 * 31).optional(),   // lift a hard stop for this long; 0 removes the override
  note: z.string().max(200).optional(),
}).strict();
const priceBody = z.object({
  provider: z.string().min(1).max(40), model: z.string().min(1).max(120),
  token_type: z.enum(['input', 'output', 'cache_read', 'cache_write', 'thinking', 'search', 'call']),
  price_usd: z.coerce.number().min(0).max(100_000),
  unit: z.enum(['mtok', 'unit']).default('mtok'),
  price_window: z.enum(['any', 'peak', 'offpeak']).default('any'),
  effective_from: z.string().datetime().optional(),
  source_url: z.string().url().max(300).optional(),
  note: z.string().max(200).optional(),
});

// /api/admin/billing/*  Admin only. Nothing here returns a key or any prompt text.
@Controller('admin/billing')
export class BillingController {
  constructor(private readonly b: BillingMonitorService) {}

  @AdminOnly() @Get('summary')
  summary(@Query('period') period?: string) { return this.b.reports.summary().then(s => ({ period: parsePeriod(period), ...s })); }

  @AdminOnly() @Get('by-model') byModel(@Query('period') p?: string) { return this.b.reports.breakdown('model', parsePeriod(p)).then(rows => ({ rows })); }
  @AdminOnly() @Get('by-user') byUser(@Query('period') p?: string) { return this.b.reports.breakdown('user', parsePeriod(p)).then(rows => ({ rows })); }
  @AdminOnly() @Get('by-workflow') byWorkflow(@Query('period') p?: string) { return this.b.reports.breakdown('workflow', parsePeriod(p)).then(rows => ({ rows })); }
  @AdminOnly() @Get('by-feature') byFeature(@Query('period') p?: string) { return this.b.reports.breakdown('feature', parsePeriod(p)).then(rows => ({ rows })); }
  @AdminOnly() @Get('by-command') byCommand(@Query('period') p?: string) { return this.b.reports.breakdown('command', parsePeriod(p)).then(rows => ({ rows })); }

  @AdminOnly() @Get('providers')
  async providers() { return { providers: await this.b.reports.providers(), jobs: await this.b.jobs.health() }; }

  @AdminOnly() @Get('optimize')
  optimize() { return this.b.reports.optimize(); }

  // ---------- alerts ----------
  @AdminOnly() @Get('alerts')
  async alerts(@Query('open') open?: string) { return { alerts: await this.b.alerts.list({ open: open === '1' || open === 'true' }), open: await this.b.alerts.openCounts() }; }

  @AdminOnly() @Post('alerts/:id/ack') @HttpCode(200)
  async ack(@CurrentUser() user: AuthUser, @Param('id') alertId: string) {
    const r = await this.b.alerts.ack(id(alertId), user.email);
    if (!r) throw notFound('That alert is already acknowledged or does not exist.');
    return { ok: true };
  }

  // ---------- budgets ----------
  @AdminOnly() @Get('budgets')
  async budgets() { return { budgets: await this.b.db.query(`SELECT id, scope, scope_ref, period, amount_usd::float AS amount_usd, warn_pcts, hard_stop, override_until, enabled, note FROM budgets ORDER BY scope, scope_ref, period`) }; }

  @AdminOnly() @Post('budgets') @HttpCode(200)
  async createBudget(@Body() body: unknown) {
    const v = budgetBody.parse(body);
    if (v.scope === 'global') v.scope_ref = '';
    else if (!v.scope_ref) throw badRequest('Say which provider, account or workflow this budget is for.');
    const row = await this.b.db.one(
      `INSERT INTO budgets(scope, scope_ref, period, amount_usd, warn_pcts, hard_stop, note) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (scope, scope_ref, period) DO UPDATE SET amount_usd = $4, warn_pcts = $5, hard_stop = $6, note = $7, enabled = true RETURNING id`,
      [v.scope, v.scope_ref, v.period, v.amount_usd, v.warn_pcts, v.hard_stop, v.note ?? null]);
    this.b.guard.invalidate();
    return { id: row.id };
  }

  @AdminOnly() @Patch('budgets/:id')
  async patchBudget(@Param('id') budgetId: string, @Body() body: unknown) {
    const v = budgetPatch.parse(body);
    const sets: string[] = []; const params: unknown[] = [id(budgetId)];
    const add = (col: string, val: unknown) => { params.push(val); sets.push(`${col} = $${params.length}`); };
    if (v.amount_usd != null) add('amount_usd', v.amount_usd);
    if (v.warn_pcts) add('warn_pcts', v.warn_pcts);
    if (v.hard_stop != null) add('hard_stop', v.hard_stop);
    if (v.enabled != null) add('enabled', v.enabled);
    if (v.note != null) add('note', v.note);
    if (v.override_hours != null) { params.push(String(v.override_hours)); sets.push(v.override_hours === 0 ? 'override_until = NULL' : `override_until = now() + ($${params.length} || ' hours')::interval`); }
    if (!sets.length) throw badRequest('Nothing to change.');
    const row = await this.b.db.one(`UPDATE budgets SET ${sets.join(', ')} WHERE id = $1 RETURNING id`, params);
    if (!row) throw notFound('No such budget.');
    this.b.guard.invalidate();
    return { ok: true };
  }

  // ---------- prices ----------
  @AdminOnly() @Get('prices')
  async prices() {
    return { prices: await this.b.db.query(`SELECT id, provider, model, token_type, price_usd::float AS price_usd, unit, price_window, effective_from, effective_to, source_url, confirmed, note FROM model_prices ORDER BY provider, model, token_type, effective_from DESC`) };
  }

  // A new price starts a new row and closes the one it replaces, so past calls keep the price they were charged at.
  @AdminOnly() @Post('prices') @HttpCode(200)
  async addPrice(@Body() body: unknown) {
    const v = priceBody.parse(body);
    const from = v.effective_from ?? new Date().toISOString();
    const db = this.b.db;
    await db.query(`UPDATE model_prices SET effective_to = $5 WHERE provider = $1 AND model = $2 AND token_type = $3 AND price_window = $4 AND effective_to IS NULL AND effective_from < $5`, [v.provider, v.model, v.token_type, v.price_window, from]);
    const row = await db.one(
      `INSERT INTO model_prices(provider, model, token_type, price_usd, unit, price_window, effective_from, source_url, note, confirmed) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)
       ON CONFLICT (provider, model, token_type, price_window, effective_from) DO UPDATE SET price_usd = $4, unit = $5, source_url = $8, note = $9, confirmed = true RETURNING id`,
      [v.provider, v.model, v.token_type, v.price_usd, v.unit, v.price_window, from, v.source_url ?? null, v.note ?? null]);
    this.b.prices.invalidate();
    return { id: row.id };
  }

  @AdminOnly() @Patch('prices/:id')
  async confirmPrice(@Param('id') priceId: string, @Body() body: unknown) {
    const v = z.object({ confirmed: z.boolean(), note: z.string().max(200).optional() }).strict().parse(body);
    const row = await this.b.db.one(`UPDATE model_prices SET confirmed = $2, note = COALESCE($3, note) WHERE id = $1 RETURNING id`, [id(priceId), v.confirmed, v.note ?? null]);
    if (!row) throw notFound('No such price.');
    return { ok: true };
  }

  // Lets an account that was slowed down by the abuse guard go back to normal.
  @AdminOnly() @Delete('throttles/:userId') @HttpCode(200)
  async unthrottle(@Param('userId') userId: string) {
    await this.b.db.query('DELETE FROM billing_throttles WHERE user_id = $1', [userId.slice(0, 120)]);
    return { ok: true };
  }
}

// Google Cloud budget notices arrive here from a Pub/Sub push subscription. The shared token is checked in constant
// time; anything else gets a plain 403 and nothing is stored.
@Controller('billing/webhooks')
export class BillingWebhookController {
  constructor(private readonly b: BillingMonitorService) {}

  @Public() @Post('gcp-budget') @HttpCode(204)
  async gcp(@Req() req: Request, @Body() body: unknown, @Query('token') token?: string) {
    const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined;
    const result = await this.b.gcpWebhook(body, token ?? bearer);
    if (result === 'forbidden') throw new ApiError(403, 'Forbidden.');
  }
}
