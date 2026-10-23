import { CanActivate, ExecutionContext, Injectable, SetMetadata, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import jwt from 'jsonwebtoken';
import type { Request } from 'express';
import { config } from '../config';
import { forbidden, unauthorized } from '../errors';

export interface AuthUser {
  id: string;
  email: string;
  role: 'user' | 'admin';
  full_name: string | null;
}

export type Access = 'public' | 'user' | 'admin';
const ACCESS_KEY = 'access';

// Routes are signed-in-only unless marked otherwise.
export const Public = () => SetMetadata(ACCESS_KEY, 'public');
export const AdminOnly = () => SetMetadata(ACCESS_KEY, 'admin');

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser | null => {
  return ctx.switchToHttp().getRequest().user ?? null;
});

export function signAccessToken(user: AuthUser): string {
  return jwt.sign(
    { email: user.email, role: user.role, name: user.full_name ?? undefined },
    config.JWT_ACCESS_SECRET,
    { subject: user.id, expiresIn: config.ACCESS_TOKEN_TTL_SECONDS, issuer: 'vivid-engine-api', audience: 'vivid-engine' },
  );
}

export function readAccessToken(req: Request): AuthUser | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  try {
    const payload = jwt.verify(header.slice(7), config.JWT_ACCESS_SECRET, {
      issuer: 'vivid-engine-api', audience: 'vivid-engine', algorithms: ['HS256'],
    }) as jwt.JwtPayload;
    return { id: String(payload.sub), email: payload.email, role: payload.role === 'admin' ? 'admin' : 'user', full_name: payload.name ?? null };
  } catch {
    return null;
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser | null }>();
    req.user = readAccessToken(req);
    const access = this.reflector.getAllAndOverride<Access>(ACCESS_KEY, [ctx.getHandler(), ctx.getClass()]) ?? 'user';
    if (access === 'public') return true;
    if (!req.user) throw unauthorized();
    if (access === 'admin' && req.user.role !== 'admin') throw forbidden('Admin access is required.');
    return true;
  }
}
