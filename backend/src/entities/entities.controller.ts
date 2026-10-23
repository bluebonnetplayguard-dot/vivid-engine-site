import { Body, Controller, Delete, Get, MessageEvent, Param, Patch, Post, Query, Req, Sse } from '@nestjs/common';
import type { Request } from 'express';
import { Observable, filter, from, interval, map, merge, mergeMap } from 'rxjs';
import { AuthUser, CurrentUser, Public } from '../auth/guard';
import { badRequest } from '../errors';
import { RateLimiter } from '../rate-limit';
import { EntitiesService } from './entities.service';
import { Realtime } from './realtime';

function parseJson(raw: unknown) {
  if (raw == null || raw === '') return {};
  try {
    return JSON.parse(String(raw));
  } catch {
    throw badRequest('Filter must be valid JSON.');
  }
}

// REST surface that mirrors the old base44.entities.<Name> methods. Access is
// decided per collection by its schema's rules (see definitions.ts), so these
// routes are open to visitors and the rules decide (e.g. Testimonial and
// PortfolioItem are publicly readable, ContactSubmission publicly creatable).
//   GET    /api/entities/:name?q=&sort=&limit=&skip=          -> array
//   GET    /api/entities/:name?q=&sort=&limit=&cursor=&page=1 -> { items, has_more, next_cursor }
//   GET    /api/entities/:name/:id
//   POST   /api/entities/:name
//   PATCH  /api/entities/:name/:id
//   DELETE /api/entities/:name/:id
//   POST   /api/entities/:name/aggregate { query, groupBy }
//   GET    /api/events   (server-sent events for live updates; signed-in users)
@Controller()
export class EntitiesController {
  constructor(
    private readonly entities: EntitiesService,
    private readonly realtime: Realtime,
    private readonly limiter: RateLimiter,
  ) {}

  @Sse('events')
  events(@CurrentUser() user: AuthUser): Observable<MessageEvent> {
    const changes = this.realtime.changes.pipe(
      mergeMap(event => from(this.entities.canSee(user, event.entity, event.data, event.createdBy ?? null)).pipe(
        filter(Boolean),
        map(() => ({ type: 'change', data: { entity: event.entity, type: event.type, id: event.id, data: event.data } }) as MessageEvent),
      )),
    );
    // Heartbeat keeps proxies from closing idle connections.
    const heartbeat = interval(25_000).pipe(map(() => ({ type: 'ping', data: '' }) as MessageEvent));
    return merge(changes, heartbeat);
  }

  @Public()
  @Get('entities/:name')
  async list(
    @Param('name') name: string,
    @CurrentUser() user: AuthUser | null,
    @Query('q') q: string, @Query('sort') sort: string, @Query('limit') limit: string,
    @Query('skip') skip: string, @Query('cursor') cursor: string, @Query('page') page: string,
  ) {
    const result = await this.entities.list(name, user, parseJson(q), { sort, limit: Number(limit), skip: Number(skip), cursor });
    return page === '1' ? result : result.items;
  }

  @Public()
  @Get('entities/:name/:id')
  get(@Param('name') name: string, @Param('id') id: string, @CurrentUser() user: AuthUser | null) {
    return this.entities.get(name, user, id);
  }

  @Public()
  @Post('entities/:name')
  async create(@Param('name') name: string, @Body() body: unknown, @CurrentUser() user: AuthUser | null, @Req() req: Request) {
    if (user?.role !== 'admin') await this.limiter.hit(`entity-create:${user?.id ?? req.ip}`, 20, 3600);
    return this.entities.create(name, user, body);
  }

  @Public()
  @Post('entities/:name/aggregate')
  aggregate(@Param('name') name: string, @Body() body: { query?: unknown; groupBy?: unknown }, @CurrentUser() user: AuthUser | null) {
    return this.entities.aggregate(name, user, body);
  }

  @Public()
  @Patch('entities/:name/:id')
  update(@Param('name') name: string, @Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthUser | null) {
    return this.entities.update(name, user, id, body);
  }

  @Public()
  @Delete('entities/:name/:id')
  remove(@Param('name') name: string, @Param('id') id: string, @CurrentUser() user: AuthUser | null) {
    return this.entities.remove(name, user, id);
  }
}
