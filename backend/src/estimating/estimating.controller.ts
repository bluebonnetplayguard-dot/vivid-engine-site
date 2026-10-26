import { Body, Controller, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, CurrentUser } from '../auth/guard';
import { EstimatingService } from './estimating.service';

// /api/projects/:id/estimates — versioned estimates for a 3D Studio project (owner only).
@Controller('projects')
export class EstimatingController {
  constructor(private readonly estimates: EstimatingService) {}

  // Body: { designId, alternates?: string[], settings?, note? } → the saved estimate version.
  @Post(':id/estimates') @HttpCode(201) @Throttle({ default: { limit: 30, ttl: 60_000 } })
  create(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: any) { return this.estimates.create(user, id, body); }

  @Get(':id/estimates')
  list(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.estimates.list(user, id); }

  @Get(':id/estimates/:version')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('version') version: string) { return this.estimates.get(user, id, version); }
}

// /api/cost-tables — the built-in starter table (read-only) and the contractor's own tables.
@Controller('cost-tables')
export class CostTableController {
  constructor(private readonly estimates: EstimatingService) {}

  @Get() list(@CurrentUser() user: AuthUser) { return this.estimates.listCostTables(user); }
  @Get(':id') get(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.estimates.getCostTable(user, id); }
  // Body: { name, laborRatePerHour, items: CostItem[] }. Items not listed keep the starter price (and its warning).
  @Post() @HttpCode(201) create(@CurrentUser() user: AuthUser, @Body() body: unknown) { return this.estimates.saveCostTable(user, body); }
  @Put(':id') update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: unknown) { return this.estimates.saveCostTable(user, body, id); }
}
