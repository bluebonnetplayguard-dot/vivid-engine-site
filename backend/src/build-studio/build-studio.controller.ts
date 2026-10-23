import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthUser, CurrentUser } from '../auth/guard';
import { Db } from '../db';
import { ApiError, badRequest } from '../errors';
import { AiSearchService } from '../ai-search/ai-search.service';
import { buildTurn, geometryConfigured, sheetPdf } from './planner';

// /api/build-studio/*. Free quick-parser turns cost nothing; AI planner steps count against a daily limit by plan.
const PLANNER_STEPS_PER_DAY: Record<string, number> = { free: 5, starter: 20, plus: 30, pro: 40, business: 40, max: 60 };
const SCALES = ['1/4"=1\'-0"', '1/2"=1\'-0"', '1/8"=1\'-0"', '3/4"=1\'-0"', '1"=1\'-0"', '1:1'];

@Controller('build-studio')
export class BuildStudioController {
  constructor(private readonly db: Db, private readonly search: AiSearchService) {}

  private ready() {
    if (!geometryConfigured()) throw new ApiError(503, 'Build Studio isn’t switched on for this site yet.', { code: 'NOT_CONFIGURED' });
  }

  @Post('turn') @HttpCode(200) @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async turn(@CurrentUser() user: AuthUser, @Body() body: any) {
    this.ready();
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!message) throw badRequest('Describe what you want to build.');
    if (message.length > 4000) throw badRequest('That message is too long.');
    const spec = body?.spec && typeof body.spec === 'object' ? body.spec : null;
    if (spec && JSON.stringify(spec).length > 200_000) throw badRequest('That model is too large.');
    const history = (Array.isArray(body?.history) ? body.history : [])
      .filter((m: any) => m?.role === 'user' && typeof m.content === 'string').slice(-6)
      .map((m: any) => ({ role: 'user' as const, content: m.content.slice(0, 4000) }));

    const ent = await this.search.entitlement(user);
    const limit = PLANNER_STEPS_PER_DAY[ent.tier.id] ?? PLANNER_STEPS_PER_DAY.free;
    const beforePlanner = async () => {
      const used = await this.db.one<{ n: number }>(
        `SELECT count(*)::int AS n FROM build_studio_usage WHERE user_id = $1 AND at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`, [user.id]);
      if ((used?.n ?? 0) >= limit) {
        throw new ApiError(429, `You’ve used all ${limit} AI design steps for today on the ${ent.tier.name} plan. Simple requests with sizes, like “12x16 deck 30 inches high”, are still free.`, { code: 'QUOTA_DAY' });
      }
    };
    const result = await buildTurn({ message, currentSpec: spec, history, beforePlanner });
    if (result.usedPlanner) await this.db.query('INSERT INTO build_studio_usage(user_id, tier, chars) VALUES ($1, $2, $3)', [user.id, ent.tier.id, message.length]);
    return result;
  }

  @Post('sheet') @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async sheet(@Body() body: any, @Res() res: Response) {
    this.ready();
    if (!body?.spec || typeof body.spec !== 'object') throw badRequest('Missing model.');
    const scale = SCALES.includes(body.scale) ? body.scale : SCALES[0];
    let pdf: Buffer;
    try { pdf = Buffer.from(await sheetPdf(body.spec, scale, body.paper === 'ANSI-B' ? 'ANSI-B' : 'ANSI-A')); }
    catch (e: any) { throw new ApiError(422, e?.message || 'Couldn’t make the drawing.'); }
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="build-studio-sheet.pdf"', 'Cache-Control': 'no-store' });
    res.send(pdf);
  }
}
