import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateAccountDto, UpdateAccountDto } from './accounts.dto';

/** "Go-Pay " -> "GOPAY": comparison key that ignores case, spaces and punctuation. */
export const normalizeAccountName = (name: string) => name.toUpperCase().replace(/[^A-Z0-9]/g, '');

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
    return this.prisma.account.findMany({ where: { userId }, orderBy: { name: 'asc' } });
  }

  create(userId: string, dto: CreateAccountDto) {
    return this.prisma.account.create({
      data: { userId, name: dto.name.trim().toUpperCase(), balance: dto.initialBalance ?? 0 },
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

  async remove(userId: string, id: string) {
    const account = await this.prisma.account.findFirst({
      where: { id, userId },
      include: {
        transactionsFrom: { select: { id: true }, take: 1 },
        transactionsTo: { select: { id: true }, take: 1 },
      },
    });
    if (!account) throw new NotFoundException('Account not found');

    if (account.transactionsFrom.length > 0 || account.transactionsTo.length > 0) {
      throw new BadRequestException(
        `Cannot delete account "${account.name}" because it has existing transactions. Please delete the transactions first.`,
      );
    }
    return this.prisma.account.delete({ where: { id } });
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
    return accounts.find((a) => candidates.has(normalizeAccountName(a.name))) ?? null;
  }

  /** Throws 404 unless every given (non-empty) account id belongs to the user. */
  async assertOwned(userId: string, ids: (string | null | undefined)[]) {
    const wanted = [...new Set(ids.filter((id): id is string => !!id))];
    if (wanted.length === 0) return;
    const count = await this.prisma.account.count({ where: { id: { in: wanted }, userId } });
    if (count !== wanted.length) throw new NotFoundException('Account not found');
  }

  private async findOwned(userId: string, id: string) {
    const account = await this.prisma.account.findFirst({ where: { id, userId } });
    // 404 (not 403) so other users' IDs can't be probed
    if (!account) throw new NotFoundException('Account not found');
    return account;
  }
}
