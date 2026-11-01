import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { UpsertBudgetDto } from './budgets.dto';

@Injectable()
export class BudgetsService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.budget.findMany({ where: { userId } });
  }

  upsert(userId: string, { categoryName, limit }: UpsertBudgetDto) {
    const name = categoryName.trim().toUpperCase();
    return this.prisma.budget.upsert({
      where: { userId_categoryName: { userId, categoryName: name } },
      update: { limit },
      create: { userId, categoryName: name, limit },
    });
  }

  async remove(userId: string, id: string) {
    const { count } = await this.prisma.budget.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Budget not found');
    return { success: true };
  }
}
