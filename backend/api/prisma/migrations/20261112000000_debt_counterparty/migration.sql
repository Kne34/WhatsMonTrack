-- Person a lending/debt transaction (category DEBT) is with, so the Utang page can total it per person
ALTER TABLE "Transaction" ADD COLUMN "counterparty" TEXT;
CREATE INDEX "Transaction_userId_category_idx" ON "Transaction"("userId", "category");
