import { Body, Controller, Headers, HttpCode, Param, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Public } from '../auth/guard';
import { badRequest, forbidden, notFound, unauthorized } from '../errors';
import { AiService } from './ai';
import { Billing } from './billing';
import { OpsService } from './ops';
import { PortalService } from './portal';
import { PublicClients } from './public-client';
import { PricingService } from '../pricing/pricing.service';

type Access = 'public' | 'user' | 'admin';
type Handler = (ctx: { user: AuthUser | null; body: any; visitorId?: string }) => Promise<unknown>;

// POST /api/functions/:name replaces base44.functions.invoke(name, payload).
// Every function from base44/functions is here, with the same access level.
@Controller('functions')
export class FunctionsController {
  private readonly registry: Record<string, { access: Access; handler: Handler }>;

  constructor(
    private readonly ai: AiService,
    private readonly billing: Billing,
    private readonly portal: PortalService,
    private readonly ops: OpsService,
    private readonly visitors: PublicClients,
    private readonly pricing: PricingService,
  ) {
    const ids = (body: any): string[] | undefined => (Array.isArray(body?.item_ids) ? body.item_ids.map(String) : undefined);
    this.registry = {
      // Public, behind the anonymous visitor check
      chatAssistant: { access: 'public', handler: ({ body, visitorId }) => this.ai.chatAssistant(visitorId, body) },
      submitInquiry: { access: 'public', handler: ({ body, visitorId }) => this.ops.submitInquiry(visitorId, body) },
      // Signed-in clients
      sendProjectMessage: { access: 'user', handler: ({ user, body }) => this.portal.sendProjectMessage(user, body) },
      getMyDomainLeaseStatus: { access: 'user', handler: ({ user }) => this.portal.getMyDomainLeaseStatus(user) },
      getClientBillingSummary: { access: 'user', handler: ({ user }) => this.portal.getClientBillingSummary(user) },
      requestDomainLeaseCancellation: { access: 'user', handler: ({ user, body }) => this.portal.requestDomainLeaseCancellation(user, body) },
      withdrawDomainLeaseCancellationRequest: { access: 'user', handler: ({ user, body }) => this.portal.withdrawDomainLeaseCancellationRequest(user, body) },
      createDomainSupportRequest: { access: 'user', handler: ({ user, body }) => this.portal.createDomainSupportRequest(user, body) },
      requestAccountDeletion: { access: 'user', handler: ({ user, body }) => this.portal.requestAccountDeletion(user, body) },
      // Admin tools
      createInvoice: { access: 'admin', handler: ({ user, body }) => this.billing.createInvoice(user, body) },
      createCheckout: { access: 'admin', handler: ({ user, body }) => this.billing.createCheckout(user, body) },
      marketingAgent: { access: 'admin', handler: ({ body }) => this.ai.marketingAgent(body) },
      generateEstimate: { access: 'admin', handler: ({ body }) => this.ai.generateEstimate(body) },
      generateLeadOutreach: { access: 'admin', handler: ({ body }) => this.ai.generateLeadOutreach(body) },
      generateLogo: { access: 'admin', handler: ({ body }) => this.ai.generateLogo(body) },
      sendDailyLeadSummary: { access: 'admin', handler: () => this.ops.sendDailyLeadSummary() },
      submitIndexNow: { access: 'admin', handler: ({ body }) => this.ops.submitIndexNow(body) },
      // Market pricing (admin only)
      pricingOverview: { access: 'admin', handler: () => this.pricing.overview() },
      pricingSettings: { access: 'admin', handler: () => this.pricing.publicSettings() },
      pricingUpdateSettings: { access: 'admin', handler: ({ user, body }) => this.pricing.updateSettings(user, body) },
      pricingAnalyze: { access: 'admin', handler: ({ user, body }) => this.pricing.analyze(ids(body), user.email) },
      pricingRefreshCompetitors: { access: 'admin', handler: ({ body }) => this.pricing.refreshCompetitors(ids(body)) },
      pricingRecommend: { access: 'admin', handler: ({ user, body }) => this.pricing.generateRecommendations(ids(body), user.email) },
      pricingDecide: { access: 'admin', handler: ({ user, body }) => this.pricing.decide(user, String(body.recommendation_id ?? ''), body.action === 'approve' ? 'approve' : 'reject') },
      pricingApply: { access: 'admin', handler: ({ user, body }) => this.pricing.apply(user, body.recommendation_ids) },
      pricingSetPrice: { access: 'admin', handler: ({ user, body }) => this.pricing.setPrice(user, body) },
      pricingRestore: { access: 'admin', handler: ({ user, body }) => this.pricing.restore(user, body.history_id) },
      pricingImportPrices: { access: 'admin', handler: ({ body }) => this.pricing.importPrices(body) },
      pricingReport: { access: 'admin', handler: () => this.pricing.report() },
    };
  }

  @Public()
  @Post(':name')
  @HttpCode(200)
  // Per-IP ceiling; public functions also have the visitor check and their own budgets.
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async invoke(@Param('name') name: string, @Body() body: any, @CurrentUser() user: AuthUser | null) {
    const fn = Object.prototype.hasOwnProperty.call(this.registry, name) ? this.registry[name] : null;
    if (!fn) throw notFound(`Unknown function: ${name}`);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest('Invalid JSON object.');
    if (fn.access !== 'public' && !user) throw unauthorized('Sign in required.');
    if (fn.access === 'admin' && user.role !== 'admin') throw forbidden('Administrator access required.');
    const visitorId = fn.access === 'public' ? await this.visitors.verify(body) : undefined;
    return fn.handler({ user, body, visitorId });
  }
}
