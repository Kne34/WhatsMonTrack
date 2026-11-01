import { Logger } from '@nestjs/common';

const logger = new Logger('Config');

/**
 * Returns the JWT secret or aborts startup. There is intentionally no fallback:
 * a hardcoded default would let anyone forge tokens.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      'JWT_SECRET is not set. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
    );
  }
  if (secret.length < 32) {
    logger.warn('JWT_SECRET is shorter than 32 characters; use a long random value.');
  }
  return secret;
}

/** Emails (comma-separated in ADMIN_EMAILS) allowed to manage the shared WhatsApp bot session. */
export function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdmin(email?: string): boolean {
  return !!email && getAdminEmails().includes(email.toLowerCase());
}

/** JWT payload. The phone number is deliberately not included: it can be (re)linked at any time. */
export interface JwtUser {
  id: string;
  email?: string;
}
