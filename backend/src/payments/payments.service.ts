import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuthUser } from '../auth/guard';
import { config } from '../config';
import { Db } from '../db';
import { EntitiesService } from '../entities/entities.service';
import { ApiError, badRequest, forbidden } from '../errors';
import { isEmail, str } from '../shared/guards';
import { CARD_FEE_RATE, CatalogItem, catalogItems } from '../shared/pricing';
import { PAID_TIER_IDS, tierById } from '../ai-search/plans';
import { VIDEO_PAID_TIER_IDS, videoTierById } from '../video/video-plans';
import { receiptFooter } from './receipts';
import { SquareClient, SquareError, SquarePayment, SquareSubscription, squareConfigured, verifyWebhookSignature } from './square';

// Square is the only payment provider. Prices come from config (plans.ts, video-plans.ts, shared/pricing.ts), never from
// the browser. One-time purchases may use Afterpay; subscriptions never do.

export type SubscriptionKind = 'ai_search' | 'video_studio';
const TABLE: Record<SubscriptionKind, string> = { ai_search: 'ai_subscriptions', video_studio: 'video_subscriptions' };
const SEATS: Record<SubscriptionKind, string> = { ai_search: 'ai_seats', video_studio: 'video_seats' };
const ACTIVE = ['active', 'trialing', 'past_due'];
const PRICE_KEYS = ['amount', 'total', 'price', 'unit_amount', 'line_items', 'subtotal'];
const METHODS = new Set(['card', 'afterpay', 'apple_pay', 'google_pay', 'cash_app_pay']);

export interface Quote {
  mode: 'payment' | 'subscription';
  items: CatalogItem[];
  totalCents: number;           // what Square will charge now (one-time) or each month (subscription)
  afterpayEligible: boolean;    // one-time purchases only
  description: string;
  reference: string;            // invoice id, plan id or kind:tier
  kind: 'invoice' | 'catalog' | 'ai_search' | 'video_studio';
  seats?: number;
  tier?: string;
  companyName?: string;
  clientEmail?: string;
  clientName?: string;
  invoiceId?: string;
}

const tierOf = (kind: SubscriptionKind, id: string) => (kind === 'ai_search' ? tierById(id) : videoTierById(id));
const paidTiers = (kind: SubscriptionKind): readonly string[] => (kind === 'ai_search' ? PAID_TIER_IDS : VIDEO_PAID_TIER_IDS);
const productName = (kind: SubscriptionKind) => (kind === 'ai_search' ? 'Vivid AI Search' : 'Vivid Video Studio');

@Injectable()
export class PaymentsService {
  private readonly log = new Logger('Payments');
  readonly square = new SquareClient();

  constructor(private readonly db: Db, private readonly entities: EntitiesService) {}

  // Public ids the Web Payments SDK needs. Never the access token.
  publicConfig() {
    return { configured: squareConfigured(), applicationId: config.SQUARE_APPLICATION_ID || null, locationId: config.SQUARE_LOCATION_ID || null,
      environment: config.SQUARE_ENVIRONMENT === 'production' ? 'production' : 'sandbox', afterpayMinCents: 100, afterpayMaxCents: 200_000 };
  }

  private requireSquare() { if (!squareConfigured()) throw new ApiError(503, 'Payments are not switched on yet.', { code: 'NOT_CONFIGURED' }); }

  // ---------- quotes (server-side pricing) ----------

