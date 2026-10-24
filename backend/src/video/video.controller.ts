import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthUser, CurrentUser, Public } from '../auth/guard';
import { config } from '../config';
import { publicVideoTiers } from './video-plans';
import { TTS_VOICES, VideoAi } from './video-ai';
import { VideoBilling } from './video.billing';
import { VideoService } from './video.service';

// /api/video/*. Everything except the plan list requires a signed-in account.
@Controller('video')
export class VideoController {
  constructor(private readonly video: VideoService, private readonly ai: VideoAi, private readonly billing: VideoBilling) {}

  @Public() @Get('plans')
  plans() {
    return {
      tiers: publicVideoTiers(),
      voices: TTS_VOICES,
      ai: { captions: !!config.OPENAI_API_KEY, voiceover: !!config.OPENAI_API_KEY, storyboard: !!(config.ANTHROPIC_API_KEY || config.OPENAI_API_KEY), stock: !!config.PEXELS_API_KEY },
    };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) { return this.video.status(user); }

  @Post('exports') @HttpCode(200)
  startExport(@CurrentUser() user: AuthUser, @Body() body: any) { return this.video.startExport(user, body); }

  @Get('projects')
  projects(@CurrentUser() user: AuthUser) { return this.video.listProjects(user); }

  @Post('projects') @HttpCode(200)
  createProject(@CurrentUser() user: AuthUser, @Body() body: any) { return this.video.createProject(user, body); }

  @Get('projects/:id')
  project(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.video.getProject(user, id); }

  @Put('projects/:id')
  updateProject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: any) { return this.video.updateProject(user, id, body); }

  @Delete('projects/:id')
  deleteProject(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.video.deleteProject(user, id); }

  @Get('brand-kits')
  brandKits(@CurrentUser() user: AuthUser) { return this.video.listBrandKits(user); }

  @Post('brand-kits') @HttpCode(200)
  createBrandKit(@CurrentUser() user: AuthUser, @Body() body: any) { return this.video.createBrandKit(user, body); }

  @Put('brand-kits/:id')
  updateBrandKit(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: any) { return this.video.updateBrandKit(user, id, body); }

  @Delete('brand-kits/:id')
  deleteBrandKit(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.video.deleteBrandKit(user, id); }

  // Body: raw audio/wav (see main.ts for the parser).
  @Post('transcribe') @HttpCode(200) @Throttle({ default: { limit: 60, ttl: 60_000 } })
  transcribe(@CurrentUser() user: AuthUser, @Req() req: Request, @Query('language') language?: string) {
    return this.ai.transcribe(user, req.body, String(language ?? ''));
  }

  @Post('tts') @HttpCode(200)
  tts(@CurrentUser() user: AuthUser, @Body() body: any, @Res() res: Response) { return this.ai.tts(user, body, res); }

  @Post('storyboard') @HttpCode(200)
  storyboard(@CurrentUser() user: AuthUser, @Body() body: any) { return this.ai.storyboard(user, body); }

  @Get('stock/search')
  stockSearch(@CurrentUser() user: AuthUser, @Query() query: Record<string, unknown>) { return this.ai.stockSearch(user, query); }

  @Get('stock/file') @Throttle({ default: { limit: 60, ttl: 60_000 } })
  stockFile(@CurrentUser() user: AuthUser, @Query('url') url: string, @Res() res: Response) { return this.ai.stockFile(user, String(url ?? ''), res); }

  @Post('checkout') @HttpCode(200)
  checkout(@CurrentUser() user: AuthUser, @Body() body: any) { return this.billing.checkout(user, body); }

  @Post('billing-portal') @HttpCode(200)
  portal(@CurrentUser() user: AuthUser) { return this.billing.portal(user); }

  @Get('team')
  team(@CurrentUser() user: AuthUser) { return this.video.team(user); }

  @Post('team') @HttpCode(200)
  addMember(@CurrentUser() user: AuthUser, @Body() body: any) { return this.video.addMember(user, body); }

  @Delete('team/:id')
  removeMember(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.video.removeMember(user, id); }
}
