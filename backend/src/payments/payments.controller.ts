import { Body, Controller, Get, Headers, HttpCode, Param, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AdminOnly, AuthUser, CurrentUser, Public } from '../auth/guard';
import { badRequest } from '../errors';
import { PaymentsService, SubscriptionKind } from './payments.service';

const KINDS = new Set(['ai_search', 'video_studio']);
const kindParam = (k: string): SubscriptionKind => { if (!KINDS.has(k)) throw badRequest('Unknown plan type.'); return k as SubscriptionKind; };

// /api/payments/*: Square Web Payments SDK on the site, charges and plans created here with server-side prices.
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Public() @Get('config')
  config() { return this.payments.publicConfig(); }

  // What a purchase will cost, computed from config (plan ids, invoice ids), never from browser amounts.
  @Public() @Post('quote') @HttpCode(200) @Throttle({ default: { limit: 30, ttl: 60_000 } })
  quote(@CurrentUser() user: AuthUser | null, @Body() body: any) { return this.payments.quote(user, body); }

  // One-time purchases and invoice payments (card, Apple Pay, Google Pay, Cash App Pay, Afterpay).
  @Public() @Post('charge') @HttpCode(200) @Throttle({ default: { limit: 10, ttl: 60_000 } })
  charge(@CurrentUser() user: AuthUser | null, @Body() body: any) { return this.payments.charge(user, body); }

  // Monthly plans: card on file, never Afterpay.
  @Post('subscribe') @HttpCode(200) @Throttle({ default: { limit: 10, ttl: 60_000 } })
  subscribe(@CurrentUser() user: AuthUser, @Body() body: any) { return this.payments.subscribe(user, body); }

  @Post('subscriptions/:kind/cancel') @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('kind') kind: string) { return this.payments.cancel(user, kindParam(kind)); }

  @Post('subscriptions/:kind/card') @HttpCode(200) @Throttle({ default: { limit: 10, ttl: 60_000 } })
  updateCard(@CurrentUser() user: AuthUser, @Param('kind') kind: string, @Body() body: any) { return this.payments.updateCard(user, kindParam(kind), body); }

  // Admin: email a Square invoice (with a pay link) for one of our saved invoices.
  @AdminOnly() @Post('invoices/:id/send') @HttpCode(200)
  sendInvoice(@Param('id') id: string) { return this.payments.sendInvoice(id); }
}

@Controller('webhooks')
export class SquareWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  @Public() @Post('square') @HttpCode(200)
  square(@Req() req: Request & { rawBody?: Buffer }, @Headers('x-square-hmacsha256-signature') signature: string) {
    return this.payments.webhook(req.rawBody, signature);
  }
}
