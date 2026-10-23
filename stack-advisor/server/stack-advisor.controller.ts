// NestJS controller for Stack Advisor. Drop into backend/src/stack-advisor/ with ../src/*.ts alongside.
// /ask reads simple questions without AI ("Do A and B work together?", "Is A + B + C a sound stack?", search words).
// Plan gates (free: search/get/check_edge; Pro: check_stack): enforce on the server via the plan check you already use.
import { Body, Controller, Get, HttpException, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { check_edge, check_stack, search_tools } from './tools';
import { SEED } from './seed';   // replace with the Postgres-backed store when collectors are running

const db = () => SEED;

export function readQuestion(message: string) {
  const known = db().tools;
  const found = known.filter(t => new RegExp(`\\b${t.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(message));
  return found.map(t => t.id);
}

@Controller('stack-advisor')
@UseGuards(JwtAuthGuard)
export class StackAdvisorController {
  @Get('search')
  search(@Query('q') q = '', @Query('category') category?: string) {
    return { results: search_tools(db(), q, { category }) };
  }

  @Post('ask')
  ask(@Body() body: { message: string }) {
    const message = String(body?.message || '').slice(0, 1000);
    if (!message.trim()) throw new HttpException({ error: 'Ask about AI tools, e.g. “Do LlamaIndex and Qdrant work together?”' }, HttpStatus.BAD_REQUEST);
    const ids = readQuestion(message);
    if (ids.length === 2) {
      const edge = check_edge(db(), ids[0], ids[1]);
      return { reply: edge.ok ? `Here is what our evidence says about ${edge.a} and ${edge.b}.` : edge.error, edge };
    }
    if (ids.length >= 3) {
      const stack = check_stack(db(), ids, new Date(), { kind: /\brag\b/i.test(message) ? 'rag' : undefined });
      return { reply: 'Here is our evidence-based check of that stack.', stack };
    }
    const category = /vector/i.test(message) ? 'vector-db' : undefined;
    const results = search_tools(db(), category ? '' : message.replace(/[?.!]/g, ''), { category });
    return results.length
      ? { reply: 'These tools match. Ask whether two of them work together to see the evidence.', results }
      : { reply: 'I have no record matching that yet. I won’t guess.', results: [] };
  }
}
