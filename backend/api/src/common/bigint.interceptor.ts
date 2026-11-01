import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map } from 'rxjs';

/**
 * Money is stored as BIGINT and Prisma returns it as JS bigint, which JSON.stringify can't
 * serialize. Convert at this single boundary instead of patching BigInt.prototype globally.
 * Values stay exact: whole rupiah amounts are far below Number.MAX_SAFE_INTEGER (~9e15).
 */
export function bigintToNumber<T>(value: T): T {
  if (typeof value === 'bigint') return Number(value) as T;
  if (Array.isArray(value)) return value.map(bigintToNumber) as T;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, bigintToNumber(v)])) as T;
  }
  return value; // Date, null, primitives, class instances
}

@Injectable()
export class BigIntSerializerInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(map(bigintToNumber));
  }
}
