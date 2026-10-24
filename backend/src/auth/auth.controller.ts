import { Body, Controller, Get, HttpCode, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';
import { config, isProd } from '../config';
import { ApiError, badRequest } from '../errors';
import { RateLimiter } from '../rate-limit';
import { AuthService, Session, toPublicUser } from './auth.service';
import { AuthUser, CurrentUser, Public } from './guard';

const REFRESH_COOKIE = 've_refresh';
const OAUTH_COOKIE = 've_oauth';
const googleRedirectUri = `${config.PUBLIC_ORIGIN}/api/auth/google/callback`;

// Only same-origin paths with exactly one leading slash (blocks //evil.com and /\evil.com).
export function safePath(raw: unknown): string {
  if (typeof raw !== 'string' || !raw) return '/';
  try {
    const url = new URL(raw, config.PUBLIC_ORIGIN);
    if (url.origin !== new URL(config.PUBLIC_ORIGIN).origin) return '/';
    const path = url.pathname + url.search;
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) return '/';
    return path;
  } catch {
    return '/';
  }
}

@Controller('auth')
@Throttle({ default: { limit: 20, ttl: 60_000 } })
export class AuthController {
  private readonly google = config.GOOGLE_CLIENT_ID
    ? new OAuth2Client(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET, googleRedirectUri)
    : null;

  constructor(private readonly auth: AuthService, private readonly limiter: RateLimiter) {}

  private setRefreshCookie(res: Response, token: string) {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true, secure: isProd, sameSite: 'lax', path: '/api/auth',
      maxAge: config.REFRESH_TOKEN_TTL_DAYS * 24 * 3600 * 1000,
    });
  }

  private respond(res: Response, session: Session) {
    this.setRefreshCookie(res, session.refresh_token);
    return { access_token: session.access_token, user: session.user };
  }

  @Public() @Post('register') @HttpCode(200)
  async register(@Body() body: { email: string; password: string }, @Req() req: Request) {
    await this.limiter.hit(`register:${req.ip}`, 10, 3600);
    await this.auth.register(body?.email, body?.password);
    return { success: true };
  }

  @Public() @Post('verify-otp') @HttpCode(200)
  async verifyOtp(@Body() body: { email: string; otpCode: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.limiter.hit(`otp:${String(body?.email).toLowerCase()}`, 10, 900);
    return this.respond(res, await this.auth.verifyCode(body?.email, body?.otpCode, req.headers['user-agent']));
  }

  @Public() @Post('resend-otp') @HttpCode(200)
  async resendOtp(@Body() body: { email: string }) {
    await this.limiter.hit(`resend:${String(body?.email).toLowerCase()}`, 5, 3600);
    await this.auth.resendCode(body?.email);
    return { success: true };
  }

  @Public() @Post('login') @HttpCode(200)
  async login(@Body() body: { email: string; password: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.limiter.hit(`login:${String(body?.email).toLowerCase()}`, 10, 900, 'Too many sign-in attempts. Wait 15 minutes or reset your password.');
    await this.limiter.hit(`login-ip:${req.ip}`, 50, 900);
    return this.respond(res, await this.auth.login(body?.email, body?.password, req.headers['user-agent']));
  }

  @Public() @Post('refresh') @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      return this.respond(res, await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], req.headers['user-agent']));
    } catch (e) {
      res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
      throw e;
    }
  }

  @Public() @Post('logout') @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    return { success: true };
  }

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const row = await this.auth.findById(user.id);
    if (!row) throw new ApiError(401, 'Sign in to continue.', { code: 'AUTH_REQUIRED' });
    return toPublicUser(row);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() body: { full_name?: string }) {
    return this.auth.updateProfile(user.id, body?.full_name);
  }

  @Public() @Post('reset-password-request') @HttpCode(200)
  async resetRequest(@Body() body: { email: string }, @Req() req: Request) {
    await this.limiter.hit(`reset:${req.ip}`, 10, 3600);
    await this.auth.requestPasswordReset(body?.email);
    return { success: true }; // Same answer whether or not the account exists.
  }

  @Public() @Post('reset-password') @HttpCode(200)
  async reset(@Body() body: { resetToken: string; newPassword: string }) {
    await this.auth.resetPassword(body?.resetToken, body?.newPassword);
    return { success: true };
  }

  // --- Google sign-in (server-side authorization code flow) ---

  @Public() @Get('google')
  startGoogle(@Query('returnTo') returnTo: string, @Res() res: Response) {
    if (!this.google) throw badRequest('Google sign-in is not configured.');
    const nonce = randomBytes(16).toString('base64url');
    const state = jwt.sign({ nonce, returnTo: safePath(returnTo) }, config.JWT_ACCESS_SECRET, { expiresIn: 600 });
    res.cookie(OAUTH_COOKIE, nonce, { httpOnly: true, secure: isProd, sameSite: 'lax', path: '/api/auth/google', maxAge: 600_000 });
    res.redirect(this.google.generateAuthUrl({ scope: ['openid', 'email', 'profile'], state, prompt: 'select_account' }));
  }

  @Public() @Get('google/callback')
  async googleCallback(@Query('code') code: string, @Query('state') state: string, @Req() req: Request, @Res() res: Response) {
    const fail = (reason: string) => res.redirect(`/login?error=${encodeURIComponent(reason)}`);
    if (!this.google || !code || !state) return fail('Google sign-in was cancelled.');
    let returnTo = '/';
    try {
      const decoded = jwt.verify(state, config.JWT_ACCESS_SECRET) as { nonce: string; returnTo: string };
      if (!decoded.nonce || decoded.nonce !== req.cookies?.[OAUTH_COOKIE]) return fail('Google sign-in expired. Please try again.');
      returnTo = safePath(decoded.returnTo);
      const { tokens } = await this.google.getToken(code);
      const ticket = await this.google.verifyIdToken({ idToken: tokens.id_token, audience: config.GOOGLE_CLIENT_ID });
      const p = ticket.getPayload();
      if (!p?.sub || !p.email || !p.email_verified) return fail('Your Google account email is not verified.');
      const session = await this.auth.loginWithGoogle(p.sub, p.email, p.name, req.headers['user-agent']);
      res.clearCookie(OAUTH_COOKIE, { path: '/api/auth/google' });
      this.setRefreshCookie(res, session.refresh_token);
      return res.redirect(returnTo);
    } catch {
      return fail('Google sign-in failed. Please try again.');
    }
  }
}
