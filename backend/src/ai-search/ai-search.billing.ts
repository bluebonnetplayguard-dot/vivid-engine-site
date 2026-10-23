import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { AuthUser } from '../auth/guard';
import { config } from '../config';
import { Db } from '../db';
import { ApiError, badRequest } from '../errors';
import { str } from '../shared/guards';
import { PAID_TIER_IDS, tierById } from './plans';

// Stripe subscriptions for Vivid AI Search. Prices come only from plans.ts, never from the browser.
// Webhook events (sent to the existing /api/webhooks/stripe endpoint) keep ai_subscriptions in sync:
//   checkout.session.completed, customer.subscription.updated, customer.subscription.deleted
@Injectable()
export class AiSearchBilling {
  private readonly log = new Logger('AiSearchBilling');
  private readonly stripe = config.STRIPE_SECRET_KEY ? new Stripe(config.STRIPE_SECRET_KEY) : null;

  constructor(private readonly db: Db) {}

  async checkout(user: AuthUser, body: any) {
    if (!this.stripe) throw new ApiError(503, 'Checkout is not configured yet.');
    const tierId = String(body?.tier ?? '');
    if (!PAID_TIER_IDS.includes(tierId as any)) throw badRequest('Choose a paid plan.');
    const tier = tierById(tierId);
    const seats = tier.perSeat ? Math.floor(Number(body?.seats)) : 1;
    if (tier.perSeat && (!Number.isFinite(seats) || seats < tier.minSeats || seats > 500)) throw badRequest(`Choose between ${tier.minSeats} and 500 seats.`);
    const company = tier.perSeat ? str(body?.company_name, 120) : '';
    if (tier.perSeat && !company) throw badRequest('Enter your company name.');

    const current = await this.db.one(`SELECT id FROM ai_subscriptions WHERE owner_user_id = $1 AND status = ANY($2) LIMIT 1`, [user.id, ['active', 'trialing', 'past_due']]);
    if (current) throw new ApiError(409, 'You already have a plan. Use Manage billing to change or cancel it.', { code: 'HAS_PLAN' });

    const metadata = { kind: 'ai_search', user_id: user.id, tier: tier.id, company_name: company };
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: user.email,
      client_reference_id: user.id,
      allow_promotion_codes: true,
      metadata,
      subscription_data: { metadata },
      line_items: [{
        quantity: seats,
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(tier.priceMonthly * 100),
          recurring: { interval: 'month' },
          product_data: { name: `Vivid AI Search ${tier.name}${tier.perSeat ? ' (per seat)' : ''}` },
          ...(config.STRIPE_AUTOMATIC_TAX === 'true' ? { tax_behavior: 'exclusive' as const } : {}),
        },
      }],
      ...(config.STRIPE_AUTOMATIC_TAX === 'true' ? { automatic_tax: { enabled: true }, billing_address_collection: 'required' as const } : {}),
      success_url: `${config.PUBLIC_ORIGIN}/ai-search/account?checkout=success`,
      cancel_url: `${config.PUBLIC_ORIGIN}/ai-search/pricing?checkout=cancel`,
    });
    return { url: session.url };
  }

  // Stripe's hosted page for changing seats, payment method, or cancelling.
  async portal(user: AuthUser) {
    if (!this.stripe) throw new ApiError(503, 'Billing is not configured yet.');
    const sub = await this.db.one(`SELECT stripe_customer_id FROM ai_subscriptions WHERE owner_user_id = $1 AND stripe_customer_id IS NOT NULL ORDER BY created_date DESC LIMIT 1`, [user.id]);
    if (!sub) throw badRequest('No AI Search plan to manage yet.');
    const session = await this.stripe.billingPortal.sessions.create({ customer: sub.stripe_customer_id, return_url: `${config.PUBLIC_ORIGIN}/ai-search/account` });
    return { url: session.url };
  }

  // Called by the shared Stripe webhook. Returns true when the event belonged to AI Search.
  async handleEvent(event: Stripe.Event): Promise<boolean> {
    if (!this.stripe) return false;
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.kind !== 'ai_search' || session.mode !== 'subscription' || !session.subscription) return false;
      const subscription = await this.stripe.subscriptions.retrieve(typeof session.subscription === 'string' ? session.subscription : session.subscription.id);
      await this.sync(subscription);
      return true;
    }
    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.created') {
      const subscription = event.data.object as Stripe.Subscription;
      if (subscription.metadata?.kind !== 'ai_search') return false;
      await this.sync(subscription);
      return true;
    }
    return false;
  }

  private async sync(subscription: Stripe.Subscription) {
    const meta = subscription.metadata ?? {};
    const tier = tierById(meta.tier);
    if (tier.id === 'free') { this.log.warn(`Subscription ${subscription.id} has no known tier`); return; }
    const owner = await this.db.one<{ id: string; email: string }>('SELECT id, email FROM users WHERE id = $1', [meta.user_id]);
    if (!owner) { this.log.warn(`Subscription ${subscription.id} references an unknown user`); return; }
    const seats = Math.max(1, Math.min(500, subscription.items.data[0]?.quantity ?? 1));
    const periodEnd = subscription.current_period_end;
    const customer = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
    const row = await this.db.one<{ id: string }>(
      `INSERT INTO ai_subscriptions(owner_user_id, tier, status, seats, company_name, stripe_customer_id, stripe_subscription_id, current_period_end)
       VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8))
       ON CONFLICT (stripe_subscription_id) DO UPDATE SET
         tier = EXCLUDED.tier, status = EXCLUDED.status, seats = EXCLUDED.seats, stripe_customer_id = EXCLUDED.stripe_customer_id,
         current_period_end = EXCLUDED.current_period_end, company_name = COALESCE(ai_subscriptions.company_name, EXCLUDED.company_name), updated_date = now()
       RETURNING id`,
      [owner.id, tier.id, subscription.status, seats, meta.company_name || null, customer, subscription.id, periodEnd ?? null]);
    if (tier.perSeat && row) {
      await this.db.query(
        `INSERT INTO ai_seats(subscription_id, email, user_id, role) VALUES ($1, $2, $3, 'owner') ON CONFLICT (subscription_id, email) DO NOTHING`,
        [row.id, owner.email.toLowerCase(), owner.id]);
    }
    this.log.log(`AI Search subscription ${subscription.id}: ${tier.id} x${seats}, ${subscription.status}`);
  }
}
