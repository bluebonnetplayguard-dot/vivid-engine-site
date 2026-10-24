import { Injectable } from '@nestjs/common';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { config } from '../config';
import { ApiError } from '../errors';
import { RateLimiter, issuanceLimits } from '../rate-limit';

// Anonymous-visitor abuse control for chatAssistant and submitInquiry, ported
// from base44/shared/publicClient.ts (same handshake the frontend already speaks):
//   no token          -> 428 PUBLIC_CLIENT_CHALLENGE (+ signed challenge)
//   valid proof       -> 428 PUBLIC_CLIENT_REQUIRED (+ 24-hour visitor token)
//   bad token/proof   -> 403 PUBLIC_CLIENT_INVALID
//   valid token       -> request proceeds with that visitor id
// The proof is a nonce where sha256(`${challenge}:${nonce}`) starts 0x00 0x00 and a third byte < 64.
// Not authentication: every issuance also spends shared app-wide budgets.

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const TOKEN = new RegExp(`^(${UUID})\\.(\\d{13})\\.([0-9a-f]{64})$`);
const LIFETIME_MS = 24 * 60 * 60 * 1000;

const mac = (kind: string, id: string, expires: string) =>
  createHmac('sha256', config.PUBLIC_CLIENT_SECRET).update(`vivid-public-rate-client:v3:${kind}:${id}.${expires}`).digest('hex');

@Injectable()
export class PublicClients {
  constructor(private readonly limiter: RateLimiter) {}

  private verifyToken(value: unknown, kind: string): RegExpExecArray | null {
    const match = typeof value === 'string' && value.length <= 128 ? TOKEN.exec(value) : null;
    if (!match) return null;
    const expected = mac(kind, match[1], match[2]);
    return timingSafeEqual(Buffer.from(expected), Buffer.from(match[3])) ? match : null;
  }

  private sign(kind: string, id: string, expires: number) {
    return `${id}.${expires}.${mac(kind, id, String(expires))}`;
  }

  private invalid(): never {
    throw new ApiError(403, 'Invalid visitor token.', { code: 'PUBLIC_CLIENT_INVALID' });
  }

  // Returns the verified visitor id, or throws the step the browser should take next.
  async verify(body: Record<string, any>): Promise<string> {
    const token = body?.rateLimitToken;
    let id: string | undefined;
    if (token !== undefined && token !== null && token !== '') {
      const match = this.verifyToken(token, 'token');
      if (!match) this.invalid();
      id = match[1];
      if (Number(match[2]) > Date.now()) return id;
    }
    // Shared budget for challenge redemption and expired-token renewal.
    const retryAfter = await this.limiter.check(issuanceLimits());
    if (retryAfter) throw new ApiError(429, 'Too many requests. Please try again later.', { retryAfter });

    if (!id) {
      const proof = body?.rateLimitProof;
      if (!proof) {
        throw new ApiError(428, 'Visitor verification required.', {
          code: 'PUBLIC_CLIENT_CHALLENGE', challenge: this.sign('challenge', randomUUID(), Date.now() + 5 * 60 * 1000),
        });
      }
      const challenge = this.verifyToken(proof.challenge, 'challenge');
      const nonce = proof.nonce;
      if (!challenge || Number(challenge[2]) <= Date.now() || !Number.isSafeInteger(nonce) || nonce < 0 || nonce > 0xffffffff) this.invalid();
      const digest = createHash('sha256').update(`${proof.challenge}:${nonce}`).digest();
      if (digest[0] !== 0 || digest[1] !== 0 || digest[2] >= 64) this.invalid(); // 18 bits of work
      id = challenge[1]; // replaying a proof yields the same bucket, never a fresh allowance
    }
    throw new ApiError(428, 'Visitor verification required.', {
      code: 'PUBLIC_CLIENT_REQUIRED', rateLimitToken: this.sign('token', id, Date.now() + LIFETIME_MS),
    });
  }
}
