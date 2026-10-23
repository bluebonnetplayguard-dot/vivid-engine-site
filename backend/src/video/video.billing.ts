import { Injectable } from '@nestjs/common';
import { AuthUser } from '../auth/guard';
import { config } from '../config';
import { Db } from '../db';
import { badRequest } from '../errors';
import { PaymentsService } from '../payments/payments.service';
import { VIDEO_PAID_TIER_IDS } from './video-plans';

// Video Studio plans are paid through Square (see payments/). checkout() and portal() keep their old shape.
@Injectable()
export class VideoBilling {
  constructor(private readonly db: Db, private readonly payments: PaymentsService) {}

  async checkout(_user: AuthUser, body: any) {
    const tier = String(body?.tier ?? '');
    if (!VIDEO_PAID_TIER_IDS.includes(tier as any)) throw badRequest('Choose a paid plan.');
    const q = new URLSearchParams({ kind: 'video_studio', tier });
    if (body?.seats) q.set('seats', String(Math.floor(Number(body.seats))));
    if (body?.company_name) q.set('company', String(body.company_name).slice(0, 120));
    return { url: `${config.PUBLIC_ORIGIN}/checkout?${q}` };
  }

  async portal(_user: AuthUser) { return { url: `${config.PUBLIC_ORIGIN}/video/account` }; }

  cancel(user: AuthUser) { return this.payments.cancel(user, 'video_studio'); }
}
