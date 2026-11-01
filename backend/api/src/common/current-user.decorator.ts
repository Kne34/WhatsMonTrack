import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtUser } from './config';

/** Injects the JWT payload set by AuthGuard. Use only on guarded routes. */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): JwtUser => ctx.switchToHttp().getRequest().user,
);
