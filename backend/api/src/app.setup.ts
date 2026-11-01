import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';

/** Shared HTTP setup, used by main.ts and the integration tests so both behave identically. */
export function configureApp(app: NestExpressApplication) {
  // Behind nginx: take the client IP from X-Forwarded-For (one hop) so rate limiting is per client
  app.set('trust proxy', 1);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown fields (e.g. userId) before they reach services
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  return app;
}
