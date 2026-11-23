import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { applyToBalances } from '../transactions/ledger';
import { CreateDebtDto, DebtsQueryDto, DebtType, PayDto, SettleDto, UpdateDebtDto } from './debts.dto';

type Tx = Prisma.TransactionClient;

const INCLUDE = {
  account: { select: { id: true, name: true } },
  participants: { orderBy: { position: 'asc' }, include: { paidAccount: { select: { id: true, name: true } } } },
} satisfies Prisma.DebtRecordInclude;

type RecordWithParticipants = Prisma.DebtRecordGetPayload<{ include: typeof INCLUDE }>;

interface ProgressInput {
  totalAmount: number | bigint;
  participants: { expectedAmount: number | bigint; paidAmount: number | bigint; isPaid: boolean }[];
}

/**
 * Where a record stands. `remaining` is what is still to be paid: by the others (talangan) or by me
 * (utang), based on their expected shares, or on the total when no share is set. `difference` is what
 * settling would record: total minus paid.
 */
export function debtProgress(r: ProgressInput) {
  const total = Number(r.totalAmount);
  const paid = r.participants.filter((p) => p.isPaid).reduce((s, p) => s + Number(p.paidAmount), 0);
  const expected = r.participants.reduce((s, p) => s + Number(p.expectedAmount), 0);
  const target = expected > 0 ? expected : total;
  return { total, paid, expected, remaining: Math.max(0, target - paid), difference: total - paid };
}

/** The API shape: plain numbers, plus the progress. */
function toView(r: RecordWithParticipants) {
  return {
    ...r,
    totalAmount: Number(r.totalAmount),
    settledDifference: r.settledDifference == null ? null : Number(r.settledDifference),
    participants: r.participants.map((p) => ({ ...p, expectedAmount: Number(p.expectedAmount), paidAmount: Number(p.paidAmount) })),
    progress: debtProgress(r),
  };
}
export type DebtView = ReturnType<typeof toView>;

const NOT_FOUND = 'Catatan tidak ditemukan';
const ONLY_OPEN = 'Catatan ini sudah selesai. Buka kembali dulu untuk mengubahnya.';

/**
 * Utang-piutang with real-time cash flow:
 * - Money moves the moment it moves: the talangan leaves the main account, each payment enters (or, for
 *   a debt, leaves) the account chosen for it. These are transactions with `inReports: false`, so the
 *   balance is right but nothing counts as income or spending yet.
 * - Settling records the real expense (total minus what the others paid, or what I paid on a debt) as a
 *   transaction with `affectsBalance: false`: it reaches the reports without touching a balance again.
 * Every step runs in one database transaction, and every reversal goes through applyToBalances.
 */
