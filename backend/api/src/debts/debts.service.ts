import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateDebtNoteDto, UpdateDebtNoteDto } from './debts.dto';

/** Utang-piutang notes: who owes whom and how much is left. Separate from transactions; never touches balances. */
@Injectable()
export class DebtsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Open notes first, then settled ones; newest first within each. */
  async list(userId: string) {
    const notes = await this.prisma.debtNote.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    return [...notes.filter((n) => n.paid < n.amount), ...notes.filter((n) => n.paid >= n.amount)];
  }

  create(userId: string, dto: CreateDebtNoteDto) {
    return this.prisma.debtNote.create({
      data: {
        userId,
        person: dto.person.trim(),
        direction: dto.direction,
        amount: dto.amount,
        paid: Math.min(dto.paid ?? 0, dto.amount),
        note: dto.note?.trim() || null,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateDebtNoteDto) {
    const note = await this.prisma.debtNote.findFirst({ where: { id, userId } });
    // 404 (not 403) so ids of other users cannot be probed
    if (!note) throw new NotFoundException('Catatan tidak ditemukan');
    if (dto.person !== undefined && !dto.person.trim()) throw new BadRequestException('Nama orang wajib diisi.');

    const amount = dto.amount ?? Number(note.amount);
    let paid = dto.paid ?? Number(note.paid);
    if (dto.settled !== undefined) paid = dto.settled ? amount : 0;
    return this.prisma.debtNote.update({
      where: { id },
      data: {
        person: dto.person?.trim() ?? note.person,
        direction: dto.direction ?? note.direction,
        amount,
        paid: Math.min(paid, amount),
        note: dto.note !== undefined ? dto.note.trim() || null : note.note,
      },
    });
  }

  async remove(userId: string, id: string) {
    const { count } = await this.prisma.debtNote.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Catatan tidak ditemukan');
    return { success: true };
  }
}
