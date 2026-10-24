import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import { config } from './config';

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Sends mail through any SMTP provider (Postmark, Resend, Amazon SES, Google Workspace).
// Returns false instead of throwing so callers can report "saved, email pending".
@Injectable()
export class Mail {
  private readonly log = new Logger('Mail');
  private readonly transport: Transporter | null = config.SMTP_HOST
    ? nodemailer.createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        secure: config.SMTP_PORT === 465,
        auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
      })
    : null;

  async send(to: string, subject: string, text: string): Promise<boolean> {
    if (!this.transport) {
      this.log.warn(`SMTP not configured; email to ${to} ("${subject}") not sent`);
      return false;
    }
    try {
      const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#111">${escapeHtml(text).replace(/\n/g, '<br>')}</div>`;
      await this.transport.sendMail({ from: config.MAIL_FROM, to, subject, text, html });
      return true;
    } catch (e) {
      this.log.error(`Email to ${to} failed: ${(e as Error).message}`);
      return false;
    }
  }

  notifyStaff(subject: string, text: string) {
    return this.send(config.STAFF_NOTIFY_EMAIL, subject, text);
  }
}
