import { Injectable } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { config } from './config';
import { Db } from './db';
import { ApiError } from './errors';

export interface LimitRule { scope: string; id: string; max: number; windowSec: number }

// Fixed-window counters in Postgres, one atomic upsert per rule. Replaces the
// RateLimit entity the Base44 functions used. Identifiers (emails, visitor ids)
// are HMAC'd so the table never stores them in the clear.
@Injectable()
export class RateLimiter {
  constructor(private readonly db: Db) {}

  private key(scope: string, id: string) {
    return `${scope}:${createHmac('sha256', config.PUBLIC_CLIENT_SECRET).update(`${scope}:${id}`).digest('hex')}`;
  }

  // Returns 0 when allowed, otherwise the seconds until the window resets.
  async check(rules: LimitRule[]): Promise<number> {
    for (const { scope, id, max, windowSec } of rules) {
      const row = await this.db.one<{ count: number; reset_in: number }>(
        `INSERT INTO rate_limits(key, count, window_start) VALUES ($1, 1, now())
         ON CONFLICT (key) DO UPDATE SET
           count = CASE WHEN rate_limits.window_start <= now() - make_interval(secs => $2) THEN 1 ELSE rate_limits.count + 1 END,
           window_start = CASE WHEN rate_limits.window_start <= now() - make_interval(secs => $2) THEN now() ELSE rate_limits.window_start END
         RETURNING count, CEIL(EXTRACT(EPOCH FROM (window_start + make_interval(secs => $2) - now())))::int AS reset_in`,
        [this.key(scope, id), windowSec],
      );
      if (row.count > max) return Math.max(1, row.reset_in);
    }
    return 0;
  }

  async enforce(rules: LimitRule[], message = 'Too many requests. Please try again later.') {
    const retryAfter = await this.check(rules);
    if (retryAfter) throw new ApiError(429, message, { retryAfter });
  }

  // Single-bucket helper, same contract as Base44's rateLimit(key, max, windowMs).
  hit(key: string, max: number, windowSec: number, message?: string) {
    return this.enforce([{ scope: key, id: 'x', max, windowSec }], message);
  }

  async prune() {
    await this.db.query(`DELETE FROM rate_limits WHERE window_start < now() - interval '2 days'`);
  }
}

// Budgets carried over from base44/shared/assistantLimits.ts.
export const issuanceLimits = (): LimitRule[] => [
  { scope: 've-public-issuance-minute', id: 'all', max: 100, windowSec: 60 },
  { scope: 've-public-issuance-hour', id: 'all', max: 500, windowSec: 3600 },
  { scope: 've-public-issuance-day', id: 'all', max: 1000, windowSec: 86400 },
];
export const ownerSmsLimits = (): LimitRule[] => [
  { scope: 've-owner-sms-minute', id: 'owner', max: 5, windowSec: 60 },
  { scope: 've-owner-sms-hour', id: 'owner', max: 30, windowSec: 3600 },
  { scope: 've-owner-sms-day', id: 'owner', max: 100, windowSec: 86400 },
];
export function chatLimits(clientId: string, sessionId?: string): LimitRule[] {
  const rules: LimitRule[] = [
    { scope: 've-chat-app-day', id: 'all', max: 1000, windowSec: 86400 },
    { scope: 've-chat-app', id: 'all', max: 1000, windowSec: 3600 },
    { scope: 've-chat-client', id: clientId, max: 30, windowSec: 3600 },
    { scope: 've-chat-burst', id: clientId, max: 8, windowSec: 60 },
  ];
  if (sessionId) rules.push({ scope: 've-chat-session', id: sessionId, max: 60, windowSec: 3600 });
  return rules;
}
export function inquiryLimits(clientId: string, email?: string): LimitRule[] {
  const rules: LimitRule[] = [
    { scope: 've-inquiry-app-day', id: 'all', max: 200, windowSec: 86400 },
    { scope: 've-inquiry-app', id: 'all', max: 100, windowSec: 3600 },
    { scope: 've-inquiry-client', id: clientId, max: 5, windowSec: 3600 },
  ];
  if (email) rules.push({ scope: 've-inquiry-email', id: email.toLowerCase(), max: 5, windowSec: 3600 });
  return rules;
}
