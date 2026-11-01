-- Accounts are created with email only; the WhatsApp number is linked after login
-- by sending "VERIFIKASI <code>" to the bot from that number (proves ownership).
ALTER TABLE "User" ALTER COLUMN "phoneNumber" DROP NOT NULL;

ALTER TABLE "User" DROP COLUMN "phoneOtpCode";
ALTER TABLE "User" ADD COLUMN "phoneLinkCode" TEXT;
ALTER TABLE "User" ADD COLUMN "phoneLinkExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "pendingPhone" TEXT;

CREATE UNIQUE INDEX "User_phoneLinkCode_key" ON "User"("phoneLinkCode");