@Injectable()
export class DebtsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
  ) {}

  async list(userId: string, query: DebtsQueryDto = {}) {
    const where: Prisma.DebtRecordWhereInput = { userId };
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { participants: { some: { personName: { contains: q, mode: 'insensitive' } } } },
      ];
    }
    const [records, summary] = await Promise.all([
      this.prisma.debtRecord.findMany({ where, include: INCLUDE, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] }),
      this.summary(userId),
    ]);
    return { records: records.map(toView), summary };
  }

  /** Header cards: what others still owe me, what I still owe, and how many records are open. */
  async summary(userId: string) {
    const open = await this.prisma.debtRecord.findMany({
      where: { userId, status: 'OPEN' },
      select: { type: true, totalAmount: true, participants: { select: { expectedAmount: true, paidAmount: true, isPaid: true } } },
    });
    let receivable = 0;
    let payable = 0;
    for (const r of open) {
      const { remaining } = debtProgress(r);
      if (r.type === 'RECEIVABLE') receivable += remaining;
      else payable += remaining;
    }
    return { receivable, payable, openCount: open.length };
  }

  async get(userId: string, id: string) {
    return toView(await this.own(userId, id));
  }

  async create(userId: string, dto: CreateDebtDto, opts: { sourceMessageId?: string | null } = {}) {
    const addToBalance = dto.type === 'PAYABLE' && !!dto.addToBalance;
    const accountId = dto.accountId || null;
    if (dto.type === 'RECEIVABLE' && !accountId) throw new BadRequestException('Pilih rekening yang dipakai untuk menalangi.');
    if (addToBalance && !accountId) throw new BadRequestException('Pilih rekening tempat uang pinjaman masuk.');
    await this.accounts.assertOwned(userId, [accountId]);

    const created = await this.prisma.$transaction(async (tx) => {
      const record = await tx.debtRecord.create({
        data: {
          userId,
          title: dto.title.trim(),
          type: dto.type,
          totalAmount: dto.totalAmount,
          category: dto.category,
          accountId,
          addToBalance,
          // Paying back a cash loan is not spending; paying back what someone covered for me is
          recordExpense: dto.type === 'PAYABLE' ? (dto.recordExpense ?? !addToBalance) : true,
          date: dto.date ? new Date(dto.date) : new Date(),
          notes: dto.notes?.trim() || null,
          sourceMessageId: opts.sourceMessageId ?? null,
          participants: {
            create: (dto.participants ?? []).map((p, i) => ({
              personName: p.personName.trim(),
              expectedAmount: p.expectedAmount ?? 0,
              position: i,
            })),
          },
        },
      });
      await this.syncInitialCashflow(tx, record);
      return record.id;
    });
    return this.get(userId, created);
  }

  async update(userId: string, id: string, dto: UpdateDebtDto) {
    const record = await this.own(userId, id);
    if (record.status !== 'OPEN') throw new ConflictException(ONLY_OPEN);
    if (dto.title !== undefined && !dto.title.trim()) throw new BadRequestException('Judul wajib diisi.');

    const addToBalance = record.type === 'PAYABLE' && (dto.addToBalance ?? record.addToBalance);
    const accountId = dto.accountId !== undefined ? dto.accountId || null : record.accountId;
    if (record.type === 'RECEIVABLE' && !accountId) throw new BadRequestException('Pilih rekening yang dipakai untuk menalangi.');
    if (addToBalance && !accountId) throw new BadRequestException('Pilih rekening tempat uang pinjaman masuk.');
    await this.accounts.assertOwned(userId, [accountId]);

    await this.prisma.$transaction(async (tx) => {
      if (dto.participants) await this.syncParticipants(tx, record, dto.participants);
      const updated = await tx.debtRecord.update({
        where: { id },
        data: {
          title: dto.title?.trim(),
          totalAmount: dto.totalAmount,
          category: dto.category,
          accountId,
          addToBalance,
          recordExpense: record.type === 'PAYABLE' ? dto.recordExpense : undefined,
          date: dto.date ? new Date(dto.date) : undefined,
          notes: dto.notes !== undefined ? dto.notes.trim() || null : undefined,
        },
      });
      // Amount, account, date or title may have changed: undo the first movement and redo it
      await this.syncInitialCashflow(tx, updated);
    });
    return this.get(userId, id);
  }

  /** Deleting an open record undoes every balance change it made. A settled one must be reopened first. */
  async remove(userId: string, id: string) {
    const record = await this.own(userId, id);
    if (record.status !== 'OPEN') throw new ConflictException('Buka kembali catatan ini dulu sebelum menghapusnya.');
    await this.prisma.$transaction(async (tx) => {
      const movements = await tx.transaction.findMany({ where: { debtRecordId: id } });
      for (const t of movements) {
        if (t.status === 'CONFIRMED') await applyToBalances(tx, t, -1);
      }
      await tx.transaction.deleteMany({ where: { debtRecordId: id } });
      await tx.debtRecord.delete({ where: { id } });
    });
    return { success: true };
  }

  /** Ticking a person: the money enters (talangan) or leaves (utang) the chosen account right away. */
  async pay(userId: string, id: string, participantId: string, dto: PayDto, opts: { sourceMessageId?: string | null } = {}) {
    const record = await this.own(userId, id);
    if (record.status !== 'OPEN') throw new ConflictException(ONLY_OPEN);
    const participant = record.participants.find((p) => p.id === participantId);
    if (!participant) throw new NotFoundException('Orang ini tidak ada di catatan.');
    await this.accounts.assertOwned(userId, [dto.accountId]);

    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    await this.prisma.$transaction(async (tx) => {
      // Paying again (e.g. a corrected amount) replaces the earlier payment
      if (participant.paymentCashflowTxId) await removeMovement(tx, participant.paymentCashflowTxId);
      const incoming = record.type === 'RECEIVABLE';
      const movement = await addMovement(tx, userId, record, {
        incoming,
        amount: dto.amount,
        accountId: dto.accountId,
        at: paidAt,
        label: incoming ? `${participant.personName} bayar: ${record.title}` : `Bayar ${participant.personName}: ${record.title}`,
        sourceMessageId: opts.sourceMessageId,
      });
      await tx.debtParticipant.update({
        where: { id: participantId },
        data: { isPaid: true, paidAmount: dto.amount, paidAccountId: dto.accountId, paidAt, paymentCashflowTxId: movement.id },
      });
    });
    return this.get(userId, id);
  }

  /** Unticking: the payment is undone and its account gets its balance back. */
  async unpay(userId: string, id: string, participantId: string) {
    const record = await this.own(userId, id);
    if (record.status !== 'OPEN') throw new ConflictException(ONLY_OPEN);
    const participant = record.participants.find((p) => p.id === participantId);
    if (!participant) throw new NotFoundException('Orang ini tidak ada di catatan.');
    await this.prisma.$transaction(async (tx) => {
      if (participant.paymentCashflowTxId) await removeMovement(tx, participant.paymentCashflowTxId);
      await tx.debtParticipant.update({
        where: { id: participantId },
        data: { isPaid: false, paidAmount: 0, paidAccountId: null, paidAt: null, paymentCashflowTxId: null },
      });
    });
    return this.get(userId, id);
  }

  /**
   * Closes the record and records the real expense (or income), dated on the record's date, without
   * touching any balance: the money already moved while it was open.
   */
  async settle(userId: string, id: string, dto: SettleDto = {}) {
    const record = await this.own(userId, id);
    if (record.status !== 'OPEN') throw new ConflictException('Catatan ini sudah selesai.');
    const { paid, difference } = debtProgress(record);
    const firstPayment = record.participants.find((p) => p.isPaid && p.paidAccountId)?.paidAccountId ?? null;

    await this.prisma.$transaction(async (tx) => {
      let linked: { id: string } | null = null;
      let recordExpense = record.recordExpense;
      const report = (data: { type: 'EXPENSE' | 'INCOME'; amount: number; category: string; accountId: string | null; label: string }) =>
        tx.transaction.create({
          data: {
            userId,
            type: data.type,
            amount: data.amount,
            category: data.category,
            subcategory: data.label.slice(0, 100),
            fromAccountId: data.type === 'EXPENSE' ? data.accountId : null,
            toAccountId: data.type === 'INCOME' ? data.accountId : null,
            rawText: null,
            createdAt: record.date,
            affectsBalance: false,
            inReports: true,
            debtRecordId: record.id,
          },
        });

      if (record.type === 'RECEIVABLE') {
        // What the others did not pay is my own share (plus any shortfall): that is the real expense
        if (difference > 0) {
          linked = await report({ type: 'EXPENSE', amount: difference, category: record.category, accountId: record.accountId, label: record.title });
        } else if (difference < 0 && dto.recordExcessAsIncome) {
          linked = await report({ type: 'INCOME', amount: -difference, category: 'INCOME', accountId: record.accountId, label: `Kelebihan bayar: ${record.title}` });
        }
      } else {
        recordExpense = dto.recordExpense ?? record.recordExpense;
        if (recordExpense && paid > 0) {
          linked = await report({ type: 'EXPENSE', amount: paid, category: record.category, accountId: firstPayment ?? record.accountId, label: record.title });
        }
      }

      await tx.debtRecord.update({
        where: { id },
        data: {
          status: 'SETTLED',
          settledAt: new Date(),
          settledDifference: difference,
          linkedTransactionId: linked?.id ?? null,
          recordExpense,
        },
      });
    });
    return this.get(userId, id);
  }

  /** Back to open: the expense/income made by settling is removed (balances were never changed by it). */
  async reopen(userId: string, id: string) {
    const record = await this.own(userId, id);
    if (record.status !== 'SETTLED') throw new ConflictException('Catatan ini belum selesai.');
    await this.prisma.$transaction(async (tx) => {
      if (record.linkedTransactionId) await removeMovement(tx, record.linkedTransactionId);
      await tx.debtRecord.update({
        where: { id },
        data: { status: 'OPEN', settledAt: null, settledDifference: null, linkedTransactionId: null },
      });
    });
    return this.get(userId, id);
  }

  /** For the bot: open records of this type where `person` has not paid yet. */
  async findUnpaid(userId: string, type: DebtType, person: string) {
    const records = await this.prisma.debtRecord.findMany({
      where: {
        userId,
        type,
        status: 'OPEN',
        participants: { some: { isPaid: false, personName: { equals: person.trim(), mode: 'insensitive' } } },
      },
      include: INCLUDE,
      orderBy: { date: 'asc' },
    });
    return records.flatMap((r) =>
      r.participants
        .filter((p) => !p.isPaid && p.personName.toLowerCase() === person.trim().toLowerCase())
        .map((p) => ({ record: r, participant: p })),
    );
  }

  private async own(userId: string, id: string) {
    const record = await this.prisma.debtRecord.findFirst({ where: { id, userId }, include: INCLUDE });
    // 404 (not 403) so ids of other users cannot be probed
    if (!record) throw new NotFoundException(NOT_FOUND);
    return record;
  }

  /** The movement made when the record is created: the talangan leaving, or a borrowed amount coming in. */
  private async syncInitialCashflow(tx: Tx, record: Prisma.DebtRecordGetPayload<object>) {
    if (record.initialCashflowTxId) await removeMovement(tx, record.initialCashflowTxId);
    let movementId: string | null = null;
    if (record.accountId && (record.type === 'RECEIVABLE' || record.addToBalance)) {
      const incoming = record.type === 'PAYABLE';
      const movement = await addMovement(tx, record.userId, record, {
        incoming,
        amount: Number(record.totalAmount),
        accountId: record.accountId,
        at: record.date,
        label: incoming ? `Pinjaman: ${record.title}` : `Talangan: ${record.title}`,
        sourceMessageId: record.sourceMessageId ? `${record.sourceMessageId}:initial` : null,
      });
      movementId = movement.id;
    }
    if (movementId !== record.initialCashflowTxId) {
      await tx.debtRecord.update({ where: { id: record.id }, data: { initialCashflowTxId: movementId } });
    }
  }

  private async syncParticipants(tx: Tx, record: RecordWithParticipants, list: { id?: string; personName: string; expectedAmount?: number }[]) {
    const keep = new Set(list.filter((p) => p.id).map((p) => p.id));
    for (const p of record.participants) {
      if (keep.has(p.id)) continue;
      if (p.isPaid) throw new BadRequestException(`${p.personName} sudah dicentang bayar. Batalkan centangnya dulu sebelum menghapus.`);
      await tx.debtParticipant.delete({ where: { id: p.id } });
    }
    for (const [i, p] of list.entries()) {
      const data = { personName: p.personName.trim(), expectedAmount: p.expectedAmount ?? 0, position: i };
      if (!data.personName) throw new BadRequestException('Nama orang wajib diisi.');
      if (p.id) {
        if (!record.participants.some((x) => x.id === p.id)) throw new NotFoundException('Orang ini tidak ada di catatan.');
        await tx.debtParticipant.update({ where: { id: p.id }, data });
      } else {
        await tx.debtParticipant.create({ data: { ...data, debtRecordId: record.id } });
      }
    }
  }
}

