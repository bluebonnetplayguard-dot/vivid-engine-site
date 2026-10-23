// AI planner for Build mode: turns a chat request into a template + params or a full Model Spec.
// The AI never draws geometry; the geometry service builds and checks whatever the planner proposes.
// Drop into backend/src/build-studio/. Needs ANTHROPIC_API_KEY and GEOMETRY_SERVICE_URL in the environment.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.BUILD_STUDIO_MODEL || 'claude-sonnet-5-5';
const GEOMETRY = process.env.GEOMETRY_SERVICE_URL || 'http://geometry:8090';
const SCHEMA_PATH = process.env.BUILD_STUDIO_SCHEMA || join(__dirname, 'model-spec.schema.json');
let SCHEMA_CACHE: string | null = null;   // read once; needs nest-cli.json "assets": ["**/*.json"] so dist/ has it
const schemaText = () => (SCHEMA_CACHE ??= readFileSync(SCHEMA_PATH, 'utf8'));

export interface BuildTurnInput {
  message: string;
  currentSpec?: Record<string, unknown> | null; // the model on screen, when this is a follow-up
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  beforePlanner?: () => Promise<void>;   // e.g. credit check, run only when the AI planner is needed
}

export interface PlannerOutput {
  reply: string;                       // one or two plain sentences for the chat
  template?: 'deck';
  params?: Record<string, string>;
  spec?: Record<string, unknown>;
  question?: string;                   // ask this instead of building when a key size is missing
}

export interface BuildResult {
  reply: string;
  question?: string;
  usedPlanner: boolean;                // true = AI step (credits); false = quick parser (free)
  spec?: Record<string, unknown>;
  summary?: string[];
  changes?: string[];
  viewer?: unknown;
  validation?: { ok: boolean; findings: Array<{ fault: string; message: string; elements: string[]; severity: string; suggestion: string }>; scenes: Record<string, string[]> };
  notice?: string;
}

const SYSTEM = (schema: string) => `You are the planner for Vivid Build Studio, a parametric modeling tool inside Vivid Engine.
You never draw geometry. You write a plan that a deterministic geometry engine builds exactly.

Rules:
- Prefer a template when the request fits one. Templates: deck (params: width = length along the house, depth = distance out from the house, height = deck surface above grade, joist_spacing = 12in|16in|24in, beam_setback = beam distance in from the outer edge). Pass lengths as strings with units, e.g. "16ft", "30in", "2ft 6in".
- Only write a full Model Spec when no template fits. It must match the JSON schema below exactly. Lengths are strings with units or expressions over parameters. Use the rotation shortcuts along-x, along-y, along-z, and anchor min-corner.
- For a follow-up, change only what the user asked. If a current spec is given, return the complete updated spec, or the template with updated params.
- If a size the model can't sensibly assume is missing (for example the user gives no dimensions at all), set "question" to one short question instead of building. Otherwise assume sensible defaults and say what you assumed in "reply".
- Never claim a design is engineered, approved, code-compliant or safe. Structural sizes are preliminary estimates. Playground structures must point to the current CPSC Public Playground Safety Handbook and ASTM standards and a final professional review.
- "reply" is one or two plain sentences: what you built or changed, and any assumption.

Model Spec JSON schema:
${schema}`;

const TOOL = {
  name: 'submit_build_plan',
  description: 'Submit the plan for this turn: a template with params, or a full Model Spec, or a clarifying question.',
  input_schema: {
    type: 'object',
    properties: {
      reply: { type: 'string', description: 'One or two plain sentences for the user.' },
      template: { type: 'string', enum: ['deck'] },
      params: { type: 'object', additionalProperties: { type: 'string' } },
      spec: { type: 'object', description: 'A complete Model Spec, only when no template fits.' },
      question: { type: 'string', description: 'Ask this instead of building when a key dimension is missing.' },
    },
    required: ['reply'],
  },
};

async function callClaude(messages: Array<{ role: string; content: unknown }>): Promise<PlannerOutput> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM(schemaText()),
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
      messages,
    }),
  });
  if (!res.ok) throw new Error(`Planner request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const data = await res.json() as { content: Array<{ type: string; name?: string; input?: PlannerOutput }> };
  const call = data.content.find(c => c.type === 'tool_use' && c.name === TOOL.name);
  if (!call?.input) throw new Error('Planner returned no plan');
  return call.input;
}

async function geometry(path: string, body: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(`${GEOMETRY}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// One Build-mode turn. Tries the free quick parser first, then the AI planner, with one repair round
// if the geometry service rejects the planner's spec.
export async function buildTurn(input: BuildTurnInput): Promise<BuildResult> {
  const previous_spec = input.currentSpec || undefined;
  if (!previous_spec) {
    const quick = await geometry('/chat/build', { message: input.message });
    if (quick.status === 200) {
      return { reply: `Here's a starting model from your description. Ask me to change any size.`, usedPlanner: false, ...quick.data };
    }
  }

  const userContent = previous_spec
    ? `Current Model Spec:\n${JSON.stringify(previous_spec)}\n\nChange requested: ${input.message}`
    : input.message;
  const messages: Array<{ role: string; content: unknown }> = [...(input.history || []).slice(-6), { role: 'user', content: userContent }];
  await input.beforePlanner?.();
  let plan = await callClaude(messages);
  if (plan.question) return { reply: plan.reply, question: plan.question, usedPlanner: true };

  for (let attempt = 0; attempt < 2; attempt++) {
    if (plan.question) return { reply: plan.reply, question: plan.question, usedPlanner: true };
    if (!plan.spec && !plan.template) {   // never let the geometry service re-parse the message into a fresh default model
      if (attempt === 1) break;
      messages.push({ role: 'assistant', content: [{ type: 'text', text: JSON.stringify(plan) }] });
      messages.push({ role: 'user', content: 'Return either a template with ALL params, or a full spec, or a question.' });
      plan = await callClaude(messages);
      continue;
    }
    const res = await geometry('/chat/build', { message: '', spec: plan.spec, template: plan.template, params: plan.params, previous_spec });
    if (res.status === 200) return { reply: plan.reply, usedPlanner: true, ...res.data };
    if (attempt === 1) break;
    // Repair: show the planner exactly what the engine rejected.
    messages.push({ role: 'assistant', content: [{ type: 'text', text: JSON.stringify(plan) }] });
    messages.push({ role: 'user', content: `The geometry engine rejected that plan:\n${typeof res.data?.detail === 'string' ? res.data.detail : JSON.stringify(res.data)}\nFix it and submit again.` });
    plan = await callClaude(messages);
  }
  return { reply: 'I couldn’t build a valid model from that. Try giving the main sizes, for example “16 by 12 ft deck, 30 inches high.”', usedPlanner: true };
}

export async function sheetPdf(spec: Record<string, unknown>, scale = '1/4"=1\'-0"', paper = 'ANSI-A'): Promise<ArrayBuffer> {
  const res = await fetch(`${GEOMETRY}/sheet.pdf`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ spec, scale, paper }) });
  if (!res.ok) throw new Error(`Sheet export failed (${res.status})`);
  return res.arrayBuffer();
}
