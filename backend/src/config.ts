import { z } from 'zod';

// All configuration comes from environment variables (see .env.example).
// The process refuses to start if a required value is missing or malformed.
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  PORT: z.coerce.number().int().default(8080),
  STATIC_DIR: z.string().optional(), // built website to serve (set in the Docker image)
  PUBLIC_ORIGIN: z.string().url().default('https://vividenginesolutions.com'),
  DATABASE_URL: z.string().min(1),
  DATABASE_CA_CERT: z.string().optional(),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  PUBLIC_CLIENT_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().default(30),

  // Comma-separated. Accounts with these emails become admins once verified.
  ADMIN_EMAILS: z.string().default(''),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('Vivid Engine Solutions <info@vividenginesolutions.com>'),
  STAFF_NOTIFY_EMAIL: z.string().default('info@vividenginesolutions.com'),

  // Square (the only payment provider). Payments from any other location are rejected.
  SQUARE_APPLICATION_ID: z.string().optional(),
  SQUARE_LOCATION_ID: z.string().optional(),
  SQUARE_ACCESS_TOKEN: z.string().optional(),
  SQUARE_WEBHOOK_SIGNATURE_KEY: z.string().optional(),
  SQUARE_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),

  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_MODEL: z.string().default('claude-opus-5-5'),

  // Owner text alerts for new leads (Twilio). Leave blank to skip SMS; each skip is logged in SmsLog.
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  OWNER_PHONE: z.string().optional(),

  // Market research providers for the pricing engine (each optional and independent).
  TAVILY_API_KEY: z.string().optional(),
  EXA_API_KEY: z.string().optional(),
  PERPLEXITY_API_KEY: z.string().optional(),

  // Vivid AI Search. Claude (ANTHROPIC_API_KEY) answers; these engines contribute second opinions on
  // paid tiers. Each is optional: an engine with no key is skipped. PERPLEXITY_API_KEY is shared with pricing research.
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_SEARCH_MODEL: z.string().default('gpt-5-mini'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_SEARCH_MODEL: z.string().default('gemini-4-argon,gemini-3.8-flash'),
  // Perplexity Agent API model ids (provider/model, from docs.perplexity.ai/docs/agent-api/models).
  // With only PERPLEXITY_API_KEY set, the Gemini and ChatGPT second opinions run through the Agent API
  // using these models, and if ANTHROPIC_API_KEY is missing or failing, Claude answers through it too.
  PERPLEXITY_SEARCH_MODEL: z.string().default('perplexity/sonar'),
  PPLX_GEMINI_MODEL: z.string().default('google/gemini-3.8-flash'),
  PPLX_OPENAI_MODEL: z.string().default('openai/gpt-6-luna'),
  // Hard ceiling on estimated AI Search spend per UTC day. When reached, questions pause until midnight UTC.
  AI_SEARCH_DAILY_BUDGET_USD: z.coerce.number().min(0).default(25),

  // Vivid Video Studio. Captions and voiceover use OPENAI_API_KEY; script-to-video uses Claude, else OpenAI.
  // Stock footage needs a free Pexels key (pexels.com/api). Each feature is hidden when its key is missing.
  PEXELS_API_KEY: z.string().optional(),
  VIDEO_TRANSCRIBE_MODEL: z.string().default('whisper-1'),
  VIDEO_TTS_MODEL: z.string().default('gpt-4o-mini-tts'),
  VIDEO_STORYBOARD_MODEL: z.string().default('claude-haiku-5-5'),
  // Hard ceiling on estimated Video Studio AI spend per UTC day. 0 = no ceiling.
  VIDEO_DAILY_BUDGET_USD: z.coerce.number().min(0).default(10),

  // Vivid Build Studio: the geometry service (build-studio/geometry, internal network only) and the planner model.
  // Leave GEOMETRY_SERVICE_URL blank to keep Build Studio switched off.
  GEOMETRY_SERVICE_URL: z.string().optional(),
  BUILD_STUDIO_MODEL: z.string().default('claude-sonnet-5-5'),

  // Saved conversation history is encrypted at rest with this key (32 random bytes, base64: openssl rand -base64 32).
  // Without it, production keeps history switched off rather than storing it unencrypted.
  // To rotate: put the new key here and move the old one to HISTORY_ENCRYPTION_KEY_PREVIOUS (comma list).
  HISTORY_ENCRYPTION_KEY: z.string().optional(),
  HISTORY_ENCRYPTION_KEY_PREVIOUS: z.string().optional(),

  // IndexNow key; the site must serve /<key>.txt containing the key.
  INDEXNOW_KEY: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const problems = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n  ');
  throw new Error(`Invalid environment configuration:\n  ${problems}`);
}

export const config = parsed.data;
export const isProd = config.NODE_ENV === 'production';
export const adminEmails = new Set(
  config.ADMIN_EMAILS.split(',').map(e => e.trim().toLowerCase()).filter(Boolean),
);
