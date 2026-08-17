import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private prisma: PrismaService) { }

  async handleParsedMessage(phoneNumber: string, rawText: string, parsedData: any) {
    this.logger.log(`Handling transaction for ${phoneNumber}`);

    // Ensure User exists
    let user = await this.prisma.user.findUnique({
      where: { phoneNumber },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: { phoneNumber },
      });
      this.logger.log(`Created new user with phone: ${phoneNumber}`);
    }

    // 1. Missing Account Check
    if (!parsedData.account) {
      return `Tolong sebutkan sumber dana untuk pengeluaran ini (contoh: BCA, OVO, Cash, dll).`;
    }

    // 2. Format currency and account
    const amount = parsedData.amount;
    const accountName = parsedData.account.toUpperCase();
    const type = parsedData.type || 'EXPENSE';

    // Find or create the account
    let account = await this.prisma.account.findFirst({
      where: {
        userId: user.id,
        name: { equals: accountName, mode: 'insensitive' }
      }
    });

    if (!account) {
      account = await this.prisma.account.create({
        data: {
          userId: user.id,
          name: accountName,
          balance: 0 // Default starting balance until adjusted via frontend
        }
      });
      this.logger.log(`Created new account ${accountName} for user ${user.id}`);
    }

    // Determine status based on confidence
    const confidence = parsedData.confidence ?? 1.0;
    const status = confidence < 0.85 ? 'NEEDS_REVIEW' : 'CONFIRMED';

    // 3. Create Transaction and Update Balance Atomically
    const transactionResult = await this.prisma.$transaction(async (tx) => {
      // Determine account bindings
      let fromAccountId: string | null = null;
      let toAccountId: string | null = null;

      if (type === 'EXPENSE' || type === 'DEBT_OUT' || type === 'TRANSFER') {
        fromAccountId = account.id;
      }
      if (type === 'INCOME' || type === 'DEBT_IN' || type === 'TRANSFER') {
        toAccountId = account.id; // For transfers, ideally we need two accounts. For MVP, we map one to `toAccount` or `fromAccount`. Wait, if it's transfer, we'll just set fromAccountId for now if destination is unknown.
        // Let's improve transfer later.
      }

      // Create Transaction
      const transaction = await tx.transaction.create({
        data: {
          userId: user.id,
          type: type as any,
          amount: amount,
          category: parsedData.category || 'UNCATEGORIZED',
          subcategory: parsedData.subcategory,
          fromAccountId: fromAccountId,
          toAccountId: toAccountId,
          rawText: rawText,
          confidenceScore: confidence,
          status: status,
        },
      });

      let updatedAccount = account;

      // Update Account Balance ONLY IF CONFIRMED
      if (status === 'CONFIRMED') {
        let newBalance = account.balance;
        if (type === 'EXPENSE') {
          newBalance -= amount;
        } else if (type === 'INCOME') {
          newBalance += amount;
        }

        updatedAccount = await tx.account.update({
          where: { id: account.id },
          data: { balance: newBalance }
        });
      }

      return { transaction, updatedAccount };
    });

    // 4. Format Response String
    const formattedAmount = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
    const formattedBalance = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(transactionResult.updatedAccount.balance);
    const itemName = parsedData.subcategory || parsedData.category;

    if (status === 'NEEDS_REVIEW') {
      return `Tercatat sebagai DRAFT: ${formattedAmount} untuk ${itemName} via ${accountName} ⚠️\nSilakan konfirmasi di Web Dashboard untuk memastikan tidak ada kesalahan.`;
    }

    return `Berhasil! ${formattedAmount} untuk ${itemName} telah dicatat dari rekening ${accountName}.\nSisa saldo ${accountName}: ${formattedBalance}.`;
  }

  // REST API Logic

  async getAccounts(phoneNumber: string) {
    const user = await this.prisma.user.findUnique({ where: { phoneNumber } });
    if (!user) return [];

    return this.prisma.account.findMany({
      where: { userId: user.id },
      orderBy: { name: 'asc' }
    });
  }

  async createAccount(phoneNumber: string, name: string, type: string, initialBalance: number) {
    let user = await this.prisma.user.findUnique({ where: { phoneNumber } });
    if (!user) {
      user = await this.prisma.user.create({ data: { phoneNumber } });
    }

    return this.prisma.account.create({
      data: {
        userId: user.id,
        name: name.toUpperCase(),
        balance: initialBalance || 0
      }
    });
  }

  async getBudgets(phoneNumber: string) {
    const user = await this.prisma.user.findUnique({ where: { phoneNumber } });
    if (!user) return [];
    return this.prisma.budget.findMany({ where: { userId: user.id } });
  }

  async upsertBudget(phoneNumber: string, categoryName: string, limit: number) {
    let user = await this.prisma.user.findUnique({ where: { phoneNumber } });
    if (!user) {
      user = await this.prisma.user.create({ data: { phoneNumber } });
    }

    return this.prisma.budget.upsert({
      where: {
        userId_categoryName: {
          userId: user.id,
          categoryName: categoryName.toUpperCase()
        }
      },
      update: { limit },
      create: {
        userId: user.id,
        categoryName: categoryName.toUpperCase(),
        limit
      }
    });
  }

  async getTransactions(phoneNumber: string, query?: { month?: number, year?: number, day?: number, page?: number, limit?: number }) {
    const user = await this.prisma.user.findUnique({ where: { phoneNumber } });
    if (!user) return { data: [], total: 0, page: 1, limit: 100, totalPages: 0 };

    const { month, year, day, page = 1, limit = 100 } = query || {};

    let whereClause: any = { userId: user.id };

    if (month && year) {
      if (day) {
        // Filter precisely for that day
        const startDate = new Date(year, month - 1, day);
        const endDate = new Date(year, month - 1, day + 1);
        whereClause.createdAt = {
          gte: startDate,
          lt: endDate
        };
      } else {
        // Month is 1-indexed (1=Jan, 12=Dec)
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 1); // 1st of next month

        whereClause.createdAt = {
          gte: startDate,
          lt: endDate
        };
      }
    }

    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          fromAccount: true,
          toAccount: true
        }
      }),
      this.prisma.transaction.count({ where: whereClause })
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  async confirmTransaction(transactionId: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { fromAccount: true, toAccount: true }
    });

    if (!transaction || transaction.status === 'CONFIRMED') {
      return { success: false, message: 'Transaction not found or already confirmed' };
    }

    // Atomic update
    await this.prisma.$transaction(async (tx) => {
      // 1. Update status
      await tx.transaction.update({
        where: { id: transactionId },
        data: { status: 'CONFIRMED' }
      });

      // 2. Adjust balances
      if (transaction.type === 'EXPENSE' && transaction.fromAccountId) {
        await tx.account.update({
          where: { id: transaction.fromAccountId },
          data: { balance: { decrement: transaction.amount } }
        });
      }

      if (transaction.type === 'INCOME' && transaction.toAccountId) {
        await tx.account.update({
          where: { id: transaction.toAccountId },
          data: { balance: { increment: transaction.amount } }
        });
      }

      if (transaction.type === 'TRANSFER') {
        if (transaction.fromAccountId) {
          await tx.account.update({
            where: { id: transaction.fromAccountId },
            data: { balance: { decrement: transaction.amount } }
          });
        }
        if (transaction.toAccountId) {
          await tx.account.update({
            where: { id: transaction.toAccountId },
            data: { balance: { increment: transaction.amount } }
          });
        }
      }
    });

    return { success: true };
  }

  async updateTransaction(transactionId: string, data: any) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId }
    });

    if (!transaction) return { success: false, message: 'Transaction not found' };

    await this.prisma.$transaction(async (tx) => {
      // 1. Reverse old impact if it was CONFIRMED
      if (transaction.status === 'CONFIRMED') {
        if (transaction.type === 'EXPENSE' && transaction.fromAccountId) {
          await tx.account.update({ where: { id: transaction.fromAccountId }, data: { balance: { increment: transaction.amount } } });
        }
        if (transaction.type === 'INCOME' && transaction.toAccountId) {
          await tx.account.update({ where: { id: transaction.toAccountId }, data: { balance: { decrement: transaction.amount } } });
        }
        if (transaction.type === 'TRANSFER') {
          if (transaction.fromAccountId) await tx.account.update({ where: { id: transaction.fromAccountId }, data: { balance: { increment: transaction.amount } } });
          if (transaction.toAccountId) await tx.account.update({ where: { id: transaction.toAccountId }, data: { balance: { decrement: transaction.amount } } });
        }
      }

      // 2. Update transaction
      const updatedTx = await tx.transaction.update({
        where: { id: transactionId },
        data: {
          type: data.type !== undefined ? data.type : transaction.type,
          amount: data.amount !== undefined ? data.amount : transaction.amount,
          category: data.category !== undefined ? data.category : transaction.category,
          subcategory: data.subcategory !== undefined ? data.subcategory : transaction.subcategory,
          fromAccountId: data.fromAccountId !== undefined ? data.fromAccountId : transaction.fromAccountId,
          toAccountId: data.toAccountId !== undefined ? data.toAccountId : transaction.toAccountId,
        }
      });

      // 3. Apply new impact if CONFIRMED
      if (updatedTx.status === 'CONFIRMED') {
        if (updatedTx.type === 'EXPENSE' && updatedTx.fromAccountId) {
          await tx.account.update({ where: { id: updatedTx.fromAccountId }, data: { balance: { decrement: updatedTx.amount } } });
        }
        if (updatedTx.type === 'INCOME' && updatedTx.toAccountId) {
          await tx.account.update({ where: { id: updatedTx.toAccountId }, data: { balance: { increment: updatedTx.amount } } });
        }
        if (updatedTx.type === 'TRANSFER') {
          if (updatedTx.fromAccountId) await tx.account.update({ where: { id: updatedTx.fromAccountId }, data: { balance: { decrement: updatedTx.amount } } });
          if (updatedTx.toAccountId) await tx.account.update({ where: { id: updatedTx.toAccountId }, data: { balance: { increment: updatedTx.amount } } });
        }
      }
    });

    return { success: true };
  }

  async deleteTransaction(transactionId: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId }
    });

    if (!transaction) return { success: false, message: 'Transaction not found' };

    await this.prisma.$transaction(async (tx) => {
      // 1. Reverse balance impact if CONFIRMED
      if (transaction.status === 'CONFIRMED') {
        if (transaction.type === 'EXPENSE' && transaction.fromAccountId) {
          await tx.account.update({ where: { id: transaction.fromAccountId }, data: { balance: { increment: transaction.amount } } });
        }
        if (transaction.type === 'INCOME' && transaction.toAccountId) {
          await tx.account.update({ where: { id: transaction.toAccountId }, data: { balance: { decrement: transaction.amount } } });
        }
        if (transaction.type === 'TRANSFER') {
          if (transaction.fromAccountId) await tx.account.update({ where: { id: transaction.fromAccountId }, data: { balance: { increment: transaction.amount } } });
          if (transaction.toAccountId) await tx.account.update({ where: { id: transaction.toAccountId }, data: { balance: { decrement: transaction.amount } } });
        }
      }

      // 2. Delete transaction
      await tx.transaction.delete({ where: { id: transactionId } });
    });

    return { success: true };
  }

  async createTransactionManual(phoneNumber: string, data: any) {
    let user = await this.prisma.user.findUnique({ where: { phoneNumber } });
    if (!user) {
      user = await this.prisma.user.create({ data: { phoneNumber } });
    }

    const transaction = await this.prisma.$transaction(async (tx) => {
      const txRecord = await tx.transaction.create({
        data: {
          userId: user.id,
          type: data.type,
          amount: data.amount,
          category: data.category || 'UNCATEGORIZED',
          fromAccountId: data.fromAccountId || null,
          toAccountId: data.toAccountId || null,
          status: 'CONFIRMED',
          confidenceScore: 1.0,
          rawText: 'Manual Input',
          createdAt: data.createdAt ? new Date(data.createdAt) : new Date()
        }
      });

      if (data.type === 'EXPENSE' && data.fromAccountId) {
        await tx.account.update({ where: { id: data.fromAccountId }, data: { balance: { decrement: data.amount } } });
      }
      if (data.type === 'INCOME' && data.toAccountId) {
        await tx.account.update({ where: { id: data.toAccountId }, data: { balance: { increment: data.amount } } });
      }
      if (data.type === 'TRANSFER') {
        if (data.fromAccountId) await tx.account.update({ where: { id: data.fromAccountId }, data: { balance: { decrement: data.amount } } });
        if (data.toAccountId) await tx.account.update({ where: { id: data.toAccountId }, data: { balance: { increment: data.amount } } });
      }

      return txRecord;
    });

    return { success: true, transaction };
  }
}
