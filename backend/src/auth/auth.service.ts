import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { adminEmails, config } from '../config';
import { Db } from '../db';
import { ApiError, badRequest, unauthorized } from '../errors';
import { Mail } from '../mail';
import { AuthUser, signAccessToken } from './guard';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const normalizeEmail = (e: string) => String(e || '').trim().toLowerCase();

interface UserRow {
  id: string;
  email: string;
  password_hash: string | null;
  full_name: string | null;
  role: 'user' | 'admin';
  email_verified: boolean;
  google_sub: string | null;
  created_date: string;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  user: PublicUser;
}

export interface PublicUser {
  id: string;
  email: string;
  full_name: string | null;
  role: 'user' | 'admin';
  created_date: string;
}

export const toPublicUser = (u: UserRow): PublicUser => ({
  id: u.id, email: u.email, full_name: u.full_name, role: u.role, created_date: u.created_date,
});

@Injectable()
export class AuthService {
  constructor(private readonly db: Db, private readonly mail: Mail) {}

  findByEmail(email: string) {
    return this.db.one<UserRow>('SELECT * FROM users WHERE email = $1', [normalizeEmail(email)]);
  }

  findById(id: string) {
    return this.db.one<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
  }

  validatePassword(password: string) {
    if (typeof password !== 'string' || password.length < 8) throw badRequest('Use at least 8 characters for your password.');
    if (password.length > 200) throw badRequest('That password is too long.');
  }

  async register(emailInput: string, password: string) {
    const email = normalizeEmail(emailInput);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('Enter a valid email address.');
    this.validatePassword(password);
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    const existing = await this.findByEmail(email);
    if (existing?.email_verified) throw new ApiError(409, 'An account with this email already exists. Sign in instead.');
    const user = existing
      ? await this.db.one<UserRow>('UPDATE users SET password_hash = $2, updated_date = now() WHERE id = $1 RETURNING *', [existing.id, hash])
      : await this.db.one<UserRow>('INSERT INTO users(email, password_hash) VALUES ($1, $2) RETURNING *', [email, hash]);
    await this.sendVerificationCode(user);
  }

