-- Second OTP, delivered via WhatsApp, proves the registrant owns the phone number.
ALTER TABLE "User" ADD COLUMN "phoneOtpCode" TEXT;

-- Normalise phone numbers to the canonical 62xxxxxxxxxx format.
-- Previously the web stored 62xxxx while the WhatsApp bot stored 0xxxx,
-- so the same person could end up with two User rows.

-- 1) Where both forms exist, merge the 0xxxx user into the 62xxxx user.
CREATE TEMP TABLE "_phone_merge" AS
SELECT old_u."id" AS old_id, new_u."id" AS new_id
FROM "User" old_u
JOIN "User" new_u ON new_u."phoneNumber" = '62' || substring(old_u."phoneNumber" from 2)
WHERE old_u."phoneNumber" LIKE '0%';

UPDATE "Account" a SET "userId" = m.new_id FROM "_phone_merge" m WHERE a."userId" = m.old_id;
UPDATE "Transaction" t SET "userId" = m.new_id FROM "_phone_merge" m WHERE t."userId" = m.old_id;

-- Budgets are unique per (user, category): the target user's budget wins on conflict.
DELETE FROM "Budget" b USING "_phone_merge" m
WHERE b."userId" = m.old_id
  AND EXISTS (SELECT 1 FROM "Budget" b2 WHERE b2."userId" = m.new_id AND b2."categoryName" = b."categoryName");
UPDATE "Budget" b SET "userId" = m.new_id FROM "_phone_merge" m WHERE b."userId" = m.old_id;

DELETE FROM "Session" s USING "_phone_merge" m WHERE s."userId" = m.old_id;
DELETE FROM "User" u USING "_phone_merge" m WHERE u."id" = m.old_id;
DROP TABLE "_phone_merge";

-- 2) Convert the remaining 0xxxx numbers.
UPDATE "User" SET "phoneNumber" = '62' || substring("phoneNumber" from 2) WHERE "phoneNumber" LIKE '0%';
