import { Injectable, Logger } from '@nestjs/common';
import { config } from './config';
import { Db } from './db';
import { EntitiesService } from './entities/entities.service';
import { Mail } from './mail';
import { RateLimiter, ownerSmsLimits } from './rate-limit';
import { normalizeUsPhone } from './shared/guards';

export type NotifyType = 'new_inquiry' | 'consultation_request' | 'support_request' | 'urgent_issue' | 'callback_request';

// Owner notifications (ported from base44/shared/_shared.ts and notifyOwner.ts):
//  - email to every admin account (falls back to STAFF_NOTIFY_EMAIL)
//  - text to OWNER_PHONE via Twilio, deduplicated and logged in SmsLog,
//    respecting the on/off switches in NotificationSetting
// Neither ever throws: saving a lead must not fail because a notification did.
@Injectable()
export class Notifier {
  private readonly log = new Logger('Notify');

  constructor(private readonly db: Db, private readonly mail: Mail, private readonly entities: EntitiesService, private readonly limiter: RateLimiter) {}

  async adminEmails(): Promise<string[]> {
    const rows = await this.db.query<{ email: string }>(`SELECT email FROM users WHERE role = 'admin' AND email_verified`);
    return rows.length ? rows.map(r => r.email) : [config.STAFF_NOTIFY_EMAIL];
  }

  async emailAdmins(subject: string, body: string): Promise<number> {
    let sent = 0;
    for (const to of await this.adminEmails()) if (await this.mail.send(to, subject, body)) sent++;
    return sent;
  }

  private async enabled(type: string) {
    const [row] = await this.entities.filterTrusted('NotificationSetting', { type }, '-created_date', 1);
    return row ? row.enabled !== false : true;
  }

  async textOwner(opts: { type: NotifyType; dedupeKey: string; fields: Record<string, string | undefined> }): Promise<'sent' | 'skipped' | 'failed' | 'duplicate'> {
    const f = opts.fields;
    const body = [
      `NEW ${opts.type.replace(/_/g, ' ').toUpperCase()}`,
      f.customer ? `From: ${f.customer}${f.business ? ` (${f.business})` : ''}` : '',
      f.interest ? `Interest: ${f.interest}` : '',
      f.phone ? `Phone: ${f.phone}` : '',
      f.email ? `Email: ${f.email}` : '',
      f.location ? `Location: ${f.location}` : '',
      f.preferredContact ? `Preferred: ${f.preferredContact}` : '',
      f.message ? `Msg: ${f.message}` : '',
    ].filter(Boolean).join(' | ').slice(0, 1600);
    const record = (status: string, extra: Record<string, unknown> = {}) =>
      this.entities.insert('SmsLog', { dedupeKey: opts.dedupeKey, type: opts.type, status, body, ...extra }, null);

    try {
      const [existing] = await this.entities.filterTrusted('SmsLog', { dedupeKey: opts.dedupeKey, status: 'sent' }, '-created_date', 1);
      if (existing) return 'duplicate';
      if (!(await this.enabled(opts.type))) { await record('skipped', { error: 'notification disabled' }); return 'skipped'; }

      const sid = config.TWILIO_ACCOUNT_SID, token = config.TWILIO_AUTH_TOKEN;
      const from = normalizeUsPhone(config.TWILIO_FROM_NUMBER || ''), to = normalizeUsPhone(config.OWNER_PHONE || '');
      if (!sid || !token || !from || !to) { await record('skipped', { error: 'Twilio not configured' }); return 'skipped'; }
      if (await this.limiter.check(ownerSmsLimits())) { await record('skipped', { error: 'Owner SMS notification limit reached' }); return 'skipped'; }

      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ From: from, To: to, Body: body }),
        signal: AbortSignal.timeout(10_000),
      });
      const data: any = await res.json().catch(() => ({}));
      if (!res.ok) { await record('failed', { error: data?.message || `HTTP ${res.status}`, attempts: 1 }); return 'failed'; }
      await record('sent', { providerId: data?.sid || '', attempts: 1 });
      return 'sent';
    } catch (e) {
      this.log.error(`SMS failed: ${(e as Error).message}`);
      await record('failed', { error: 'SMS could not be confirmed; check Twilio before retrying' }).catch(() => {});
      return 'failed';
    }
  }
}