  async quote(user: AuthUser | null, body: any): Promise<Quote> {
    if (PRICE_KEYS.some(k => Object.prototype.hasOwnProperty.call(body ?? {}, k))) throw badRequest('Send a plan selection or invoice id, never an amount.');
    const kind = String(body?.kind ?? (body?.invoice_id ? 'invoice' : 'catalog'));
    if (kind === 'ai_search' || kind === 'video_studio') {
      if (!user) throw new ApiError(401, 'Sign in to choose a plan.', { code: 'AUTH_REQUIRED' });
      const tierId = String(body?.tier ?? '');
      if (!paidTiers(kind).includes(tierId)) throw badRequest('Choose a paid plan.');
      const tier = tierOf(kind, tierId);
      const seats = tier.perSeat ? Math.floor(Number(body?.seats)) : 1;
      if (tier.perSeat && (!Number.isFinite(seats) || seats < tier.minSeats || seats > 500)) throw badRequest(`Choose between ${tier.minSeats} and 500 seats.`);
      const company = tier.perSeat ? str(body?.company_name, 120) : '';
      if (tier.perSeat && !company) throw badRequest('Enter your company name.');
      const cents = Math.round(tier.priceMonthly * 100) * seats;
      return { mode: 'subscription', kind, tier: tier.id, seats, companyName: company, reference: `${kind}:${tier.id}`,
        items: [{ id: tier.id, name: `${productName(kind)} ${tier.name}${tier.perSeat ? ` × ${seats} seats` : ''}`, cents, interval: 'month' }],
        totalCents: cents, afterpayEligible: false, description: `${productName(kind)} ${tier.name}, billed monthly` };
    }
    // One-time: a saved invoice, or a catalog plan selection (website plans / add-ons from shared/pricing.ts).
    let invoice: Record<string, any> | null = null;
    if (body?.invoice_id) {
      if (typeof body.invoice_id !== 'string' || body.invoice_id.length > 80) throw badRequest('Invalid invoice.');
      invoice = await this.entities.findTrusted('Invoice', body.invoice_id);
      if (!invoice || !['sent', 'overdue'].includes(invoice.status)) throw badRequest('Only an approved, unpaid invoice can be paid.');
    }
    const selection = invoice || body || {};
    const isCatalog = !!selection.plan_id && selection.plan_id !== 'manual';
    let items: CatalogItem[];
    if (isCatalog) { try { items = catalogItems(selection); } catch (e) { throw badRequest((e as Error).message); } }
    else {
      if (!invoice) throw badRequest('Manual prices need a saved, approved invoice.');
      const cents = Math.round(Number(invoice.total) * 100);
      if (!Number.isSafeInteger(cents) || cents < 50 || cents > 100_000_000) throw badRequest('Invalid saved invoice total.');
      items = [{ id: 'invoice', name: `Invoice ${invoice.number || invoice.id}: ${invoice.service || 'Approved service'}`, cents, interval: null }];
    }
    if (items.some(i => i.interval)) throw badRequest('Monthly website plans are set up from your account page, not here.');
    const feeCents = Math.round(items.reduce((s, i) => s + i.cents, 0) * CARD_FEE_RATE);
    const all = feeCents ? [...items, { id: 'card-fee', name: 'Card processing fee (3.5%)', cents: feeCents, interval: null }] : items;
    const totalCents = all.reduce((s, i) => s + i.cents, 0);
    const cfg = this.publicConfig();
    return { mode: 'payment', kind: invoice ? 'invoice' : 'catalog', items: all, totalCents,
      afterpayEligible: totalCents >= cfg.afterpayMinCents && totalCents <= cfg.afterpayMaxCents,
      description: invoice ? `Invoice ${invoice.number || invoice.id}` : items.map(i => i.name).join(', '),
      reference: invoice ? invoice.id : String(selection.plan_id), invoiceId: invoice?.id,
      clientEmail: invoice?.client_email || str(body?.client_email, 254), clientName: invoice?.client_name || str(body?.client_name, 100) };
  }

  // ---------- one-time payments (card, Apple Pay, Google Pay, Cash App Pay, Afterpay) ----------

  async charge(user: AuthUser | null, body: any) {
    this.requireSquare();
    const sourceId = str(body?.source_id, 500);
    if (!sourceId) throw badRequest('Missing payment token.');
    const method = str(body?.method, 20) || 'card';
    if (!METHODS.has(method)) throw badRequest('Unknown payment method.');
    const q = await this.quote(user, body);
    if (q.mode !== 'payment') throw badRequest('Plans are set up through Subscribe, not a one-time charge.');
    if (method === 'afterpay') {
      if (!q.afterpayEligible) throw badRequest('Afterpay is not available for this amount.');
      // The Afterpay button was created for an amount in the browser; the charge must match it exactly.
      const shown = Math.round(Number(body?.amount_cents));
      if (shown !== q.totalCents) throw badRequest('The Afterpay amount no longer matches. Reload and try again.');
    }
    const email = str(body?.email, 254) || q.clientEmail || user?.email || '';
    if (email && !isEmail(email)) throw badRequest('Enter a valid email for the receipt.');
    const idempotencyKey = str(body?.idempotency_key, 45) || randomUUID();
    let payment: SquarePayment;
    try {
      payment = await this.square.createPayment({ sourceId, cents: q.totalCents, email: email || undefined, note: `${q.description} · ${receiptFooter()}`,
        referenceId: q.reference, idempotencyKey, verificationToken: str(body?.verification_token, 500) || undefined });
    } catch (e) {
      throw this.asApiError(e, 'The payment was declined.');
    }
    await this.recordPayment(payment, q, method, email, user?.id);
    if (payment.status === 'COMPLETED' && q.invoiceId) await this.markInvoicePaid(q.invoiceId, payment.id);
    return { id: payment.id, status: payment.status, amountCents: payment.amount_money.amount, receiptUrl: payment.receipt_url ?? null, method };
  }

