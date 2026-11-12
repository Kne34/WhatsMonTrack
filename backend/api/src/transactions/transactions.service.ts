import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { applyToBalances } from './ledger';
import { DEFAULT_TIMEZONE, dayRange, monthRange, zonedParts } from '../common/time';
import { CreateTransactionDataDto, DEBT_CATEGORY, TransactionsQueryDto, TxType, UpdateTransactionDto } from './transactions.dto';

/** Below this AI confidence a transaction is saved as a draft (NEEDS_REVIEW) without touching balances. */
const AUTO_CONFIRM_CONFIDENCE = 0.85;

export interface NewTransaction {
  type: TxType;
  amount: number;
  category?: string | null;
  subcategory?: string | null;
  fromAccountId?: string | null;
  toAccountId?: string | null;
  rawText?: string | null;
  confidence?: number;
  createdAt?: Date;
  /** WhatsApp message id: unique, so a re-delivered message can't be recorded twice */
  sourceMessageId?: string | null;
}

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
  ) {}

  async list(userId: string, query: TransactionsQueryDto) {
    const { month, year, day, page = 1, limit = 100 } = query;
    const where: Prisma.TransactionWhereInput = { userId };

    if (month && year) {
      // Calendar boundaries in the user's zone (not the server's), as a UTC [start, end) range
      const tz = await this.timezoneOf(userId);
      const { start, end } = day ? dayRange(year, month, day, tz) : monthRange(year, month, tz);
      where.createdAt = { gte: start, lt: end };
    }

    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { fromAccount: true, toAccount: true },
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Creates a transaction and, when confirmed, updates balances atomically.
   * Account ownership must already be guaranteed by the caller.
   */
  async create(userId: string, input: NewTransaction) {
    const confidence = input.confidence ?? 1.0;
    const status = confidence < AUTO_CONFIRM_CONFIDENCE ? 'NEEDS_REVIEW' : 'CONFIRMED';

    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          userId,
          type: input.type,
          amount: input.amount,
          category: input.category || 'UNCATEGORIZED',
          subcategory: input.subcategory || null,
          fromAccountId: input.fromAccountId || null,
          toAccountId: input.toAccountId || null,
          rawText: input.rawText ?? null,
          sourceMessageId: input.sourceMessageId ?? null,
          confidenceScore: confidence,
          status,
          ...(input.createdAt && { createdAt: input.createdAt }),
        },
      });

      if (status === 'CONFIRMED') {
        await applyToBalances(tx, transaction, 1);
      }

      const [fromAccount, toAccount] = await Promise.all([
        transaction.fromAccountId ? tx.account.findUnique({ where: { id: transaction.fromAccountId } }) : null,
        transaction.toAccountId ? tx.account.findUnique({ where: { id: transaction.toAccountId } }) : null,
      ]);
      return { transaction, fromAccount, toAccount };
    });
  }

  async createManual(userId: string, dto: CreateTransactionDataDto) {
    await this.accounts.assertOwned(userId, [dto.fromAccountId, dto.toAccountId]);
    const { transaction } = await this.create(userId, {
      ...dto,
      rawText: 'Manual Input',
      confidence: 1.0,
      createdAt: dto.createdAt ? new Date(dto.createdAt) : undefined,
    });
    return { success: true, transaction };
  }

  async confirm(userId: string, id: string) {
    const transaction = await this.findOwned(userId, id);
    if (transaction.status === 'CONFIRMED') {
      return { success: false, message: 'Transaction already confirmed' };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.transaction.update({ where: { id }, data: { status: 'CONFIRMED' } });
      await applyToBalances(tx, transaction, 1);
    });
    return { success: true };
  }

  async update(userId: string, id: string, dto: UpdateTransactionDto) {
    const transaction = await this.findOwned(userId, id);
    await this.accounts.assertOwned(userId, [dto.fromAccountId, dto.toAccountId]);

    await this.prisma.$transaction(async (tx) => {
      if (transaction.status === 'CONFIRMED') {
        await applyToBalances(tx, transaction, -1);
      }

      const updated = await tx.transaction.update({
        where: { id },
        data: {
          type: dto.type ?? transaction.type,
          amount: dto.amount ?? transaction.amount,
          category: dto.category ?? transaction.category,
          subcategory: dto.subcategory !== undefined ? dto.subcategory : transaction.subcategory,
          fromAccountId: dto.fromAccountId !== undefined ? dto.fromAccountId : transaction.fromAccountId,
          toAccountId: dto.toAccountId !== undefined ? dto.toAccountId : transaction.toAccountId,
          createdAt: dto.createdAt ? new Date(dto.createdAt) : transaction.createdAt,
        },
      });

      if (updated.status === 'CONFIRMED') {
        await applyToBalances(tx, updated, 1);
      }
    });
    return { success: true };
  }

  async remove(userId: string, id: string) {
    const transaction = await this.findOwned(userId, id);

    await this.prisma.$transaction(async (tx) => {
      if (transaction.status === 'CONFIRMED') {
        await applyToBalances(tx, transaction, -1);
      }
      await tx.transaction.delete({ where: { id } });
    });
    return { success: true };
  }

  /** Confirmed income/expense totals (lending/debt kept apart) for the calendar month (in the user's zone) containing `date`. */
  async monthlySummary(userId: string, date = new Date()) {
    const tz = await this.timezoneOf(userId);
    const { year, month } = zonedParts(date, tz);
    const { start, end } = monthRange(year, month, tz);

    const transactions = await this.prisma.transaction.findMany({
      where: { userId, status: 'CONFIRMED', createdAt: { gte: start, lt: end } },
      select: { type: true, amount: true, category: true },
    });

    let totalIncome = 0;
    let totalExpense = 0;
    // Lending/debt is tracked on its own: money lent or repaid (out) and money paid back or borrowed (in)
    let debtOut = 0;
    let debtIn = 0;
    const expenseByCategory: Record<string, number> = {};
    for (const t of transactions) {
      const amount = Number(t.amount);
      if (t.category?.toUpperCase() === DEBT_CATEGORY) {
        if (t.type === 'EXPENSE') debtOut += amount;
        else if (t.type === 'INCOME') debtIn += amount;
      } else if (t.type === 'INCOME') {
        totalIncome += amount;
      } else if (t.type === 'EXPENSE') {
        totalExpense += amount;
        expenseByCategory[t.category] = (expenseByCategory[t.category] || 0) + amount;
      }
    }
    return { totalIncome, totalExpense, expenseByCategory, debtOut, debtIn, year, month, timezone: tz };
  }

  /** Has a transaction already been recorded from this WhatsApp message? */
  async existsForMessage(sourceMessageId: string) {
    return (await this.prisma.transaction.count({ where: { sourceMessageId } })) > 0;
  }

  private async timezoneOf(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
    return user?.timezone || DEFAULT_TIMEZONE;
  }

  private async findOwned(userId: string, id: string) {
    const transaction = await this.prisma.transaction.findFirst({ where: { id, userId } });
    // 404 (not 403) so other users' IDs can't be probed
    if (!transaction) throw new NotFoundException('Transaction not found');
    return transaction;
  }
}
