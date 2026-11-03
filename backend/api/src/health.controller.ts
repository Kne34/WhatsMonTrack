import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

/**
 * Liveness check for the host (Render health check, uptime pingers). Deliberately touches no
 * database, so pinging it keeps the API awake without keeping the (separately billed) database awake.
 */
@SkipThrottle()
@Controller('api/health')
export class HealthController {
  @Get()
  check() {
    return { ok: true };
  }
}
