import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { BigIntSerializerInterceptor } from './common/bigint.interceptor';

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

  // Money columns are BIGINT; serialize them as JSON numbers
  app.useGlobalInterceptors(new BigIntSerializerInterceptor());
  return app;
}
