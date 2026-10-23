// NestJS routes for Build mode. Register BuildStudioModule in AppModule.
//   POST /api/build-studio/turn   { message, spec? }        -> BuildResult (JSON)
//   POST /api/build-studio/sheet  { spec, scale?, paper? }  -> application/pdf
// Signed-in users only. AI planner steps cost credits; quick-parser turns and exports are free.
import { Body, Controller, HttpException, HttpStatus, Inject, Injectable, Module, Optional, Post, Req, Res, UseGuards } from '@nestjs/common';
import { buildTurn, sheetPdf, type BuildResult } from './planner';

// Adjust this path to the backend's existing auth guard (the one AI Search uses).
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

export interface CreditLedger {
  charge(userId: string, action: string, amount: number, meta?: Record<string, unknown>): Promise<void>;
  hasCredits(userId: string, action: string): Promise<boolean>;
}
export const CREDIT_LEDGER = Symbol('CREDIT_LEDGER');
const AI_STEP = 'build_studio_ai_step';

@Injectable()
export class BuildStudioService {
  constructor(@Optional() @Inject(CREDIT_LEDGER) private readonly credits?: CreditLedger) {}

  async turn(userId: string, message: string, spec?: Record<string, unknown> | null, history?: BuildTurnHistory): Promise<BuildResult> {
    if (!message?.trim()) throw new HttpException({ error: 'Describe what you want to build.' }, HttpStatus.BAD_REQUEST);
    if (message.length > 4000) throw new HttpException({ error: 'That message is too long.' }, HttpStatus.BAD_REQUEST);
    // Free quick-parser turns never need credits; only the AI planner step checks them.
    const beforePlanner = async () => {
      if (this.credits && !(await this.credits.hasCredits(userId, AI_STEP))) {
        throw new HttpException({ error: 'You’re out of Build Studio credits.', code: 'QUOTA_DAY' }, HttpStatus.PAYMENT_REQUIRED);
      }
    };
    const result = await buildTurn({ message, currentSpec: spec, history, beforePlanner });
    if (result.usedPlanner && this.credits) await this.credits.charge(userId, AI_STEP, 1, { chars: message.length });
    return result;
  }
}
type BuildTurnHistory = Array<{ role: 'user' | 'assistant'; content: string }>;

@Controller('build-studio')
@UseGuards(JwtAuthGuard)
export class BuildStudioController {
  constructor(private readonly service: BuildStudioService) {}

  @Post('turn')
  turn(@Req() req: any, @Body() body: { message: string; spec?: Record<string, unknown> | null; history?: BuildTurnHistory }) {
    return this.service.turn(String(req.user?.id), body.message, body.spec, body.history);
  }

  @Post('sheet')
  async sheet(@Body() body: { spec: Record<string, unknown>; scale?: string; paper?: string }, @Res() res: any) {
    if (!body?.spec) throw new HttpException({ error: 'Missing spec' }, HttpStatus.BAD_REQUEST);
    let pdf: Buffer;
    try { pdf = Buffer.from(await sheetPdf(body.spec, body.scale, body.paper)); }
    catch (e: any) { throw new HttpException({ error: e?.message || 'Couldn’t make the drawing.' }, HttpStatus.UNPROCESSABLE_ENTITY); }
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="build-studio-sheet.pdf"', 'Cache-Control': 'no-store' });
    res.send(pdf);
  }
}

@Module({ controllers: [BuildStudioController], providers: [BuildStudioService] })
export class BuildStudioModule {}
