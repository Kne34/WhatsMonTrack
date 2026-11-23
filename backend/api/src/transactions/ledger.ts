import { Prisma } from '@prisma/client';

export interface LedgerEntry {
  type: string;
  amount: number | bigint;
  fromAccountId: string | null;
  toAccountId: string | null;
  /** false: a report-only record (e.g. the expense made when a debt is settled); balances never change */
  affectsBalance?: boolean;
}

/**
 * Applies (direction = 1) or reverses (direction = -1) a transaction's effect on account balances.
 * EXPENSE debits `from`, INCOME credits `to`, TRANSFER does both. Other types have no balance effect,
 * and neither do report-only records (`affectsBalance: false`): this is the single place that rule lives,
 * so editing, deleting or reversing such a record can never count its money twice.
 * Must run inside a Prisma $transaction so the record and balances change atomically.
 */
export async function applyToBalances(tx: Prisma.TransactionClient, entry: LedgerEntry, direction: 1 | -1) {
  if (entry.affectsBalance === false) return;
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
