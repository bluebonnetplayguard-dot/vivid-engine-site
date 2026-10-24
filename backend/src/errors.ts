import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { ZodError } from 'zod';
import type { Response } from 'express';

// Every error leaves the API as JSON: { error: string, code?: string, ...extra }.
// The frontend client reads `error` for messages and `code` for flows such as
// the public visitor challenge.
export class ApiError extends HttpException {
  constructor(status: number, message: string, extra: Record<string, unknown> = {}) {
    super({ error: message, ...extra }, status);
    this.message = message;
  }
}

export const badRequest = (msg: string, extra?: Record<string, unknown>) => new ApiError(400, msg, extra);
export const unauthorized = (msg = 'Sign in to continue.') => new ApiError(401, msg, { code: 'AUTH_REQUIRED' });
export const forbidden = (msg = 'You do not have access to this.') => new ApiError(403, msg);
export const notFound = (msg = 'Not found.') => new ApiError(404, msg);
export const tooMany = (msg = 'Too many requests. Please wait a moment and try again.') => new ApiError(429, msg);

@Catch()
export class JsonErrorFilter implements ExceptionFilter {
  private readonly log = new Logger('Error');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (res.headersSent) return;

    if (exception instanceof ZodError) {
      const first = exception.issues[0];
      res.status(400).json({ error: first ? `${first.path.join('.') || 'input'}: ${first.message}` : 'Invalid input.' });
      return;
    }
    if (exception instanceof ThrottlerException) {
      res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
      return;
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body && 'error' in body && typeof (body as any).error === 'string' && !('statusCode' in body)) {
        res.status(status).json(body);
      } else {
        const message = typeof body === 'string' ? body : (body as any)?.message;
        res.status(status).json({ error: Array.isArray(message) ? message.join(', ') : message || exception.message });
      }
      return;
    }
    this.log.error(exception instanceof Error ? exception.stack : String(exception));
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Something went wrong on our side. Please try again.' });
  }
}