  private async recordPayment(p: SquarePayment, q: Quote, method: string, email: string, userId?: string) {
    await this.db.query(
      `INSERT INTO payments(provider, external_id, kind, reference, amount_cents, currency, status, method, buyer_email, user_id, location_id, receipt_url)
       VALUES ('square', $1, $2, $3, $4, 'USD', $5, $6, $7, $8, $9, $10)
       ON CONFLICT (external_id) DO UPDATE SET status = EXCLUDED.status, receipt_url = EXCLUDED.receipt_url, updated_date = now()`,
      [p.id, q.kind, q.reference, p.amount_money.amount, p.status, method, email || null, userId || null, p.location_id, p.receipt_url || null]);
  }

  private async markInvoicePaid(invoiceId: string, paymentId: string) {
    await this.entities.patch('Invoice', invoiceId, { status: 'paid', paid_date: new Date().toISOString().slice(0, 10), payment_provider: 'square', payment_id: paymentId })
      .catch(e => this.log.error(`Could not mark invoice ${invoiceId} paid: ${(e as Error).message}`));
  }

  // ---------- subscriptions (card on file; never Afterpay) ----------

  async subscribe(user: AuthUser, body: any) {
    this.requireSquare();
    const kind = String(body?.kind) as SubscriptionKind;
    if (!TABLE[kind]) throw badRequest('Unknown plan type.');
    const sourceId = str(body?.source_id, 500);
    if (!sourceId) throw badRequest('Missing card token.');
    if (str(body?.method, 20) === 'afterpay') throw badRequest('Afterpay can only be used for one-time purchases, not monthly plans.');
    const q = await this.quote(user, body);
    const current = await this.db.one(`SELECT id FROM ${TABLE[kind]} WHERE owner_user_id = $1 AND status = ANY($2) LIMIT 1`, [user.id, ACTIVE]);
    if (current) throw new ApiError(409, 'You already have a plan. Cancel it from your account page first.', { code: 'HAS_PLAN' });
    const tier = tierOf(kind, q.tier!);
    try {
      const customerId = await this.square.findOrCreateCustomer(user.email, user.full_name || undefined, user.id);
      const card = await this.square.createCard(sourceId, customerId, str(body?.verification_token, 500) || undefined);
      const variationId = await this.planVariation(kind, tier.id, q.seats!, q.totalCents, q.items[0].name);
      const sub = await this.square.createSubscription({ customerId, cardId: card.id, planVariationId: variationId });
      await this.syncSubscription(kind, sub, { userId: user.id, tier: tier.id, seats: q.seats!, companyName: q.companyName, customerId, cardId: card.id });
      return { id: sub.id, status: sub.status, chargedThrough: sub.charged_through_date ?? null, card: { brand: card.brand ?? null, last4: card.last4 ?? null } };
    } catch (e) {
      throw this.asApiError(e, 'The card was declined.');
    }
  }

  private async planVariation(kind: SubscriptionKind, tier: string, seats: number, cents: number, name: string): Promise<string> {
    const key = `${kind}:${tier}:${seats}:${cents}`;
    const cached = await this.db.one<{ variation_id: string }>('SELECT variation_id FROM square_catalog WHERE key = $1', [key]);
    if (cached) return cached.variation_id;
    const made = await this.square.createPlanVariation(productName(kind), `${name} ($${(cents / 100).toFixed(2)}/mo)`, cents);
    await this.db.query('INSERT INTO square_catalog(key, plan_id, variation_id) VALUES ($1, $2, $3) ON CONFLICT (key) DO NOTHING', [key, made.planId, made.variationId]);
    return made.variationId;
  }

  // Square status -> the statuses the entitlement code already understands.
  private mapStatus(s: SquareSubscription): string {
    if (s.status === 'ACTIVE') return 'active';
    if (s.status === 'PENDING') return 'trialing';
    if (s.status === 'DEACTIVATED') return 'past_due';
    if (s.status === 'PAUSED') return 'paused';
    return 'canceled';
  }

