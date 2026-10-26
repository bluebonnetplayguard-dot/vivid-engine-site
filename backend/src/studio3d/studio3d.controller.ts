import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthUser, CurrentUser } from '../auth/guard';
import { Studio3dService } from './studio3d.service';

// /api/studio3d/*: GC 3D Design Studio. Every route needs a signed-in account; projects are private to their owner.
@Controller('studio3d')
export class Studio3dController {
  constructor(private readonly studio: Studio3dService) {}

  @Get('status') status() { return this.studio.status(); }
  @Get('schema') schema() { return this.studio.schema(); }
  @Post('validate') @HttpCode(200) validate(@Body() body: any) { return this.studio.validate(body); }

  @Get('projects') projects(@CurrentUser() user: AuthUser) { return this.studio.listProjects(user); }
  @Post('projects') @HttpCode(200) createProject(@CurrentUser() user: AuthUser, @Body() body: any) { return this.studio.createProject(user, body); }
  @Get('projects/:id') project(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.studio.getProject(user, id); }
  @Post('projects/:id/designs') @HttpCode(200) createDesign(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: any) { return this.studio.createDesign(user, id, body); }

  @Get('designs/:id') design(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.studio.getDesign(user, id); }
  @Put('designs/:id') saveDesign(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: any) { return this.studio.saveDesign(user, id, body); }
  @Get('designs/:id/geometry') geometry(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('version') version?: string) { return this.studio.geometry(user, id, version); }
  @Post('geometry') @HttpCode(200) readGeometry(@Body() body: any) { return this.studio.readGeometry(body); }
  @Get('designs/:id/versions') versions(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.studio.versions(user, id); }
  @Get('designs/:id/versions/:v') version(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('v') v: string) { return this.studio.version(user, id, v); }

  // Body: the raw JPEG/PNG (see main.ts). Query: label, designId, meta (JSON).
  @Post('projects/:id/images') @HttpCode(200) @Throttle({ default: { limit: 30, ttl: 60_000 } })
  saveImage(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request, @Query() q: Record<string, unknown>) {
    return this.studio.saveImage(user, id, req.body, String(req.headers['content-type'] || '').split(';')[0].trim(), q);
  }

  @Get('images/:id')
  async image(@CurrentUser() user: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const img = await this.studio.image(user, id);
    res.set({ 'Content-Type': img.mime, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
    res.send(img.bytes);
  }

  @Post('interpret') @HttpCode(200) @Throttle({ default: { limit: 30, ttl: 60_000 } })
  interpret(@CurrentUser() user: AuthUser, @Body() body: any) { return this.studio.interpret(user, body); }
}