/**
 * A cash movement of a record: changes the balance now, stays out of the reports.
 * Its category is the record's, so the Transaksi page shows what it was for.
 */
async function addMovement(
  tx: Tx,
  userId: string,
  record: { id: string; category: string },
  m: { incoming: boolean; amount: number; accountId: string; at: Date; label: string; sourceMessageId?: string | null },
) {
  const created = await tx.transaction.create({
    data: {
      userId,
      type: m.incoming ? 'INCOME' : 'EXPENSE',
      amount: m.amount,
      category: record.category,
      subcategory: m.label.slice(0, 100),
      fromAccountId: m.incoming ? null : m.accountId,
      toAccountId: m.incoming ? m.accountId : null,
      createdAt: m.at,
      sourceMessageId: m.sourceMessageId ?? null,
      affectsBalance: true,
      inReports: false,
      debtRecordId: record.id,
    },
  });
  await applyToBalances(tx, created, 1);
  return created;
}

/** Undoes a movement (or a report-only record, which applyToBalances leaves alone) and deletes it. */
async function removeMovement(tx: Tx, id: string) {
  const t = await tx.transaction.findUnique({ where: { id } });
  if (!t) return;
  if (t.status === 'CONFIRMED') await applyToBalances(tx, t, -1);
  await tx.transaction.delete({ where: { id } });
}
