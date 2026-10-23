import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ContactDto } from './contact.dto';
import { ContactService } from './contact.service';

@Controller('contact')
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  @Post()
  @HttpCode(202)
  @Throttle({ default: { ttl: 60 * 60_000, limit: 5 } })
  async create(@Body() dto: ContactDto) {
    await this.contact.submit(dto);
    return { ok: true };
  }
}