  private async syncSubscription(kind: SubscriptionKind, s: SquareSubscription, meta?: { userId: string; tier: string; seats: number; companyName?: string; customerId: string; cardId: string }) {
    const table = TABLE[kind];
    const status = this.mapStatus(s);
    const periodEnd = s.charged_through_date ? `${s.charged_through_date}T23:59:59Z` : null;
    if (meta) {
      const row = await this.db.one<{ id: string }>(
        `INSERT INTO ${table}(owner_user_id, tier, status, seats, company_name, provider, square_customer_id, square_subscription_id, card_id, current_period_end, canceled_date)
         VALUES ($1, $2, $3, $4, $5, 'square', $6, $7, $8, $9, $10)
         ON CONFLICT (square_subscription_id) DO UPDATE SET status = EXCLUDED.status, card_id = EXCLUDED.card_id, current_period_end = EXCLUDED.current_period_end,
           canceled_date = EXCLUDED.canceled_date, updated_date = now()
         RETURNING id`,
        [meta.userId, meta.tier, status, meta.seats, meta.companyName || null, meta.customerId, s.id, meta.cardId, periodEnd, s.canceled_date || null]);
      const tier = tierOf(kind, meta.tier);
      if (tier.perSeat && row) {
        const owner = await this.db.one<{ email: string }>('SELECT email FROM users WHERE id = $1', [meta.userId]);
        if (owner) await this.db.query(`INSERT INTO ${SEATS[kind]}(subscription_id, email, user_id, role) VALUES ($1, $2, $3, 'owner') ON CONFLICT (subscription_id, email) DO NOTHING`, [row.id, owner.email.toLowerCase(), meta.userId]);
      }
    } else {
      await this.db.query(`UPDATE ${table} SET status = $2, current_period_end = $3, canceled_date = $4, card_id = COALESCE($5, card_id), updated_date = now() WHERE square_subscription_id = $1`,
        [s.id, status, periodEnd, s.canceled_date || null, s.card_id || null]);
    }
    this.log.log(`${kind} subscription ${s.id}: ${status}${s.canceled_date ? ` (ends ${s.canceled_date})` : ''}`);
  }

  async cancel(user: AuthUser, kind: SubscriptionKind) {
    this.requireSquare();
    if (!TABLE[kind]) throw badRequest('Unknown plan type.');
    const row = await this.db.one<{ square_subscription_id: string | null; provider: string }>(
      `SELECT square_subscription_id, provider FROM ${TABLE[kind]} WHERE owner_user_id = $1 AND status = ANY($2) ORDER BY created_date DESC LIMIT 1`, [user.id, ACTIVE]);
    if (!row) throw badRequest('No plan to cancel.');
    if (row.provider !== 'square' || !row.square_subscription_id) throw new ApiError(409, 'This plan was set up with our previous payment provider. WhatsApp us at (281) 826-4068 and we will cancel it for you.', { code: 'LEGACY_PLAN' });
    const s = await this.square.cancelSubscription(row.square_subscription_id);
    await this.syncSubscription(kind, s);
    return { status: this.mapStatus(s), endsOn: s.canceled_date ?? s.charged_through_date ?? null };
  }

  async updateCard(user: AuthUser, kind: SubscriptionKind, body: any) {
    this.requireSquare();
    const sourceId = str(body?.source_id, 500);
    if (!sourceId) throw badRequest('Missing card token.');
    const row = await this.db.one<{ square_subscription_id: string | null; square_customer_id: string | null; provider: string }>(
      `SELECT square_subscription_id, square_customer_id, provider FROM ${TABLE[kind]} WHERE owner_user_id = $1 AND status = ANY($2) ORDER BY created_date DESC LIMIT 1`, [user.id, ACTIVE]);
    if (!row?.square_subscription_id || !row.square_customer_id) throw badRequest('No Square plan to update.');
    try {
      const card = await this.square.createCard(sourceId, row.square_customer_id, str(body?.verification_token, 500) || undefined);
      const s = await this.square.updateSubscriptionCard(row.square_subscription_id, card.id);
      await this.syncSubscription(kind, { ...s, card_id: card.id });
      return { card: { brand: card.brand ?? null, last4: card.last4 ?? null } };
    } catch (e) { throw this.asApiError(e, 'The card was declined.'); }
  }

