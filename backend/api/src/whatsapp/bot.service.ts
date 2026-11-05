import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { BudgetsService } from '../budgets/budgets.service';
import { TransactionsService } from '../transactions/transactions.service';
import { MAX_AMOUNT, TX_TYPES, TxType } from '../transactions/transactions.dto';
import { ParserService } from '../parser/parser.service';
import { formatIDR } from '../common/format';
import { normalizePhone } from '../common/phone';
import { DEFAULT_TIMEZONE } from '../common/time';
import { LINK_MESSAGE_REGEX, PhoneLinkService } from './phone-link.service';

const NOT_LINKED_REPLY_INTERVAL_MS = 10 * 60 * 1000;
/** How long a question from the bot ("which account?") waits for a short answer. */
const FOLLOW_UP_WINDOW_MS = 10 * 60 * 1000;

/** A short answer such as "OVO", "pakai BCA" or "25rb", not a new full message. */
const isShortAnswer = (text: string) => text.length <= 40 && text.trim().split(/\s+/).length <= 4;

/** Conversation logic of the WhatsApp bot: text in, reply text out. Transport-agnostic. */
@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: AccountsService,
    private readonly budgets: BudgetsService,
    private readonly transactions: TransactionsService,
    private readonly parser: ParserService,
    private readonly phoneLink: PhoneLinkService,
  ) {}

  /** Avoids spamming unknown numbers (and the WhatsApp ban risk that comes with it). */
  private readonly notLinkedRepliedAt = new Map<string, number>();

  /** Messages the bot asked a follow-up about (missing account or amount), per user. In memory only. */
  private readonly awaiting = new Map<string, { text: string; at: number }>();

  findUserByPhone(phoneNumber: string) {
    return this.prisma.user.findUnique({ where: { phoneNumber: normalizePhone(phoneNumber) } });
  }

  /**
   * Decides how to answer an incoming WhatsApp text. Returns the reply, or null to stay silent.
   * - "VERIFIKASI <code>" links the sender's number to the account that requested the code.
   * - Messages from a linked number (with a verified email) are processed as transactions/commands.
   * - Anyone else gets linking instructions, at most once per NOT_LINKED_REPLY_INTERVAL_MS.
   * `messageId` (the WhatsApp message id) makes recording idempotent across re-deliveries.
   */
  async reply(senderPhone: string, text: string, messageId?: string): Promise<string | null> {
    const phone = normalizePhone(senderPhone);

    const link = LINK_MESSAGE_REGEX.exec(text);
    if (link) {
      return this.phoneLink.confirm(link[1], phone);
    }

    const user = await this.findUserByPhone(phone);
    if (!user?.isVerified) {
      const last = this.notLinkedRepliedAt.get(phone) ?? 0;
      if (Date.now() - last < NOT_LINKED_REPLY_INTERVAL_MS) return null;
      this.notLinkedRepliedAt.set(phone, Date.now());
      return 'Halo! Nomor ini belum terhubung ke akun WhatsMonTrack. Daftar atau masuk di web, lalu buka menu "Hubungkan WhatsApp".';
    }

    return this.handleMessage(user.id, text, messageId);
  }

  async handleMessage(userId: string, text: string, messageId?: string): Promise<string | null> {
    const command = text.toLowerCase().trim();
    if (command === '/rekap' || command === '/recap') {
      this.awaiting.delete(userId);
      return this.recap(userId);
    }
    // "9rb grabbike" -> "Tolong sebutkan sumber dana" -> "OVO": read the answer together with the question's message
    const asked = this.awaiting.get(userId);
    this.awaiting.delete(userId);
    if (asked && Date.now() - asked.at < FOLLOW_UP_WINDOW_MS && isShortAnswer(text)) {
      text = `${asked.text} ${text.trim()}`;
    }
    return this.recordFromText(userId, text, messageId);
  }

  /** Replies with a question and remembers the message, so a short answer can complete it. */
  private ask(userId: string, text: string, question: string) {
    this.awaiting.set(userId, { text, at: Date.now() });
    return question;
  }

  private async recordFromText(userId: string, text: string, messageId?: string): Promise<string | null> {
    // Already recorded from this exact WhatsApp message (re-delivery after a reconnect): stay silent,
    // and don't spend an AI call on it. The unique constraint below is the race-proof backstop.
    if (messageId && (await this.transactions.existsForMessage(messageId))) {
      this.logger.log(`Skipping already-recorded message ${messageId}`);
      return null;
    }

    // 1. Give the AI the user's account names so it can match them
    const accounts = await this.accounts.list(userId);
    const accountNames = accounts.map((a) => a.name).join(', ');

    // 2. Parse
    const result = await this.parser.parse(text, { accounts: accounts.map((a) => a.name) });
    if (result.status === 'error') {
      return result.message;
    }
    const parsed = result.data;

    if (parsed.isTransaction === false) {
      return parsed.chatReply || 'Maaf, saya tidak mengerti maksudmu.';
    }

    // 3. Validate what the AI extracted
    const type: TxType = TX_TYPES.includes(parsed.type as TxType) ? (parsed.type as TxType) : 'EXPENSE';
    const amount = typeof parsed.amount === 'number' ? Math.round(parsed.amount) : NaN; // whole rupiah

    if (type === 'TRANSFER' && (!parsed.fromAccount || !parsed.toAccount)) {
      return this.ask(userId, text, 'Tolong sebutkan rekening sumber dan tujuan untuk transfer ini (contoh: dari BCA ke OVO).');
    }
    if (type === 'INCOME' && !parsed.toAccount && !parsed.account) {
      return this.ask(userId, text, 'Masuk ke rekening mana? Balas dengan nama rekeningnya (contoh: BCA, OVO, Cash).');
    }
    if (type === 'EXPENSE' && !parsed.fromAccount && !parsed.account) {
      return this.ask(userId, text, 'Dibayar pakai rekening apa? Balas dengan nama rekeningnya (contoh: BCA, OVO, Cash).');
    }
    if (!(amount > 0)) {
      return this.ask(userId, text, 'Berapa nominalnya? Balas dengan jumlahnya (contoh: 25rb).');
    }
    if (amount > MAX_AMOUNT) {
      return `Nominal terlalu besar. Maksimal ${formatIDR(MAX_AMOUNT)} per transaksi.`;
    }

    // 4. Resolve accounts. Unknown names are reported back, never created from a guess.
    if (accounts.length === 0) {
      return 'Anda belum punya rekening. Tambahkan rekening (misalnya BCA atau Tunai) di web, lalu kirim ulang pesan ini.';
    }
    const fromName = parsed.fromAccount || (type !== 'INCOME' ? parsed.account : undefined);
    const toName = parsed.toAccount || (type === 'INCOME' ? parsed.account : undefined);
    const from = fromName ? await this.accounts.findByName(userId, fromName) : null;
    const to = toName ? await this.accounts.findByName(userId, toName) : null;
    const missing = [fromName && !from ? fromName : null, toName && !to ? toName : null].filter(Boolean);
    if (missing.length > 0) {
      return `Rekening ${missing.map((m) => `"${m}"`).join(' dan ')} tidak ditemukan.\nRekening Anda: ${accountNames}.\nKirim ulang dengan nama rekening yang benar, atau tambahkan rekening baru di web.`;
    }
    if (type === 'TRANSFER' && from && to && from.id === to.id) {
      return `Rekening sumber dan tujuan transfer sama (${from.name}). Sebutkan dua rekening yang berbeda (contoh: Transfer 50k dari BCA ke OVO).`;
    }

    // 5. Save (low confidence => draft that must be confirmed on the dashboard)
    let created: Awaited<ReturnType<TransactionsService['create']>>;
    try {
      created = await this.transactions.create(userId, {
        type,
        amount,
        category: parsed.category,
        subcategory: parsed.subcategory,
        fromAccountId: from?.id,
        toAccountId: to?.id,
        rawText: text,
        confidence: parsed.confidence,
        sourceMessageId: messageId ?? null,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        this.logger.log(`Message ${messageId} was recorded concurrently; skipping duplicate`);
        return null;
      }
      throw err;
    }
    const { transaction, fromAccount, toAccount } = created;

    // 6. Reply, with the time in the user's own zone
    const tz = await this.timezoneOf(userId);
    const amountText = formatIDR(amount);
    const item = parsed.subcategory || parsed.category;
    const fromLabel = from?.name;
    const toLabel = to?.name;
    const at = transaction.createdAt;
    const date = at.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: tz });
    const time = at.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: tz });
    const timestamp = `\n*(Tercatat pada: ${date}, ${time})*`;

    if (transaction.status === 'NEEDS_REVIEW') {
      const via = type === 'TRANSFER' ? `${fromLabel} -> ${toLabel}` : type === 'INCOME' ? toLabel : fromLabel;
      return `Tercatat sebagai DRAFT: ${amountText} untuk ${item} via ${via} ⚠️\nSilakan konfirmasi di Web Dashboard untuk memastikan tidak ada kesalahan.${timestamp}`;
    }

    const fromBal = formatIDR(fromAccount?.balance ?? 0);
    const toBal = formatIDR(toAccount?.balance ?? 0);
    if (type === 'TRANSFER') {
      return `Berhasil! Transfer ${amountText} dari ${fromLabel} ke ${toLabel} telah dicatat.\nSisa saldo ${fromLabel}: ${fromBal}\nSisa saldo ${toLabel}: ${toBal}${timestamp}`;
    }
    if (type === 'INCOME') {
      return `Berhasil! Pemasukan ${amountText} untuk ${item} telah ditambahkan ke ${toLabel}.\nSisa saldo ${toLabel}: ${toBal}${timestamp}`;
    }
    return `Berhasil! ${amountText} untuk ${item} telah dicatat dari rekening ${fromLabel}.\nSisa saldo ${fromLabel}: ${fromBal}${timestamp}`;
  }

  private async recap(userId: string): Promise<string> {
    const [summary, accounts, budgets] = await Promise.all([
      this.transactions.monthlySummary(userId, new Date()),
      this.accounts.list(userId),
      this.budgets.list(userId),
    ]);
    // Month in the user's zone (the summary already used it for the boundaries)
    const monthName = new Date(Date.UTC(summary.year, summary.month - 1, 15)).toLocaleDateString('id-ID', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });

    let recap = `📊 *Rekap Bulan Ini (${monthName})*\n\n`;
    recap += `💰 *Total Pemasukan*: ${formatIDR(summary.totalIncome)}\n`;
    recap += `💸 *Total Pengeluaran*: ${formatIDR(summary.totalExpense)}\n`;
    recap += `📉 *Sisa Uang (Arus Kas)*: ${formatIDR(summary.totalIncome - summary.totalExpense)}\n\n`;

    recap += `🏦 *Saldo Rekening Saat Ini*:\n`;
    recap += accounts.length === 0
      ? `- Belum ada rekening tercatat.\n`
      : accounts.map((a) => `- ${a.name}: ${formatIDR(a.balance)}\n`).join('');
    recap += `\n`;

    recap += `🎯 *Status Anggaran (Budget)*:\n`;
    recap += budgets.length === 0
      ? `- Belum ada anggaran yang diatur.\n`
      : budgets
          .map((b) => {
            const spent = summary.expenseByCategory[b.categoryName] || 0;
            const limit = Number(b.limit);
            const status = spent > limit ? 'Over ⚠️' : 'Aman ✅';
            return `- ${b.categoryName}: ${formatIDR(spent)} / ${formatIDR(limit)} (${status})\n`;
          })
          .join('');

    return recap;
  }

  private async timezoneOf(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
    return user?.timezone || DEFAULT_TIMEZONE;
  }
}

/** Prisma "unique constraint failed" (here: the transaction's sourceMessageId). */
function isUniqueViolation(err: unknown) {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}
