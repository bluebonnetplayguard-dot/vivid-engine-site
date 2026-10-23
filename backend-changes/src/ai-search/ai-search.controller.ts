import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthUser, CurrentUser, Public } from '../auth/guard';
import { AiSearchBilling } from './ai-search.billing';
import { AiSearchService } from './ai-search.service';
import { CONTRIBUTOR_LABELS, contributorConfigured } from './contributors';
import { publicTiers } from './plans';

// /api/ai-search/*. Everything except the plan list requires a signed-in account,
// which is what lets free questions be limited per person.
@Controller('ai-search')
export class AiSearchController {
  constructor(private readonly search: AiSearchService, private readonly billing: AiSearchBilling) {}

  @Public() @Get('plans')
  plans() {
    return {
      tiers: publicTiers(),
      engines: (Object.keys(CONTRIBUTOR_LABELS) as (keyof typeof CONTRIBUTOR_LABELS)[]).map(id => ({ id, label: CONTRIBUTOR_LABELS[id], available: contributorConfigured(id) })),
    };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) { return this.search.status(user); }

  // Streams the answer as server-sent events: thread, status, contributor, sources, delta, done | error.
  @Post('ask') @Throttle({ default: { limit: 30, ttl: 60_000 } })
  ask(@CurrentUser() user: AuthUser, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    return this.search.ask(user, body, req, res);
  }

  @Get('threads')
  threads(@CurrentUser() user: AuthUser, @Query() query: any) { return this.search.threads(user, query); }

  @Get('spaces')
  spaces(@CurrentUser() user: AuthUser) { return this.search.spaces(user); }

  @Get('export')
  exportAll(@CurrentUser() user: AuthUser) { return this.search.exportThreads(user); }

  @Get('threads/:id')
  thread(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.search.thread(user, id); }

  @Patch('threads/:id')
  updateThread(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: any) { return this.search.updateThread(user, id, body); }

  @Delete('threads/:id')
  deleteThread(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.search.deleteThread(user, id); }

  @Post('checkout') @HttpCode(200)
  checkout(@CurrentUser() user: AuthUser, @Body() body: any) { return this.billing.checkout(user, body); }

  @Post('billing-portal') @HttpCode(200)
  portal(@CurrentUser() user: AuthUser) { return this.billing.portal(user); }

  @Get('team')
  team(@CurrentUser() user: AuthUser) { return this.search.team(user); }

  @Post('team') @HttpCode(200)
  addMember(@CurrentUser() user: AuthUser, @Body() body: any) { return this.search.addMember(user, body); }

  @Delete('team/:id')
  removeMember(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.search.removeMember(user, id); }
}
