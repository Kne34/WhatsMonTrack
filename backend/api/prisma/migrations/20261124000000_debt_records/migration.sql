-- Utang-piutang v2: records with participants and real-time cash flow.
-- The old system is removed: the DEBT category and its transactions (balances are left as they are,
-- that money really moved), the person column, and the to-do style notes.
DELETE FROM "Transaction" WHERE upper("category") = 'DEBT';
ALTER TABLE "Transaction" DROP COLUMN "counterparty";
DROP TABLE "DebtNote";

ALTER TABLE "Transaction" ADD COLUMN "affectsBalance" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "inReports" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "debtRecordId" TEXT;

CREATE TABLE "DebtRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "totalAmount" BIGINT NOT NULL,
    "category" TEXT NOT NULL,
    "accountId" TEXT,
    "addToBalance" BOOLEAN NOT NULL DEFAULT false,
    "recordExpense" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "settledAt" TIMESTAMP(3),
    "settledDifference" BIGINT,
    "initialCashflowTxId" TEXT,
    "linkedTransactionId" TEXT,
    "sourceMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DebtRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DebtParticipant" (
    "id" TEXT NOT NULL,
    "debtRecordId" TEXT NOT NULL,
    "personName" TEXT NOT NULL,
    "expectedAmount" BIGINT NOT NULL DEFAULT 0,
    "paidAmount" BIGINT NOT NULL DEFAULT 0,
    "paidAccountId" TEXT,
    "paymentCashflowTxId" TEXT,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DebtParticipant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DebtRecord_sourceMessageId_key" ON "DebtRecord"("sourceMessageId");
CREATE INDEX "DebtRecord_userId_status_idx" ON "DebtRecord"("userId", "status");
CREATE INDEX "DebtParticipant_debtRecordId_idx" ON "DebtParticipant"("debtRecordId");
CREATE INDEX "Transaction_debtRecordId_idx" ON "Transaction"("debtRecordId");

ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_debtRecordId_fkey" FOREIGN KEY ("debtRecordId") REFERENCES "DebtRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DebtRecord" ADD CONSTRAINT "DebtRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DebtRecord" ADD CONSTRAINT "DebtRecord_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DebtParticipant" ADD CONSTRAINT "DebtParticipant_debtRecordId_fkey" FOREIGN KEY ("debtRecordId") REFERENCES "DebtRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DebtParticipant" ADD CONSTRAINT "DebtParticipant_paidAccountId_fkey" FOREIGN KEY ("paidAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
