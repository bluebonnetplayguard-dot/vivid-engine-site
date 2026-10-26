import { Body, Controller, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthUser, CurrentUser } from '../auth/guard';
import { TakeoffService } from './takeoff.service';

// /api/projects/:id/takeoffs. :id is a 3D Studio project; every route checks the signed-in owner.
@Controller('projects')
export class TakeoffController {
  constructor(private readonly takeoffs: TakeoffService) {}

  // Body: { designId, version?, settings?, force? } → 202 with the queued (or cached, already done) run.
  @Post(':id/takeoffs') @HttpCode(202) @Throttle({ default: { limit: 20, ttl: 60_000 } })
  start(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: any) { return this.takeoffs.start(user, id, body); }

  @Get(':id/takeoffs')
  list(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('designId') designId?: string) { return this.takeoffs.list(user, id, designId); }

  @Get(':id/takeoffs/:takeoffId')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('takeoffId') takeoffId: string) { return this.takeoffs.get(user, id, takeoffId); }

  // Server-sent events: { status, progress, stage, error } until the run is done or failed (or 2 minutes pass).
  @Get(':id/takeoffs/:takeoffId/events')
  async events(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('takeoffId') takeoffId: string, @Res() res: Response) {
    let row = await this.takeoffs.status(user, id, takeoffId);
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    let closed = false;
    res.on('close', () => { closed = true; });
    const send = (r: typeof row) => res.write(`event: progress\ndata: ${JSON.stringify(r)}\n\n`);
    send(row);
    const until = Date.now() + 120_000;
    let last = JSON.stringify(row);
    while (!closed && row.status !== 'done' && row.status !== 'failed' && Date.now() < until) {
      await new Promise(r => setTimeout(r, 400));
      row = await this.takeoffs.status(user, id, takeoffId).catch(() => row);
      const now = JSON.stringify(row);
      if (now !== last) { send(row); last = now; }
    }
    if (!closed) { res.write('event: end\ndata: {}\n\n'); res.end(); }
  }
}
