import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private prisma: PrismaService) {}

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

    // 3. Create Transaction and Update Balance Atomically
    const transactionResult = await this.prisma.$transaction(async (tx) => {
      // Create Transaction
      const transaction = await tx.transaction.create({
        data: {
          userId: user.id,
          type: parsedData.type,
          amount: amount,
          category: parsedData.category || 'UNCATEGORIZED',
          subcategory: parsedData.subcategory,
          accountId: account.id,
          rawText: rawText,
        },
      });

      // Update Account Balance
      let newBalance = account.balance;
      if (parsedData.type === 'EXPENSE') {
        newBalance -= amount;
      } else if (parsedData.type === 'INCOME') {
        newBalance += amount;
      }

      const updatedAccount = await tx.account.update({
        where: { id: account.id },
        data: { balance: newBalance }
      });

      return { transaction, updatedAccount };
    });

    // 4. Format Response String
    const formattedAmount = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
    const formattedBalance = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(transactionResult.updatedAccount.balance);

    const itemName = parsedData.subcategory || parsedData.category;
    
    return `Berhasil! ${formattedAmount} untuk ${itemName} telah dicatat dari rekening ${accountName}.\nSisa saldo ${accountName}: ${formattedBalance}.`;
  }
}
