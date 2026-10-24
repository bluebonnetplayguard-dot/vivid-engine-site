// Square REST client over fetch. No SDK: the API surface we use is small and this keeps the dependency list short.
// Docs: developer.squareup.com/reference/square. Every call is pinned to one API version.
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { config } from '../config';

export const SQUARE_VERSION = '2025-01-23';
const BASE = { sandbox: 'https://connect.squareupsandbox.com', production: 'https://connect.squareup.com' } as const;

export class SquareError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly detail?: unknown) { super(message); }
}

export interface Money { amount: number; currency: 'USD' }
export interface SquarePayment {
  id: string; status: 'APPROVED' | 'PENDING' | 'COMPLETED' | 'CANCELED' | 'FAILED'; location_id: string;
  amount_money: Money; source_type?: string; buyer_email_address?: string; reference_id?: string; note?: string;
  buy_now_pay_later_details?: { brand?: string }; card_details?: { card?: { card_brand?: string; last_4?: string } };
  wallet_details?: { brand?: string }; receipt_url?: string; created_at?: string;
}
export interface SquareSubscription {
  id: string; status: 'PENDING' | 'ACTIVE' | 'CANCELED' | 'DEACTIVATED' | 'PAUSED'; location_id: string; plan_variation_id: string;
  customer_id: string; card_id?: string; start_date?: string; charged_through_date?: string; canceled_date?: string; version?: number;
}
export interface SquareInvoice { id: string; version: number; status: string; location_id: string; order_id: string; invoice_number?: string; public_url?: string; primary_recipient?: { customer_id?: string } }

export const squareConfigured = () => !!(config.SQUARE_ACCESS_TOKEN && config.SQUARE_LOCATION_ID && config.SQUARE_APPLICATION_ID);

export class SquareClient {
  readonly locationId = config.SQUARE_LOCATION_ID || '';
  private readonly base = BASE[config.SQUARE_ENVIRONMENT === 'production' ? 'production' : 'sandbox'];

