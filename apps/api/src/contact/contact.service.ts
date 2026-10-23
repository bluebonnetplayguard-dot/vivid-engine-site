import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { ContactDto } from './contact.dto';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);
  private readonly transport: Transporter | null;

  constructor() {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
    this.transport = SMTP_HOST
      ? createTransport({
          host: SMTP_HOST,
          port: Number(SMTP_PORT ?? 587),
          secure: Number(SMTP_PORT) === 465,
          auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
        })
      : null;
  }

  async submit(dto: ContactDto): Promise<void> {
    if (dto.company) {
      this.logger.warn('Dropped contact submission that filled the honeypot field');
      return;
    }

    const text = [
      `Name: ${dto.name}`,
      `Email: ${dto.email}`,
      `Phone: ${dto.phone || '-'}`,
      `Website: ${dto.website || '-'}`,
      `Service: ${dto.service || 'Not sure yet'}`,
      '',
      dto.message,
    ].join('\n');

    const to = process.env.CONTACT_TO;
    if (!this.transport || !to) {
      this.logger.log(`New contact submission (email not configured):\n${text}`);
      return;
    }

    await this.transport.sendMail({
      to,
      from: process.env.CONTACT_FROM || to,
      replyTo: dto.email,
      subject: `New website inquiry from ${dto.name}`,
      text,
    });
  }
}
