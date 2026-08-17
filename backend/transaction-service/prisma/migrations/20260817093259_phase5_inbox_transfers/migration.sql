/*
  Warnings:

  - You are about to drop the column `accountId` on the `Transaction` table. All the data in the column will be lost.
  - The `type` column on the `Transaction` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('EXPENSE', 'INCOME', 'TRANSFER', 'DEBT_OUT', 'DEBT_IN');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('CONFIRMED', 'NEEDS_REVIEW');

-- DropForeignKey
ALTER TABLE "Transaction" DROP CONSTRAINT "Transaction_accountId_fkey";

-- AlterTable
ALTER TABLE "Transaction" DROP COLUMN "accountId",
ADD COLUMN     "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
ADD COLUMN     "fromAccountId" TEXT,
ADD COLUMN     "status" "TransactionStatus" NOT NULL DEFAULT 'CONFIRMED',
ADD COLUMN     "toAccountId" TEXT,
DROP COLUMN "type",
ADD COLUMN     "type" "TransactionType" NOT NULL DEFAULT 'EXPENSE';

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