  // Admin: send a Square invoice by email for one of our saved invoices.
  async sendInvoice(invoiceId: string) {
    this.requireSquare();
    const invoice = await this.entities.findTrusted('Invoice', invoiceId);
    if (!invoice) throw badRequest('Invoice not found.');
    if (!isEmail(invoice.client_email)) throw badRequest('The invoice needs the client’s email address first.');
    const customerId = await this.square.findOrCreateCustomer(invoice.client_email, invoice.client_name);
    const lines = (invoice.line_items as Array<{ description: string; qty: number; price: number }>).map(l => ({ name: l.description, qty: l.qty, cents: Math.round(l.price * 100) }));
    if (Number(invoice.tax) > 0) lines.push({ name: `Sales tax (${invoice.tax_rate}%)`, qty: 1, cents: Math.round(Number(invoice.tax) * 100) });
    const due = invoice.due_date || new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10);
    const sq = await this.square.createAndSendInvoice({ customerId, number: invoice.number, title: `${invoice.service || 'Invoice'} from Vivid Engine Solutions`,
      description: receiptFooter(), dueDate: due, lines, allowAfterpay: true });
    await this.entities.patch('Invoice', invoiceId, { square_invoice_id: sq.id, square_invoice_url: sq.public_url || '', status: 'sent' });
    return { id: sq.id, url: sq.public_url ?? null };
  }

  // ---------- webhook ----------

  async webhook(rawBody: Buffer | undefined, signature: string | undefined) {
    if (!rawBody) throw badRequest('Missing body.');
    const url = `${config.PUBLIC_ORIGIN}/api/webhooks/square`;
    if (!verifyWebhookSignature(rawBody, signature, url)) throw forbidden('Invalid webhook signature.');
    const event = JSON.parse(rawBody.toString('utf8')) as { event_id?: string; type?: string; data?: { type?: string; id?: string; object?: any } };
    if (!event.event_id || !event.type) throw badRequest('Malformed event.');
    const fresh = await this.db.query('INSERT INTO webhook_events(provider, event_id, type) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING event_id', ['square', event.event_id, event.type]);
    if (!fresh.length) return { received: true, duplicate: true };
    const obj = event.data?.object ?? {};
    try {
      if (event.type.startsWith('subscription.')) {
        const s = obj.subscription as SquareSubscription | undefined;
        if (s && s.location_id === this.square.locationId) {
          for (const kind of Object.keys(TABLE) as SubscriptionKind[]) {
            const known = await this.db.one(`SELECT 1 FROM ${TABLE[kind]} WHERE square_subscription_id = $1`, [s.id]);
            if (known) await this.syncSubscription(kind, s);
          }
        }
      } else if (event.type === 'payment.updated' || event.type === 'payment.created') {
        const p = obj.payment as SquarePayment | undefined;
        if (p && p.location_id === this.square.locationId) {
          await this.db.query('UPDATE payments SET status = $2, receipt_url = COALESCE($3, receipt_url), updated_date = now() WHERE external_id = $1', [p.id, p.status, p.receipt_url || null]);
          const row = await this.db.one<{ kind: string; reference: string }>('SELECT kind, reference FROM payments WHERE external_id = $1', [p.id]);
          if (row?.kind === 'invoice' && p.status === 'COMPLETED') await this.markInvoicePaid(row.reference, p.id);
        }
      } else if (event.type === 'invoice.payment_made' || event.type === 'invoice.updated') {
        const inv = obj.invoice as { id: string; status?: string; location_id?: string } | undefined;
        if (inv && inv.location_id === this.square.locationId && inv.status === 'PAID') {
          const rows = await this.entities.filterTrusted('Invoice', { square_invoice_id: inv.id }, '-created_date', 5);
          for (const r of rows) if (r.status !== 'paid') await this.markInvoicePaid(r.id, inv.id);
        }
      }
    } catch (e) {
      // Remove the dedupe row so Square's retry can try again.
      await this.db.query('DELETE FROM webhook_events WHERE provider = $1 AND event_id = $2', ['square', event.event_id]).catch(() => {});
      throw e;
    }
    return { received: true };
  }

  private asApiError(e: unknown, fallback: string) {
    if (e instanceof ApiError) return e;
    if (e instanceof SquareError) {
      if (e.status === 503) return new ApiError(503, 'Payments are not switched on yet.', { code: 'NOT_CONFIGURED' });
      if (e.code === 'WRONG_LOCATION') return new ApiError(403, 'This payment is not for our business location.', { code: 'WRONG_LOCATION' });
      this.log.warn(`Square ${e.status} ${e.code ?? ''}: ${e.message}`);
      return new ApiError(402, e.status >= 500 ? 'Square is busy right now. Please try again in a minute.' : `${fallback} ${e.message}`.trim(), { code: e.code ?? 'PAYMENT_FAILED' });
    }
    this.log.error((e as Error).stack ?? String(e));
    return new ApiError(500, 'Something went wrong on our side. Please try again.');
  }
}
