import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthUser, CurrentUser } from '../auth/guard';
import { badRequest } from '../errors';
import { AiSearchService } from '../ai-search/ai-search.service';
import { PRO_LEVEL_TIER_IDS } from '../ai-search/plans';
import { SEED } from './seed';
import { check_edge, check_stack, get_tool, search_tools } from './tools';
import type { Db as StackDb } from './types';

// /api/stack-advisor/*. Evidence-based answers only: never state that tools work together without evidence.
// NEUTRALITY: rankings and trust tiers are never for sale. No vendor can pay for a tier, placement or score.
// Data: development SEED (every record flagged mock) until the collectors fill Postgres.
const STACK_TIERS: string[] = PRO_LEVEL_TIER_IDS;   // check_stack is a paid-plan feature (search, get_tool, check_edge are free)
const data = (): StackDb => SEED;

export function toolsIn(message: string): string[] {
  const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return data().tools.filter(t => new RegExp(`\\b${esc(t.name)}\\b`, 'i').test(message)).map(t => t.id);
}

@Controller('stack-advisor')
export class StackAdvisorController {
  constructor(private readonly search: AiSearchService) {}

  @Get('search')
  find(@Query('q') q = '', @Query('category') category?: string) {
    return { results: search_tools(data(), String(q).slice(0, 200), { category: category || undefined }) };
  }

  @Get('tool')
  tool(@Query('id') id = '') {
    const t = get_tool(data(), String(id));
    if (!t) throw badRequest('No record for that tool yet.');
    return t;
  }

  @Post('ask') @HttpCode(200) @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async ask(@CurrentUser() user: AuthUser, @Body() body: any) {
    const message = typeof body?.message === 'string' ? body.message.trim().slice(0, 1000) : '';
    if (!message) throw badRequest('Ask about AI tools, for example “Do LlamaIndex and Qdrant work together?”');
    const ids = toolsIn(message);
    if (ids.length === 2) {
      const edge = check_edge(data(), ids[0], ids[1]);
      return { reply: edge.ok ? `Here’s what our evidence says about ${edge.a} and ${edge.b}.` : edge.error, edge };
    }
    if (ids.length >= 3) {
      const ent = await this.search.entitlement(user);
      if (!STACK_TIERS.includes(ent.tier.id)) {
        const edge = check_edge(data(), ids[0], ids[1]);
        return { reply: 'Whole-stack checks come with the Pro, Max and Business plans. Here is the evidence for the first pair.', edge, upgrade: true };
      }
      const stack = check_stack(data(), ids, new Date(), { kind: /\brag\b/i.test(message) ? 'rag' : undefined });
      return { reply: 'Here’s our evidence-based check of that stack.', stack };
    }
    const category = /vector/i.test(message) ? 'vector-db' : undefined;
    const results = search_tools(data(), category ? '' : message.replace(/[?.!,]/g, ' '), { category });
    return results.length
      ? { reply: 'These tools match. Ask whether two of them work together to see the evidence.', results }
      : { reply: 'I don’t have a record matching that yet, so I won’t guess.', results: [] };
  }
}
