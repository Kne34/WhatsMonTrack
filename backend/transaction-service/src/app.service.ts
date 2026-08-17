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

  async getTransactions(phoneNumber: string) {
    const user = await this.prisma.user.findUnique({ where: { phoneNumber } });
    if (!user) return [];

    return this.prisma.transaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        fromAccount: true,
        toAccount: true
      }
    });
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
}
