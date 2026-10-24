import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { config } from '../config';
import { EntitiesService } from '../entities/entities.service';
import { ApiError, badRequest } from '../errors';
import { Notifier, NotifyType } from '../notify';
import { RateLimiter, inquiryLimits } from '../rate-limit';
import { isEmail, normPhone, str } from '../shared/guards';

const KINDS: Record<string, NotifyType> = {
  inquiry: 'new_inquiry', consultation: 'consultation_request', callback: 'callback_request', support: 'support_request',
};
const HOST = new URL(config.PUBLIC_ORIGIN).host;
const chicago = (d: Date) => d.toLocaleString('en-US', { timeZone: 'America/Chicago' });

// Public contact form, the daily lead summary (was a Base44 workflow) and IndexNow.
@Injectable()
export class OpsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Ops');
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly entities: EntitiesService, private readonly notifier: Notifier, private readonly limiter: RateLimiter) {}

  // PUBLIC. Contact form, callback and consultation REQUESTS (never automatic bookings).
  async submitInquiry(visitorId: string, b: any) {
    if (b.website) return { ok: true }; // honeypot: silently accept bots
    const kind = KINDS[b.kind] ? b.kind : 'inquiry';
    const name = str(b.name, 100);
    const email = str(b.email, 150);
    const phone = normPhone(b.phone);
    const message = str(b.message, 2000);
    if (!name || !(phone || isEmail(email))) throw badRequest('Please include your name and a valid phone or email.');
    await this.limiter.enforce(inquiryLimits(visitorId, isEmail(email) ? email : ''));

    const record = {
      name, email: isEmail(email) ? email : '', phone,
      business: str(b.business, 120), location: str(b.location, 100), interest: str(b.interest, 200), message,
      preferredContact: ['phone', 'email', 'text'].includes(b.preferredContact) ? b.preferredContact : '',
      preferredDate: str(b.preferredDate, 20), preferredTime: str(b.preferredTime, 20),
      consultType: ['in_person', 'phone'].includes(b.consultType) ? b.consultType : '',
      // Consent is recorded exactly as shown to the visitor (required before texting customers).
      smsConsent: b.smsConsent === true, consentText: str(b.consentText, 400),
      source: 'web_form', type: kind, status: 'NEW LEAD',
    };
    try {
      await this.entities.insert('Inquiry', record, null);
    } catch (e) {
      this.log.error(`inquiry save failed: ${(e as Error).message}`);
      throw new ApiError(500, 'Could not save your request. Please try again.');
    }
    const day = new Date().toISOString().slice(0, 10);
    const fields = {
      customer: name, phone, email: record.email, business: record.business, location: record.location,
      interest: record.interest || kind, message,
      preferredContact: [record.preferredContact, record.preferredDate, record.preferredTime, record.consultType].filter(Boolean).join(' / '),
    };
    void this.notifier.textOwner({ type: KINDS[kind], dedupeKey: `form:${kind}:${(record.email || record.phone).toLowerCase()}:${day}`, fields });
    void this.notifier.emailAdmins(`New ${kind} from ${name}`, Object.entries(fields).map(([k, v]) => `${k}: ${v || '-'}`).join('\n') + `\n\n${config.PUBLIC_ORIGIN}/admin/leads`);
    return { ok: true };
  }

  async sendDailyLeadSummary() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const leads = await this.entities.filterTrusted('Inquiry', { source: { $in: ['web_form', 'inquiry_form'] }, created_date: { $gte: since } }, '-created_date', 200);
    const generatedAt = chicago(new Date());
    const body = leads.length === 0
      ? `DAILY LEAD SUMMARY - Vivid Engine Solutions\nGenerated: ${generatedAt}\n\nNo new contact-form leads in the last 24 hours. You're all caught up!\n\nView all leads: ${config.PUBLIC_ORIGIN}/admin/leads`
      : `DAILY LEAD SUMMARY - Vivid Engine Solutions\nGenerated: ${generatedAt}\nNew contact-form leads (last 24h): ${leads.length}\n\n` +
        leads.map((l, i) => `${i + 1}. ${l.name}${l.business ? ` - ${l.business}` : ''}\n   Email: ${l.email || '-'}\n   Phone: ${l.phone || '-'}\n   Interested in: ${l.interest || '-'}\n   Status: ${l.status || 'NEW LEAD'}\n   Submitted: ${chicago(new Date(l.created_date))}`).join('\n\n') +
        `\n\nView all leads: ${config.PUBLIC_ORIGIN}/admin/leads`;
    const recipients = await this.notifier.emailAdmins(`Daily Lead Summary - ${leads.length} new contact-form lead${leads.length === 1 ? '' : 's'}`, body);
    return { sent: true, leads: leads.length, recipients };
  }

  // Runs the summary at 8:00 a.m. Central every day (the old Base44 workflow schedule).
  onModuleInit() {
    this.timer = setInterval(async () => {
      const now = new Date();
      const [hh, mm] = now.toLocaleTimeString('en-GB', { timeZone: 'America/Chicago', hour12: false }).split(':');
      if (hh !== '08' || mm !== '00') return;
      const day = now.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
      if (await this.limiter.check([{ scope: 'daily-lead-summary', id: day, max: 1, windowSec: 86400 }])) return; // already ran today
      this.sendDailyLeadSummary().catch(e => this.log.error(`Daily summary failed: ${(e as Error).message}`));
    }, 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ADMIN. Tells IndexNow engines (Bing, Yandex...) that URLs changed. Speeds discovery; no ranking guarantee.
  async submitIndexNow(body: any) {
    const key = config.INDEXNOW_KEY;
    if (!key) throw new ApiError(500, 'INDEXNOW_KEY not set');
    const urlList = (Array.isArray(body?.urls) ? body.urls : []).map((u: unknown) => String(u))
      .filter((u: string) => u.startsWith(`https://${HOST}/`) || u === `https://${HOST}`).slice(0, 100);
    if (!urlList.length) throw badRequest('No valid urls');
    const res = await fetch('https://api.indexnow.org/IndexNow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: HOST, key, keyLocation: `https://${HOST}/${key}.txt`, urlList }),
    });
    return { status: res.status, submitted: urlList.length };
  }
}
