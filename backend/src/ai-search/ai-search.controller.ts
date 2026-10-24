import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthUser, CurrentUser, Public } from '../auth/guard';
import { AiSearchBilling } from './ai-search.billing';
import { AiSearchService } from './ai-search.service';
import { publicTiers } from './plans';

// /api/ai-search/*. The plan list and asking a question are open to visitors (guests get a few quick searches a day,
// nothing saved); everything else needs a signed-in account.
@Controller('ai-search')
export class AiSearchController {
  constructor(private readonly search: AiSearchService, private readonly billing: AiSearchBilling) {}

  @Public() @Get('plans')
  plans() {
    return {
      tiers: publicTiers(),
      engines: this.search.engines(),
    };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) { return this.search.status(user); }

  // Streams the answer as server-sent events: thread | unsaved, routing, status, sources, delta, answer, usage_warning,
  // followups, done | error. The guard attaches req.user when a valid session is sent, even on a public route.
  @Public() @Post('ask') @Throttle({ default: { limit: 30, ttl: 60_000 } })
  ask(@CurrentUser() user: AuthUser | null, @Body() body: any, @Req() req: Request, @Res() res: Response) {
    return this.search.ask(user ?? null, body, req, res);
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