  async request<T = any>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
    if (!config.SQUARE_ACCESS_TOKEN) throw new SquareError('Square is not configured.', 503, 'NOT_CONFIGURED');
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: { 'Square-Version': SQUARE_VERSION, Authorization: `Bearer ${config.SQUARE_ACCESS_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({})) as any;
    if (!res.ok) {
      const first = data?.errors?.[0];
      throw new SquareError(first?.detail || `Square request failed (${res.status})`, res.status, first?.code, data?.errors);
    }
    return data as T;
  }

  // Refuses anything that did not happen at our location. Every payment and subscription goes through this.
  assertLocation(obj: { location_id?: string } | undefined, what: string) {
    if (!obj || obj.location_id !== this.locationId) throw new SquareError(`${what} is not for this business location.`, 403, 'WRONG_LOCATION');
  }

  // ---- payments ----
  async createPayment(p: { sourceId: string; cents: number; email?: string; note?: string; referenceId?: string; idempotencyKey?: string; verificationToken?: string }): Promise<SquarePayment> {
    const r = await this.request<{ payment: SquarePayment }>('POST', '/v2/payments', {
      idempotency_key: p.idempotencyKey || randomUUID(),
      source_id: p.sourceId,
      amount_money: { amount: p.cents, currency: 'USD' },
      location_id: this.locationId,
      autocomplete: true,
      accept_partial_authorization: false,
      ...(p.email ? { buyer_email_address: p.email } : {}),
      ...(p.note ? { note: p.note.slice(0, 500) } : {}),
      ...(p.referenceId ? { reference_id: p.referenceId.slice(0, 40) } : {}),
      ...(p.verificationToken ? { verification_token: p.verificationToken } : {}),
    });
    this.assertLocation(r.payment, 'This payment');
    return r.payment;
  }
  async getPayment(id: string) { const r = await this.request<{ payment: SquarePayment }>('GET', `/v2/payments/${encodeURIComponent(id)}`); return r.payment; }

  // ---- customers and cards on file ----
  async findOrCreateCustomer(email: string, name?: string, referenceId?: string): Promise<string> {
    const found = await this.request<{ customers?: Array<{ id: string }> }>('POST', '/v2/customers/search', { query: { filter: { email_address: { exact: email } } }, limit: 1 });
    if (found.customers?.[0]) return found.customers[0].id;
    const created = await this.request<{ customer: { id: string } }>('POST', '/v2/customers', {
      idempotency_key: randomUUID(), email_address: email, ...(name ? { given_name: name.slice(0, 100) } : {}), ...(referenceId ? { reference_id: referenceId } : {}),
    });
    return created.customer.id;
  }
  async createCard(sourceId: string, customerId: string, verificationToken?: string): Promise<{ id: string; brand?: string; last4?: string }> {
    const r = await this.request<{ card: { id: string; card_brand?: string; last_4?: string } }>('POST', '/v2/cards', {
      idempotency_key: randomUUID(), source_id: sourceId, card: { customer_id: customerId }, ...(verificationToken ? { verification_token: verificationToken } : {}),
    });
    return { id: r.card.id, brand: r.card.card_brand, last4: r.card.last_4 };
  }

  // ---- catalog: one subscription plan per product, one variation per price ----
  // One plan with one variation. `phases` run in order; the last one repeats until cancelled
  // (for example 25% off the first month, then the full monthly price).
  async createPlanVariation(planName: string, variationName: string, phases: { cadence: 'MONTHLY' | 'ANNUAL' | 'EVERY_TWO_YEARS'; cents: number; periods?: number }[]): Promise<{ planId: string; variationId: string }> {
    const r = await this.request<{ id_mappings?: Array<{ client_object_id: string; object_id: string }> }>('POST', '/v2/catalog/batch-upsert', {
      idempotency_key: randomUUID(),
      batches: [{ objects: [
        { type: 'SUBSCRIPTION_PLAN', id: '#plan', subscription_plan_data: { name: planName, all_items: true } },
        { type: 'SUBSCRIPTION_PLAN_VARIATION', id: '#variation', subscription_plan_variation_data: {
          name: variationName, subscription_plan_id: '#plan',
          phases: phases.map((ph, i) => ({ cadence: ph.cadence, ordinal: i, ...(ph.periods ? { periods: ph.periods } : {}), pricing: { type: 'STATIC', price_money: { amount: ph.cents, currency: 'USD' } } })),
        } },
      ] }],
    });
    const map = Object.fromEntries((r.id_mappings || []).map(m => [m.client_object_id, m.object_id]));
    if (!map['#plan'] || !map['#variation']) throw new SquareError('Square did not return the plan ids.', 502);
    return { planId: map['#plan'], variationId: map['#variation'] };
  }

  // ---- subscriptions ----
  async createSubscription(p: { customerId: string; cardId: string; planVariationId: string; note?: string }): Promise<SquareSubscription> {
    const r = await this.request<{ subscription: SquareSubscription }>('POST', '/v2/subscriptions', {
      idempotency_key: randomUUID(), location_id: this.locationId, plan_variation_id: p.planVariationId,
      customer_id: p.customerId, card_id: p.cardId, source: { name: 'Vivid Engine Solutions' },
    });
    this.assertLocation(r.subscription, 'This subscription');
    return r.subscription;
  }
  async getSubscription(id: string) { const r = await this.request<{ subscription: SquareSubscription }>('GET', `/v2/subscriptions/${encodeURIComponent(id)}`); return r.subscription; }
  // Square cancels at the end of the paid period and reports the date in canceled_date.
  async cancelSubscription(id: string) { const r = await this.request<{ subscription: SquareSubscription }>('POST', `/v2/subscriptions/${encodeURIComponent(id)}/cancel`, {}); return r.subscription; }
  async updateSubscriptionCard(id: string, cardId: string, version?: number) {
    const r = await this.request<{ subscription: SquareSubscription }>('PUT', `/v2/subscriptions/${encodeURIComponent(id)}`, { subscription: { card_id: cardId, ...(version != null ? { version } : {}) } });
    return r.subscription;
  }

  // ---- invoices: Square emails the customer a pay link; the webhook tells us when it's paid ----
  async createAndSendInvoice(p: { customerId: string; number: string; title: string; description?: string; dueDate: string;
    lines: Array<{ name: string; cents: number; qty: number }>; allowAfterpay: boolean }): Promise<SquareInvoice> {
    const order = await this.request<{ order: { id: string } }>('POST', '/v2/orders', {
      idempotency_key: randomUUID(),
      order: { location_id: this.locationId, customer_id: p.customerId, reference_id: p.number.slice(0, 40),
        line_items: p.lines.map(l => ({ name: l.name.slice(0, 500), quantity: String(l.qty), base_price_money: { amount: l.cents, currency: 'USD' } })) },
    });
    const inv = await this.request<{ invoice: SquareInvoice }>('POST', '/v2/invoices', {
      idempotency_key: randomUUID(),
      invoice: {
        location_id: this.locationId, order_id: order.order.id, primary_recipient: { customer_id: p.customerId },
        invoice_number: p.number.slice(0, 191), title: p.title.slice(0, 255), ...(p.description ? { description: p.description.slice(0, 65535) } : {}),
        delivery_method: 'EMAIL',
        payment_requests: [{ request_type: 'BALANCE', due_date: p.dueDate, automatic_payment_source: 'NONE', tipping_enabled: false }],
        accepted_payment_methods: { card: true, square_gift_card: false, bank_account: false, buy_now_pay_later: p.allowAfterpay, cash_app_pay: true },
      },
    });
    const published = await this.request<{ invoice: SquareInvoice }>('POST', `/v2/invoices/${inv.invoice.id}/publish`, { version: inv.invoice.version, idempotency_key: randomUUID() });
    return published.invoice;
  }
  async getInvoice(id: string) { const r = await this.request<{ invoice: SquareInvoice }>('GET', `/v2/invoices/${encodeURIComponent(id)}`); return r.invoice; }
}

// Webhook signature: base64(HMAC-SHA256(notification_url + raw body, signature key)) in x-square-hmacsha256-signature.
export function verifyWebhookSignature(rawBody: Buffer | string, signature: string | undefined, notificationUrl: string): boolean {
  const key = config.SQUARE_WEBHOOK_SIGNATURE_KEY;
  if (!key || !signature) return false;
  const expected = createHmac('sha256', key).update(notificationUrl + (typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'))).digest();
  let given: Buffer;
  try { given = Buffer.from(signature, 'base64'); } catch { return false; }
  return given.length === expected.length && timingSafeEqual(given, expected);
}
