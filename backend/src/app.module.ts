import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { AuthGuard } from './auth/guard';
import { Db } from './db';
import { EntitiesController } from './entities/entities.controller';
import { EntitiesService } from './entities/entities.service';
import { Realtime } from './entities/realtime';
import { JsonErrorFilter } from './errors';
import { AiService } from './functions/ai';
import { Billing } from './functions/billing';
import { FunctionsController } from './functions/functions.controller';
import { PaymentsController, SquareWebhookController } from './payments/payments.controller';
import { PaymentsService } from './payments/payments.service';
import { OpsService } from './functions/ops';
import { PortalService } from './functions/portal';
import { PublicClients } from './functions/public-client';
import { Mail } from './mail';
import { MiscController } from './misc.controller';
import { Notifier } from './notify';
import { PricingService } from './pricing/pricing.service';
import { MarketResearch } from './pricing/research';
import { RateLimiter } from './rate-limit';
import { AiSearchBilling } from './ai-search/ai-search.billing';
import { AiSearchController } from './ai-search/ai-search.controller';
import { AiSearchService } from './ai-search/ai-search.service';
import { AiRouterController } from './ai-router/ai-router.controller';
import { BillingController, BillingWebhookController } from './billing-monitor/billing.controller';
import { BillingMonitorService } from './billing-monitor/billing-monitor.service';
import { AiRouterService } from './ai-router/ai-router.service';
import { HistoryController } from './history/history.controller';
import { HistoryService } from './history/history.service';
import { VideoAi } from './video/video-ai';
import { VideoBilling } from './video/video.billing';
import { VideoController } from './video/video.controller';
import { VideoService } from './video/video.service';
import { BuildStudioController } from './build-studio/build-studio.controller';
import { StackAdvisorController } from './stack-advisor/stack-advisor.controller';

@Module({
  imports: [
    // Default: 120 requests per minute per IP. Nginx applies a coarser limit in front.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
  ],
  controllers: [AuthController, EntitiesController, FunctionsController, PaymentsController, SquareWebhookController, MiscController, AiSearchController, AiRouterController, BillingController, BillingWebhookController, HistoryController, VideoController, BuildStudioController, StackAdvisorController],
  providers: [
    Db, Mail, RateLimiter, Realtime, Notifier, AuthService, EntitiesService,
    PaymentsService, AiService, Billing, PortalService, OpsService, PublicClients, MarketResearch, PricingService,
    HistoryService, BillingMonitorService, AiRouterService, AiSearchService, AiSearchBilling,
    VideoService, VideoAi, VideoBilling,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: JsonErrorFilter },
  ],
})
export class AppModule {}
