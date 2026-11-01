import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateAccountDto, UpdateAccountDto } from './accounts.dto';

@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);

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

  /** Used by the WhatsApp bot: case-insensitive lookup, created on first mention. */
  async findOrCreateByName(userId: string, rawName: string) {
    const name = rawName.trim().toUpperCase();
    const existing = await this.prisma.account.findFirst({
      where: { userId, name: { equals: name, mode: 'insensitive' } },
    });
    if (existing) return existing;

    this.logger.log(`Created new account ${name} for user ${userId}`);
    return this.prisma.account.create({ data: { userId, name, balance: 0 } });
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
