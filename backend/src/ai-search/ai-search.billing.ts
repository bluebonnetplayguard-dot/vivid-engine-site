import { Injectable } from '@nestjs/common';
import { AuthUser } from '../auth/guard';
import { config } from '../config';
import { Db } from '../db';
import { badRequest } from '../errors';
import { PaymentsService } from '../payments/payments.service';
import { PAID_TIER_IDS } from './plans';

// AI Search plans are paid through Square (see payments/). These routes stay so older site builds keep working:
// checkout() points the browser at the in-site checkout page, portal() at the account page.
@Injectable()
export class AiSearchBilling {
  constructor(private readonly db: Db, private readonly payments: PaymentsService) {}

  async checkout(_user: AuthUser, body: any) {
    const tier = String(body?.tier ?? '');
    if (!PAID_TIER_IDS.includes(tier as any)) throw badRequest('Choose a paid plan.');
    const q = new URLSearchParams({ kind: 'ai_search', tier });
    if (body?.seats) q.set('seats', String(Math.floor(Number(body.seats))));
    if (body?.company_name) q.set('company', String(body.company_name).slice(0, 120));
    return { url: `${config.PUBLIC_ORIGIN}/checkout?${q}` };
  }

  async portal(_user: AuthUser) { return { url: `${config.PUBLIC_ORIGIN}/ai-search/account` }; }

  cancel(user: AuthUser) { return this.payments.cancel(user, 'ai_search'); }
}
