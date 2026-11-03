import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { BigIntSerializerInterceptor } from './common/bigint.interceptor';

/** Shared HTTP setup, used by main.ts and the integration tests so both behave identically. */
export function configureApp(app: NestExpressApplication) {
  // Behind a reverse proxy (nginx, or Render's load balancer): take the client IP from X-Forwarded-For
  // so rate limiting is per client. TRUST_PROXY_HOPS = number of proxies in front of the API.
  app.set('trust proxy', trustProxyHops());

  // Frontend on another origin (e.g. Vercel): allow exactly those origins. Auth uses a Bearer
  // header, not cookies, so credentials are not needed.
  const origins = allowedOrigins();
  if (origins.length > 0) {
    app.enableCors({ origin: origins, methods: ['GET', 'POST', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'], maxAge: 86400 });
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown fields (e.g. userId) before they reach services
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Money columns are BIGINT; serialize them as JSON numbers
  app.useGlobalInterceptors(new BigIntSerializerInterceptor());
  return app;
}

export function trustProxyHops(env: NodeJS.ProcessEnv = process.env) {
  const hops = Number(env.TRUST_PROXY_HOPS);
  return Number.isInteger(hops) && hops >= 0 ? hops : 1;
}

/** FRONTEND_ORIGIN: comma-separated, e.g. "https://whatsmontrack.vercel.app" (no trailing slash). */
export function allowedOrigins(env: NodeJS.ProcessEnv = process.env) {
  return (env.FRONTEND_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}
