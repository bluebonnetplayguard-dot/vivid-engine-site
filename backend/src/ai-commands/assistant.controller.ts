import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, CurrentUser } from '../auth/guard';
import { AI_COMMAND_TYPES, COMMAND_REGISTRY } from './command-schema';
import { InterpreterService } from './interpreter.service';
import { CommandRouterService } from './router/command-router.service';

// /api/ai/* — the unified AI assistant (the spec's /backend/api/routes/ai/assistant.ts). Signed-in only.
@Controller('ai')
export class AssistantController {
  constructor(private readonly interpreter: InterpreterService, private readonly router: CommandRouterService) {}

  // Body: { message, projectId?, designId?, model?, selection?, history? }
  // → { logId, reply, clarification?, commands: [{ command, risk, needsConfirmation, confirmReason?, warnings, targets }], rejected, engine }
  @Post('assistant') @HttpCode(200) @Throttle({ default: { limit: 30, ttl: 60_000 } })
  assistant(@CurrentUser() user: AuthUser, @Body() body: any) { return this.interpreter.assistant(user, body); }

  // Executes (or previews) validated commands: { projectId, designId, mode?: 'preview' | 'apply', baseVersion?, logId?,
  // message?, selection?, company?, commands: [{ command, confirmed? }] } → per-command results and the saved version.
  @Post('execute') @HttpCode(200) @Throttle({ default: { limit: 30, ttl: 60_000 } })
  execute(@CurrentUser() user: AuthUser, @Body() body: any) { return this.router.execute(user, body); }

  // What the assistant can do (for the UI's help text and command previews).
  @Get('commands/catalog')
  catalog() {
    return { available: this.interpreter.available(), commands: AI_COMMAND_TYPES.map(t => ({ type: t, family: COMMAND_REGISTRY[t].family, risk: COMMAND_REGISTRY[t].risk, supported: COMMAND_REGISTRY[t].supported, summary: COMMAND_REGISTRY[t].summary, reason: COMMAND_REGISTRY[t].unsupportedReason })) };
  }

  @Get('commands')
  log(@CurrentUser() user: AuthUser, @Query('projectId') projectId?: string, @Query('limit') limit?: string) { return this.interpreter.log(user, projectId, Number(limit) || 50); }

  // Undo/redo hooks: { status: executed | partially-executed | rejected | undone | redone, version?, note? }
  @Post('commands/:id/status') @HttpCode(200)
  status(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: any) { return this.interpreter.setStatus(user, id, body); }
}
