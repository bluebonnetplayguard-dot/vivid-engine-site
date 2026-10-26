import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { BillingMonitorService } from '../billing-monitor/billing-monitor.service';
import { aiCommandJsonSchema } from './command-schema';

// The language-model step, behind an interface so the interpreter can be tested without a network.

export interface ModelAnswer { reply: string; clarification?: string; commands: unknown[]; usage?: { input: number; output: number } }
export interface CommandModel {
  readonly name: string;
  available(): boolean;
  interpret(input: { message: string; context: unknown; history: string[]; userId: string }): Promise<ModelAnswer>;
}

import { SYSTEM_PROMPT } from './prompt';
export { SYSTEM_PROMPT };

export class ClaudeCommandModel implements CommandModel {
  readonly name = 'claude';
  private readonly client = config.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: config.ANTHROPIC_API_KEY }) : null;
  private schema: unknown = null;
  constructor(private readonly billing: BillingMonitorService) {}
  available() { return !!this.client; }

  async interpret(input: { message: string; context: unknown; history: string[]; userId: string }): Promise<ModelAnswer> {
    if (!this.client) throw new Error('not configured');
    this.schema ??= aiCommandJsonSchema();
    const tool = {
      name: 'gc_commands',
      description: 'Return the commands that carry out the request, a short reply, and a clarification question if a needed detail is missing.',
      input_schema: { type: 'object' as const, properties: {
        reply: { type: 'string' },
        clarification: { type: 'string', description: 'Ask this instead of acting when a needed detail (usually a size) is missing.' },
        commands: { type: 'array', items: this.schema as object, maxItems: 25 },
      }, required: ['reply', 'commands'] },
    };
    const model = config.STUDIO3D_MODEL;
    const started = Date.now();
    const prior = input.history.length ? `Earlier requests (oldest first):\n${input.history.map(h => `- ${h}`).join('\n')}\n\n` : '';
    try {
      const res = await this.client.messages.create({
        model, max_tokens: 2000,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        tools: [tool as any], tool_choice: { type: 'tool', name: tool.name },
        messages: [{ role: 'user', content: `${prior}<context>${JSON.stringify(input.context).slice(0, 80_000)}</context>\n\nRequest: ${input.message}` }],
      });
      const usage = { input: res.usage.input_tokens + (res.usage.cache_creation_input_tokens ?? 0), output: res.usage.output_tokens };
      this.billing.record({ provider: 'claude', model, userId: input.userId, workflow: 'ai_assistant', feature: 'interpret', latencyMs: Date.now() - started,
        usage: { ...usage, cacheRead: res.usage.cache_read_input_tokens ?? 0 } });
      const call = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      const out = (call?.input ?? {}) as { reply?: unknown; clarification?: unknown; commands?: unknown };
      return {
        reply: typeof out.reply === 'string' ? out.reply.slice(0, 800) : '',
        clarification: typeof out.clarification === 'string' && out.clarification.trim() ? out.clarification.slice(0, 400) : undefined,
        commands: Array.isArray(out.commands) ? out.commands : [],
        usage,
      };
    } catch (e: any) {
      this.billing.record({ provider: 'claude', model, userId: input.userId, workflow: 'ai_assistant', feature: 'interpret', failed: true, latencyMs: Date.now() - started, httpStatus: e?.status ?? null, errorCode: e?.name ?? 'error' });
      throw e;
    }
  }
}
