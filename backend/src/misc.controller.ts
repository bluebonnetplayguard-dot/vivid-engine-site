import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AuthUser, CurrentUser, Public } from './auth/guard';
import { Db } from './db';

@Controller()
export class MiscController {
  constructor(private readonly db: Db) {}

  // Used by Docker and the uptime monitor.
  @Public()
  @Get('health')
  async health() {
    await this.db.query('SELECT 1');
    return { ok: true };
  }

  // Replaces base44.analytics.track. First-party only; no third-party trackers.
  @Public()
  @Post('analytics/track')
  @HttpCode(204)
  async track(@Body() body: { eventName?: string; properties?: Record<string, unknown> }, @CurrentUser() user: AuthUser | null) {
    const name = String(body?.eventName ?? '').slice(0, 80);
    if (!/^[a-z0-9_.:-]+$/i.test(name)) return;
    const props = JSON.stringify(body?.properties ?? {});
    if (props.length > 2000) return;
    await this.db.query('INSERT INTO analytics_events(event_name, properties, user_id) VALUES ($1, $2, $3)', [name, props, user?.id ?? null]);
  }
}
