import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { AuthUser } from '../auth/guard';
import { config } from '../config';
import { EntitiesService } from '../entities/entities.service';
import { ApiError, badRequest } from '../errors';
import { isEmail, str } from '../shared/guards';
import { CARD_FEE_RATE, CatalogItem, catalogItems } from '../shared/pricing';
import { AiSearchBilling } from '../ai-search/ai-search.billing';
import { VideoBilling } from '../video/video.billing';

const PRICE_KEYS = ['amount', 'total', 'price', 'unit_amount', 'line_items', 'subtotal'];

// Ported from base44/functions/createInvoice, createCheckout and shared/checkoutPricing + stripeCheckout.
// Added: a Stripe webhook that marks the invoice paid once Checkout completes.
@Injectable()
export class Billing {
  private readonly log = new Logger('Billing');
  readonly stripe = config.STRIPE_SECRET_KEY ? new Stripe(config.STRIPE_SECRET_KEY) : null;

  constructor(private readonly entities: EntitiesService, private readonly aiSearch: AiSearchBilling, private readonly video: VideoBilling) {}

  async createInvoice(user: AuthUser, body: any) {
    if (!str(body.client_name, 100)) throw badRequest('Client name is required.');
    if (body.client_email && !isEmail(body.client_email)) throw badRequest('Enter a valid email.');
    const plan_id = body.plan_id || 'manual';
    let line_items: { description: string; qty: number; price: number }[];
    try {
      if (plan_id !== 'manual') {
        line_items = catalogItems(body).map(item => ({ description: `${item.name}${item.interval ? ` /${item.interval}` : ' one-time'}`, qty: 1, price: item.cents / 100 }));
      } else {
        if (!Array.isArray(body.line_items) || !body.line_items.length || body.line_items.length > 30) throw new Error('Add approved quote line items.');
        line_items = body.line_items.map((item: any) => {
          const price = Number(item?.price), qty = Number(item?.qty);
          if (!str(item?.description, 200) || !Number.isFinite(price) || price < 0 || price > 1_000_000 || !Number.isFinite(qty) || qty <= 0 || qty > 1000) throw new Error('Invalid approved quote line item.');
          return { description: str(item.description, 200), qty, price: Math.round(price * 100) / 100 };
        });
      }
    } catch (e) {
      throw badRequest((e as Error).message);
    }
    const tax_rate = Number(body.tax_rate ?? 8.25);
    if (!Number.isFinite(tax_rate) || tax_rate < 0 || tax_rate > 25) throw badRequest('Invalid tax rate.');
    const subtotal = Math.round(line_items.reduce((sum, item) => sum + item.price * item.qty, 0) * 100) / 100;
    const tax = Math.round(subtotal * tax_rate) / 100;
    const invoice = await this.entities.insert('Invoice', {
      client_name: str(body.client_name, 100), client_email: body.client_email || '',
      number: `INV-${Date.now().toString(36).toUpperCase()}`, service: str(body.service, 200),
      plan_id, billing_cycle: body.billing_cycle || 'monthly', add_on_ids: plan_id === 'manual' ? [] : body.add_on_ids || [],
      line_items, subtotal, tax_rate, tax, total: Math.round((subtotal + tax) * 100) / 100, status: 'sent',
      ...(body.due_date ? { due_date: str(body.due_date, 10) } : {}), notes: str(body.notes, 2000),
    }, user.id);
    return { invoice };
  }

