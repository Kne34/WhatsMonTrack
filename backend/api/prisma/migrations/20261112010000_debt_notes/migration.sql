-- Utang-piutang notes: a simple list of who owes whom, separate from transactions and balances
CREATE TABLE "DebtNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "person" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "paid" BIGINT NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DebtNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DebtNote_userId_idx" ON "DebtNote"("userId");

ALTER TABLE "DebtNote" ADD CONSTRAINT "DebtNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
