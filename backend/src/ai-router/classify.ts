import { ENGINE_LABELS, EngineId, Focus, Mode, RouterRequest } from './types';

// "Auto" picks an engine from the question itself. Plain rules, no model call, so it is instant, free and
// predictable. The reason is shown to the person under "Why this engine?".
//   Perplexity: anything that needs the live web and citations (news, prices, local, "latest", who/what/where).
//   Claude:     reasoning, writing, code, planning, step-by-step work, anything long.
//   Gemini:     pictures, video and other files the person attached; image and video focus.

const CODE = /\b(code|function|class|api|bug|error|exception|stack ?trace|regex|sql|query|html|css|javascript|typescript|python|react|node|docker|nginx|script|refactor|unit test|compile|deploy|build me|website|landing page|component)\b|```/i;
const WRITE = /\b(write|draft|rewrite|rephrase|proofread|edit this|summari[sz]e|translate|email|cover letter|proposal|outline|blog post|caption|slogan|tagline|essay|speech|plan|strategy|step[- ]by[- ]step|explain why|compare|pros and cons|analy[sz]e|calculate|estimate|solve|prove)\b/i;
const WEB = /\b(latest|today|tonight|this week|this month|right now|current|currently|news|price|prices|cost of|how much|near me|nearby|open now|hours|reviews?|best|top \d+|who is|who won|score|weather|forecast|release date|stock|rate|rates|law|ordinance|permit|code requirement|202\d)\b|\bwhat('?s| is) (the )?(latest|new)\b|https?:\/\//i;
const MEDIA = /\b(image|images|photo|photos|picture|pictures|video|videos|screenshot|diagram|logo|drawing|floor ?plan|blueprint|look at this|what('?s| is) in this)\b/i;

export interface Choice { engine: EngineId; why: string }

const FOCUS_ENGINE: Partial<Record<Focus, EngineId>> = { web: 'perplexity', local: 'perplexity', news: 'perplexity', shopping: 'perplexity', academic: 'perplexity', business: 'perplexity', images: 'gemini', videos: 'gemini' };

export function classifyIntent(req: Pick<RouterRequest, 'question' | 'mode' | 'focus' | 'attachments'>): Choice {
  const q = req.question;
  if (req.attachments?.length) return { engine: 'gemini', why: `You attached ${req.attachments.length === 1 ? 'a file' : 'files'}, and Gemini is the engine that reads images and other files.` };
  if (req.focus === 'images' || req.focus === 'videos') return { engine: 'gemini', why: `You chose ${req.focus}, which Gemini handles best.` };
  if (req.mode === 'build') return { engine: CODE.test(q) || !WEB.test(q) ? 'claude' : 'perplexity', why: CODE.test(q) || !WEB.test(q) ? 'Build mode is mostly writing and code, which is where Claude does best.' : 'This build question needs current information from the web, so Perplexity looked it up.' };
  if (req.mode === 'create') return { engine: MEDIA.test(q) ? 'gemini' : 'claude', why: MEDIA.test(q) ? 'Your request is about images or video, which Gemini handles best.' : 'Create mode is mostly writing and ideas, which is where Claude does best.' };
  if (req.focus && FOCUS_ENGINE[req.focus]) return { engine: FOCUS_ENGINE[req.focus]!, why: `You chose ${req.focus}, which needs live web results with sources, so Perplexity answered.` };
  const code = CODE.test(q), write = WRITE.test(q), web = WEB.test(q), media = MEDIA.test(q);
  if (media && !web && !code) return { engine: 'gemini', why: 'Your question is about pictures or video, which Gemini handles best.' };
  if (code && !web) return { engine: 'claude', why: 'This is a code or build question, which is where Claude does best.' };
  if (web && !write) return { engine: 'perplexity', why: 'This needs current information with sources, which is what Perplexity is built for.' };
  if (write && !web) return { engine: 'claude', why: 'This is a writing, planning or reasoning task, which is where Claude does best.' };
  if (web && write) return { engine: 'perplexity', why: 'This needs current facts with sources first, so Perplexity answered. Ask a follow-up to have Claude write it up.' };
  if (q.length > 600) return { engine: 'claude', why: 'This is a long, detailed question, which Claude handles best.' };
  return { engine: 'perplexity', why: 'Most questions are best answered from the live web with sources, so Perplexity answered.' };
}

// Order to try when the chosen engine fails. Never includes the engine itself.
export function fallbackOrder(first: EngineId): EngineId[] {
  return ({ perplexity: ['claude', 'gemini'], claude: ['perplexity', 'gemini'], gemini: ['claude', 'perplexity'] } as Record<EngineId, EngineId[]>)[first];
}

export const explicitWhy = (id: EngineId) => `You chose ${ENGINE_LABELS[id]}.`;
export const modeNote = (m: Mode) => m;