  async checkoutPricing(body: any) {
    if (PRICE_KEYS.some(key => Object.prototype.hasOwnProperty.call(body, key))) throw new Error('Send a plan selection or saved invoice ID, never a browser amount.');
    let invoice: Record<string, any> | null = null;
    if (body.invoice_id) {
      if (typeof body.invoice_id !== 'string' || body.invoice_id.length > 80) throw new Error('Invalid invoice.');
      invoice = await this.entities.findTrusted('Invoice', body.invoice_id);
      if (!invoice || !['sent', 'overdue'].includes(invoice.status)) throw new Error('Only an approved, unpaid invoice can be charged.');
    }
    const selection = invoice || body;
    const isCatalog = !!selection.plan_id && selection.plan_id !== 'manual';
    let items: CatalogItem[];
    if (isCatalog) items = catalogItems(selection);
    else {
      if (!invoice) throw new Error('Manual prices require a saved, approved invoice.');
      const cents = Math.round(Number(invoice.total) * 100);
      if (!Number.isSafeInteger(cents) || cents < 50 || cents > 100_000_000) throw new Error('Invalid saved invoice total.');
      items = [{ id: 'invoice', name: `Invoice ${invoice.number || invoice.id} - ${invoice.service || 'Approved service'}`, cents, interval: null }];
    }
    const mode: 'subscription' | 'payment' = items.some(item => item.interval) ? 'subscription' : 'payment';
    const fees: CatalogItem[] = (['month', 'year', null] as const).flatMap(interval => {
      const cents = Math.round(items.filter(item => item.interval === interval).reduce((sum, item) => sum + item.cents, 0) * CARD_FEE_RATE);
      return cents ? [{ id: 'card-fee', name: 'Card processing fee (3.5%)', cents, interval }] : [];
    });
    return {
      mode, items: [...items, ...fees], automaticTax: isCatalog, invoice_id: invoice?.id || '',
      plan_id: selection.plan_id || 'manual', billing_cycle: selection.billing_cycle || 'monthly', add_on_ids: selection.add_on_ids || [],
      client_name: invoice?.client_name || body.client_name || '', client_email: invoice?.client_email || body.client_email || '',
    };
  }

  async createCheckout(_user: AuthUser, body: any) {
    let pricing: Awaited<ReturnType<Billing['checkoutPricing']>>;
    try {
      pricing = await this.checkoutPricing(body);
    } catch (e) {
      throw badRequest((e as Error).message);
    }
    if (body.preview_only === true) return { pricing };
    if (!this.stripe) throw new ApiError(503, 'Checkout is not configured.');
    if (pricing.client_email && !isEmail(pricing.client_email)) throw badRequest('Enter a valid client email.');

    const metadata: Record<string, string> = {
      plan_id: String(pricing.plan_id), billing_cycle: String(pricing.billing_cycle),
      add_on_ids: (pricing.add_on_ids as string[]).join(','), client_name: str(pricing.client_name, 100),
      ...(pricing.invoice_id ? { invoice_id: pricing.invoice_id } : {}),
    };
    const session = await this.stripe.checkout.sessions.create({
      mode: pricing.mode,
      payment_method_types: ['card'],
      metadata,
      success_url: `${config.PUBLIC_ORIGIN}/admin/pos?status=success`,
      cancel_url: `${config.PUBLIC_ORIGIN}/admin/pos?status=cancel`,
      ...(pricing.client_email ? { customer_email: pricing.client_email } : {}),
      ...(pricing.automaticTax ? { automatic_tax: { enabled: true }, billing_address_collection: 'required' as const } : {}),
      ...(pricing.mode === 'subscription'
        ? { subscription_data: { metadata: { plan_id: metadata.plan_id, billing_cycle: metadata.billing_cycle, invoice_id: pricing.invoice_id } } }
        : { payment_intent_data: { metadata } }),
      line_items: pricing.items.map(item => ({
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: item.cents,
          product_data: { name: item.name },
          ...(pricing.automaticTax ? { tax_behavior: 'exclusive' as const } : {}),
          ...(item.interval ? { recurring: { interval: item.interval } } : {}),
        },
      })),
    });
    return { id: session.id, url: session.url };
  }

  async handleWebhook(rawBody: Buffer, signature: string) {
    if (!this.stripe || !config.STRIPE_WEBHOOK_SECRET) throw badRequest('Webhooks are not configured.');
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, config.STRIPE_WEBHOOK_SECRET);
    } catch {
      throw badRequest('Invalid webhook signature.');
    }
    // AI Search and Video Studio subscriptions; a failure throws so Stripe retries the event.
    if (await this.aiSearch.handleEvent(event)) return { received: true };
    if (await this.video.handleEvent(event)) return { received: true };
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object as Stripe.Checkout.Session;
      const invoiceId = session.metadata?.invoice_id;
      if (invoiceId && session.payment_status !== 'unpaid') {
        await this.entities.patch('Invoice', invoiceId, { status: 'paid', paid_date: new Date().toISOString().slice(0, 10) })
          .catch(e => this.log.error(`Could not mark invoice ${invoiceId} paid: ${(e as Error).message}`));
      }
    }
    return { received: true };
  }
}
