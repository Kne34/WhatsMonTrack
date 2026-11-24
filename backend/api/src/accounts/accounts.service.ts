import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { applyToBalances } from '../transactions/ledger';
import { CreateAccountDto, UpdateAccountDto } from './accounts.dto';

/** "Go-Pay " -> "GOPAY": comparison key that ignores case, spaces and punctuation. */
export const normalizeAccountName = (name: string) =>
  name.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Common synonyms people use for the same account. */
const ACCOUNT_ALIASES: Record<string, string[]> = {
  CASH: ['TUNAI', 'UANGTUNAI'],
  TUNAI: ['CASH', 'UANGTUNAI'],
  UANGTUNAI: ['CASH', 'TUNAI'],
};

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.account.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });
  }

  /** Accounts with the number of transactions (as source or destination) and Utang-piutang records using each. */
  async listWithUsage(userId: string) {
    const [accounts, usage] = await Promise.all([
      this.list(userId),
      this.prisma.$queryRaw<{ id: string; count: bigint }[]>`
        SELECT a."id", COUNT(t."id") AS "count"
        FROM "Account" a
        JOIN "Transaction" t ON t."fromAccountId" = a."id" OR t."toAccountId" = a."id"
        WHERE a."userId" = ${userId}
        GROUP BY a."id"`,
    ]);
    const counts = new Map(usage.map((u) => [u.id, Number(u.count)]));
    const debts = await this.prisma.debtRecord.findMany({
      where: { userId },
      select: {
        accountId: true,
        participants: { select: { paidAccountId: true } },
      },
    });
    const debtCounts = new Map<string, number>();
    for (const d of debts) {
      const ids = new Set(
        [d.accountId, ...d.participants.map((p) => p.paidAccountId)].filter(
          (x): x is string => !!x,
        ),
      );
      for (const accountId of ids)
        debtCounts.set(accountId, (debtCounts.get(accountId) ?? 0) + 1);
    }
    return accounts.map((a) => ({
      ...a,
      transactionCount: counts.get(a.id) ?? 0,
      debtCount: debtCounts.get(a.id) ?? 0,
    }));
  }

  create(userId: string, dto: CreateAccountDto) {
    return this.prisma.account.create({
      data: {
        userId,
        name: dto.name.trim().toUpperCase(),
        balance: dto.initialBalance ?? 0,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateAccountDto) {
    await this.findOwned(userId, id);
    return this.prisma.account.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim().toUpperCase() }),
        ...(dto.balance !== undefined && { balance: dto.balance }),
      },
    });
  }

  /**
   * Deletes an account. An account that is still used by transactions is only deleted together with
   * all of them (`withTransactions`): each confirmed one is reversed first, so transfers give the other
   * account its balance back, exactly as if every transaction had been deleted one by one.
   */
  /**
   * Deletes an account. Refused (409 with `transactionCount` and `debtCount`) while transactions or
   * Utang-piutang records use it, unless `withTransactions` deletes those too. A record goes whole:
   * every cash movement it made is undone, on this account and on any other one a payment went to.
   */
  async remove(userId: string, id: string, withTransactions = false) {
    const account = await this.findOwned(userId, id);
    const used = { userId, OR: [{ fromAccountId: id }, { toAccountId: id }] };

    try {
      return await this.prisma.$transaction(async (tx) => {
        const debts = await tx.debtRecord.findMany({
          where: {
            userId,
            OR: [
              { accountId: id },
              { participants: { some: { paidAccountId: id } } },
            ],
          },
          select: { id: true },
        });
        const debtIds = debts.map((d) => d.id);
        const onAccount = await tx.transaction.count({ where: used });
        if ((onAccount > 0 || debtIds.length > 0) && !withTransactions) {
          const parts = [
            onAccount > 0 ? `${onAccount} transaksi` : null,
            debtIds.length > 0
              ? `${debtIds.length} catatan Utang-piutang`
              : null,
          ].filter(Boolean);
          throw new ConflictException({
            statusCode: 409,
            message: `Rekening "${account.name}" masih dipakai ${parts.join(' dan ')}. Hapus rekening beserta semuanya, atau hapus atau ubah yang memakainya terlebih dahulu.`,
            transactionCount: onAccount,
            debtCount: debtIds.length,
          });
        }
        const transactions = await tx.transaction.findMany({
          where:
            debtIds.length > 0
              ? { OR: [used, { userId, debtRecordId: { in: debtIds } }] }
              : used,
        });
        for (const t of transactions) {
          if (t.status === 'CONFIRMED') await applyToBalances(tx, t, -1);
        }
        await tx.transaction.deleteMany({
          where: { id: { in: transactions.map((t) => t.id) } },
        });
        // Participants go with their record (onDelete: Cascade)
        await tx.debtRecord.deleteMany({ where: { id: { in: debtIds } } });
        await tx.account.delete({ where: { id } });
        return {
          success: true,
          deletedTransactions: onAccount,
          deletedDebts: debtIds.length,
        };
      });
    } catch (err) {
      // A transaction or record was added on this account at the same moment: nothing was deleted
      if ((err as { code?: string }).code === 'P2003') {
        throw new ConflictException(
          'Ada transaksi baru di rekening ini. Muat ulang, lalu coba lagi.',
        );
      }
      throw err;
    }
  }

  /**
   * Used by the WhatsApp bot to match an account name guessed by the AI ("Go Pay", "cash")
   * against the user's existing accounts. Never creates one: an account made from a guess
   * would silently start tracking a balance the user doesn't have.
   */
  async findByName(userId: string, rawName: string) {
    const wanted = normalizeAccountName(rawName);
    if (!wanted) return null;
    const candidates = new Set([wanted, ...(ACCOUNT_ALIASES[wanted] ?? [])]);
    const accounts = await this.list(userId);
    return (
      accounts.find((a) => candidates.has(normalizeAccountName(a.name))) ?? null
    );
  }

  /** Throws 404 unless every given (non-empty) account id belongs to the user. */
  async assertOwned(userId: string, ids: (string | null | undefined)[]) {
    const wanted = [...new Set(ids.filter((id): id is string => !!id))];
    if (wanted.length === 0) return;
    const count = await this.prisma.account.count({
      where: { id: { in: wanted }, userId },
    });
    if (count !== wanted.length)
      throw new NotFoundException('Account not found');
  }

  private async findOwned(userId: string, id: string) {
    const account = await this.prisma.account.findFirst({
      where: { id, userId },
    });
    // 404 (not 403) so other users' IDs can't be probed
    if (!account) throw new NotFoundException('Account not found');
    return account;
  }
}