  async sendVerificationCode(user: UserRow) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.db.query(`UPDATE auth_codes SET used_at = now() WHERE user_id = $1 AND purpose = 'verify_email' AND used_at IS NULL`, [user.id]);
    await this.db.query(
      `INSERT INTO auth_codes(user_id, purpose, code_hash, expires_at) VALUES ($1, 'verify_email', $2, now() + interval '15 minutes')`,
      [user.id, sha256(code)],
    );
    await this.mail.send(user.email, `Your Vivid Engine verification code: ${code}`,
      `Your verification code is ${code}.\n\nIt expires in 15 minutes. If you did not create a Vivid Engine Solutions account, you can ignore this email.`);
  }

  async resendCode(email: string) {
    const user = await this.findByEmail(email);
    if (user && !user.email_verified) await this.sendVerificationCode(user);
  }

  async verifyCode(email: string, code: string, userAgent?: string): Promise<Session> {
    const user = await this.findByEmail(email);
    if (!user) throw badRequest('That code is invalid or has expired.');
    const row = await this.db.one<{ id: string; code_hash: string; attempts: number }>(
      `SELECT id, code_hash, attempts FROM auth_codes
        WHERE user_id = $1 AND purpose = 'verify_email' AND used_at IS NULL AND expires_at > now()
        ORDER BY created_at DESC LIMIT 1`,
      [user.id],
    );
    if (!row || row.attempts >= 5) throw badRequest('That code is invalid or has expired. Request a new code.');
    const ok = timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(sha256(String(code || '').trim())));
    if (!ok) {
      await this.db.query('UPDATE auth_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]);
      throw badRequest('That code is not correct.');
    }
    await this.db.query('UPDATE auth_codes SET used_at = now() WHERE id = $1', [row.id]);
    const verified = await this.db.one<UserRow>(
      `UPDATE users SET email_verified = true, role = CASE WHEN $2 THEN 'admin' ELSE role END, updated_date = now() WHERE id = $1 RETURNING *`,
      [user.id, adminEmails.has(user.email)],
    );
    return this.createSession(verified, userAgent);
  }

  async login(email: string, password: string, userAgent?: string): Promise<Session> {
    const user = await this.findByEmail(email);
    // Hash anyway so response time does not reveal whether the account exists.
    const valid = user?.password_hash
      ? await argon2.verify(user.password_hash, String(password || ''))
      : (await argon2.hash('timing-equalizer'), false);
    if (!user || !valid) throw new ApiError(401, 'Invalid email or password.');
    if (!user.email_verified) {
      await this.sendVerificationCode(user);
      throw new ApiError(403, 'Verify your email first. We just sent you a new code.', { code: 'EMAIL_NOT_VERIFIED' });
    }
    return this.createSession(user, userAgent);
  }

  // Google sign-in: link by Google subject id, else by verified email, else create.
  async loginWithGoogle(sub: string, emailInput: string, name: string | undefined, userAgent?: string): Promise<Session> {
    const email = normalizeEmail(emailInput);
    let user = await this.db.one<UserRow>('SELECT * FROM users WHERE google_sub = $1', [sub]);
    if (!user) {
      user = await this.db.one<UserRow>(
        `INSERT INTO users(email, full_name, email_verified, google_sub, role)
         VALUES ($1, $2, true, $3, CASE WHEN $4 THEN 'admin' ELSE 'user' END)
         ON CONFLICT (email) DO UPDATE SET google_sub = EXCLUDED.google_sub, email_verified = true,
           full_name = COALESCE(users.full_name, EXCLUDED.full_name), updated_date = now()
         RETURNING *`,
        [email, name ?? null, sub, adminEmails.has(email)],
      );
    }
    return this.createSession(user, userAgent);
  }

  async createSession(user: UserRow, userAgent?: string): Promise<Session> {
    const refresh = randomBytes(48).toString('base64url');
    await this.db.query(
      `INSERT INTO refresh_tokens(user_id, token_hash, expires_at, user_agent) VALUES ($1, $2, now() + make_interval(days => $3), $4)`,
      [user.id, sha256(refresh), config.REFRESH_TOKEN_TTL_DAYS, (userAgent || '').slice(0, 300)],
    );
    const authUser: AuthUser = { id: user.id, email: user.email, role: user.role, full_name: user.full_name };
    return { access_token: signAccessToken(authUser), refresh_token: refresh, user: toPublicUser(user) };
  }

  // Rotates the refresh token. Reusing a rotated token revokes every session for that user.
  async refresh(token: string, userAgent?: string): Promise<Session> {
    if (!token) throw unauthorized();
    const row = await this.db.one<{ id: string; user_id: string; revoked_at: string | null; expires_at: string; recently_rotated: boolean }>(
      `SELECT id, user_id, revoked_at, expires_at,
              (replaced_by IS NOT NULL AND revoked_at > now() - interval '60 seconds') AS recently_rotated
         FROM refresh_tokens WHERE token_hash = $1`, [sha256(token)],
    );
    if (!row) throw unauthorized();
    // Two tabs (or a quick reload) can renew with the same cookie at once. A token rotated in
    // the last minute is still honored; it gets its own new session instead of revoking everything.
    if (row.revoked_at && row.recently_rotated && new Date(row.expires_at) > new Date()) {
      const user = await this.findById(row.user_id);
      if (!user) throw unauthorized();
      return this.createSession(user, userAgent);
    }
    if (row.revoked_at) {
      await this.db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [row.user_id]);
      throw unauthorized('Your session ended. Please sign in again.');
    }
    if (new Date(row.expires_at) < new Date()) throw unauthorized('Your session expired. Please sign in again.');
    const user = await this.findById(row.user_id);
    if (!user) throw unauthorized();
    const session = await this.createSession(user, userAgent);
    await this.db.query(
      `UPDATE refresh_tokens SET revoked_at = now(), replaced_by = (SELECT id FROM refresh_tokens WHERE token_hash = $2) WHERE id = $1`,
      [row.id, sha256(session.refresh_token)],
    );
    return session;
  }

  async logout(token: string | undefined) {
    if (token) await this.db.query('UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [sha256(token)]);
  }

  async requestPasswordReset(email: string) {
    const user = await this.findByEmail(email);
    if (!user) return;
    const token = randomBytes(32).toString('base64url');
    await this.db.query(`UPDATE auth_codes SET used_at = now() WHERE user_id = $1 AND purpose = 'reset_password' AND used_at IS NULL`, [user.id]);
    await this.db.query(
      `INSERT INTO auth_codes(user_id, purpose, code_hash, expires_at) VALUES ($1, 'reset_password', $2, now() + interval '1 hour')`,
      [user.id, sha256(token)],
    );
    const link = `${config.PUBLIC_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;
    await this.mail.send(user.email, 'Reset your Vivid Engine password',
      `Someone asked to reset the password for this account.\n\nSet a new password here (the link works for 1 hour):\n${link}\n\nIf this wasn't you, ignore this email and your password stays the same.`);
  }

  async resetPassword(token: string, newPassword: string) {
    this.validatePassword(newPassword);
    const row = await this.db.one<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM auth_codes WHERE purpose = 'reset_password' AND code_hash = $1 AND used_at IS NULL AND expires_at > now()`,
      [sha256(String(token || ''))],
    );
    if (!row) throw badRequest('This reset link is invalid or has expired. Request a new one.');
    const hash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.db.tx(async c => {
      await c.query('UPDATE auth_codes SET used_at = now() WHERE id = $1', [row.id]);
      // A reset link proves control of the inbox, so it also verifies the email.
      await c.query('UPDATE users SET password_hash = $2, email_verified = true, updated_date = now() WHERE id = $1', [row.user_id, hash]);
      await c.query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [row.user_id]);
    });
  }

  async updateProfile(userId: string, fullName: unknown) {
    const name = typeof fullName === 'string' ? fullName.trim().slice(0, 120) : null;
    const user = await this.db.one<UserRow>('UPDATE users SET full_name = $2, updated_date = now() WHERE id = $1 RETURNING *', [userId, name]);
    return toPublicUser(user);
  }
}
