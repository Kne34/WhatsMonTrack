-- 1) Money: FLOAT -> BIGINT (whole rupiah). Exact integers, no rounding drift.
--    Existing values are rounded to the nearest rupiah.
ALTER TABLE "Account"     ALTER COLUMN "balance" DROP DEFAULT;
ALTER TABLE "Account"     ALTER COLUMN "balance" TYPE BIGINT USING ROUND("balance")::BIGINT;
ALTER TABLE "Account"     ALTER COLUMN "balance" SET DEFAULT 0;

ALTER TABLE "Transaction" ALTER COLUMN "amount"  TYPE BIGINT USING ROUND("amount")::BIGINT;

ALTER TABLE "Budget"      ALTER COLUMN "limit"   DROP DEFAULT;
ALTER TABLE "Budget"      ALTER COLUMN "limit"   TYPE BIGINT USING ROUND("limit")::BIGINT;
ALTER TABLE "Budget"      ALTER COLUMN "limit"   SET DEFAULT 0;

-- 2) Per-user IANA timezone for day/month boundaries (timestamps stay in UTC).
ALTER TABLE "User" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta';

-- 3) Idempotency key: the WhatsApp message a transaction was recorded from.
ALTER TABLE "Transaction" ADD COLUMN "sourceMessageId" TEXT;
CREATE UNIQUE INDEX "Transaction_sourceMessageId_key" ON "Transaction"("sourceMessageId");

-- 4) Remove never-used schema.
ALTER TABLE "Transaction" DROP COLUMN "isDeleted";
ALTER TABLE "Transaction" DROP COLUMN "deletedAt";
DROP TABLE "Session";
DROP TABLE "Category";

-- Every user now has a real email and bcrypt password; drop the placeholder default.
ALTER TABLE "User" ALTER COLUMN "password" DROP DEFAULT;
