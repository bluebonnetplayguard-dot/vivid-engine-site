import { Controller, Get } from '@nestjs/common';
import { AdminOnly } from '../auth/guard';
import { AiRouterService } from './ai-router.service';

// Admin only. Says whether each AI engine is connected, missing its key, or in trouble. Never shows a key.
@Controller('admin/health')
export class AiRouterController {
  constructor(private readonly ai: AiRouterService) {}

  @AdminOnly() @Get('providers')
  providers() { return { checked_at: new Date().toISOString(), providers: this.ai.providerHealth() }; }
}
