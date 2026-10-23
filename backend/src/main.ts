import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { config } from './config';
import { runMigrations } from './db';
import { RateLimiter } from './rate-limit';
import { SeoPages } from './seo';

async function bootstrap() {
  const log = new Logger('Boot');
  await runMigrations(msg => log.log(msg));

  // rawBody is needed to verify Stripe webhook signatures.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  app.setGlobalPrefix('api');
  app.set('trust proxy', 1); // Nginx or App Platform sits in front; req.ip is the visitor's address.
  // The site uses inline styles and third-party fonts/payment widgets, so no strict CSP here.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, referrerPolicy: { policy: 'strict-origin-when-cross-origin' } }));
  app.use(cookieParser());
  // gzip responses (scripts, styles, HTML, JSON). Nginx passes already-compressed responses
  // through, and App Platform or direct access gets compression too. Streams (live updates
  // and AI Search answers, both server-sent events) are excluded: compression would hold them back.
  app.use(compression({
    filter: (req: Request, res: Response) => req.path !== '/api/events' && req.path !== '/api/ai-search/ask' && compression.filter(req, res),
  }));
  app.useBodyParser('json', { limit: '600kb' });
  // Video Studio caption audio: 30-second 16 kHz WAV pieces (~1 MB, under Nginx's 1 MB body limit).
  app.useBodyParser('raw', { type: 'audio/wav', limit: '1100kb' });
  app.enableShutdownHooks();
  // No CORS: the site and API share one origin (https://vividenginesolutions.com and /api).

  // Serve the built website from the same process (Docker image sets STATIC_DIR).
  const staticDir = config.STATIC_DIR;
  if (staticDir && existsSync(join(staticDir, 'index.html'))) {
    // App-link files have no extension but must be served as JSON.
    app.use(['/.well-known/apple-app-site-association', '/apple-app-site-association'], (_req: Request, res: Response) => {
      res.type('application/json').sendFile(join(staticDir, '.well-known', 'apple-app-site-association'), { dotfiles: 'allow' });
    });
    app.useStaticAssets(staticDir, {
      index: false,
      dotfiles: 'allow', // /.well-known/assetlinks.json
      setHeaders: (res, path) => {
        if (/[\\/]assets[\\/]/.test(path)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else if (/(sw\.js|index\.html|manifest\.json)$/.test(path)) res.setHeader('Cache-Control', 'no-cache');
        else res.setHeader('Cache-Control', 'public, max-age=3600');
      },
    });
    // Single-page app: other GETs outside /api get index.html with that page's own tags
    // and the right status (see seo.ts). React then takes over in the browser.
    const seo = new SeoPages(staticDir);
    app.use((req: Request, res: Response, next: NextFunction) => {
      if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.startsWith('/api')) return next();
      // One URL per page: /about/ -> /about (permanent), keeping any query string.
      if (req.path.length > 1 && req.path.endsWith('/')) {
        const query = req.originalUrl.slice(req.path.length);
        return res.redirect(301, req.path.replace(/\/+$/, '') + query);
      }
      const page = seo.render(req.path);
      res.status(page.status);
      res.setHeader('Cache-Control', 'no-cache');
      if (page.noindex) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      res.type('html').send(page.html);
    });
    log.log(`Serving website from ${staticDir}${seo.enabled ? ' with per-page SEO tags' : ' (no seo-routes.json: same tags on every page)'}`);
  }

  const limiter = app.get(RateLimiter);
  setInterval(() => limiter.prune().catch(e => log.warn(`Prune failed: ${e.message}`)), 3600_000).unref();

  await app.listen(config.PORT, '0.0.0.0');
  log.log(`Listening on 0.0.0.0:${config.PORT}`);
}

bootstrap().catch(err => {
  console.error(err);
  process.exit(1);
});
