-- The auth columns below were originally added with `prisma db push` and never got a migration,
-- so a fresh database built from migrations lacked them. This migration is idempotent:
-- a no-op on databases that already have the columns, and creates them on fresh ones.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "email" TEXT;
UPDATE "User" SET "email" = gen_random_uuid()::text WHERE "email" IS NULL;
ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "password" TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "otpCode" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "otpExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
