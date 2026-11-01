import { Prisma } from '@prisma/client';

export interface LedgerEntry {
  type: string;
  amount: number | bigint;
  fromAccountId: string | null;
  toAccountId: string | null;
}

/**
 * Applies (direction = 1) or reverses (direction = -1) a transaction's effect on account balances.
 * EXPENSE debits `from`, INCOME credits `to`, TRANSFER does both. Other types have no balance effect.
 * Must run inside a Prisma $transaction so the record and balances change atomically.
 */
export async function applyToBalances(tx: Prisma.TransactionClient, entry: LedgerEntry, direction: 1 | -1) {
  const amount = Number(entry.amount);
  const debitsFrom = entry.type === 'EXPENSE' || entry.type === 'TRANSFER';
  const creditsTo = entry.type === 'INCOME' || entry.type === 'TRANSFER';

  if (debitsFrom && entry.fromAccountId) {
    await tx.account.update({
      where: { id: entry.fromAccountId },
      data: { balance: { increment: -amount * direction } },
    });
  }
  if (creditsTo && entry.toAccountId) {
    await tx.account.update({
      where: { id: entry.toAccountId },
      data: { balance: { increment: amount * direction } },
    });
  }
}
