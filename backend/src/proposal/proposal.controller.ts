import { Body, Controller, Get, HttpCode, Param, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthUser, CurrentUser } from '../auth/guard';
import { ProposalService } from './proposal.service';

// /api/projects/:id/estimates/:version/proposal and saved proposal exports (owner only).
@Controller('projects')
export class ProposalController {
  constructor(private readonly proposals: ProposalService) {}

  // Body: { company: { name, phone?, email?, address?, license? }, customer?, projectAddress?, validDays?, includeAlternates?,
  //         showLineItems?, tone?, terms?, useAi? } → { id, proposal } (proposal.markdown is the customer document)
  @Post(':id/estimates/:version/proposal') @HttpCode(201) @Throttle({ default: { limit: 20, ttl: 60_000 } })
  generate(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('version') version: string, @Body() body: unknown) {
    return this.proposals.generate(user, id, version, body);
  }

  @Get(':id/proposals')
  list(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.proposals.list(user, id); }

  @Get(':id/proposals/:proposalId')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('proposalId') proposalId: string) { return this.proposals.get(user, id, proposalId); }

  // The customer document as a Markdown file download.
  @Get(':id/proposals/:proposalId/markdown')
  async markdown(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('proposalId') proposalId: string, @Res() res: Response) {
    const row = await this.proposals.get(user, id, proposalId);
    res.set({ 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': `attachment; filename="proposal-v${row.estimate_version}.md"`, 'Cache-Control': 'no-store' });
    res.send(row.proposal.markdown);
  }
}
