import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AccountsService } from '../accounts/accounts.service';
import { BudgetsService } from '../budgets/budgets.service';
import { TransactionsService } from '../transactions/transactions.service';
import { TX_TYPES, TxType } from '../transactions/transactions.dto';
import { ParserService } from '../parser/parser.service';
import { formatIDR } from '../common/format';
import { normalizePhone } from '../common/phone';
import { LINK_MESSAGE_REGEX, PhoneLinkService } from './phone-link.service';

const NOT_LINKED_REPLY_INTERVAL_MS = 10 * 60 * 1000;

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

  findUserByPhone(phoneNumber: string) {
    return this.prisma.user.findUnique({ where: { phoneNumber: normalizePhone(phoneNumber) } });
  }

  /**
   * Decides how to answer an incoming WhatsApp text. Returns the reply, or null to stay silent.
   * - "VERIFIKASI <code>" links the sender's number to the account that requested the code.
   * - Messages from a linked number (with a verified email) are processed as transactions/commands.
   * - Anyone else gets linking instructions, at most once per NOT_LINKED_REPLY_INTERVAL_MS.
   */
  async reply(senderPhone: string, text: string): Promise<string | null> {
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

    return this.handleMessage(user.id, text);
  }

  async handleMessage(userId: string, text: string): Promise<string> {
    const command = text.toLowerCase().trim();
    if (command === '/rekap' || command === '/recap') {
      return this.recap(userId);
    }
    return this.recordFromText(userId, text);
  }

  private async recordFromText(userId: string, text: string): Promise<string> {
    // 1. Give the AI the user's account names so it can match them
    let accountsContext = '';
    try {
      accountsContext = (await this.accounts.list(userId)).map((a) => a.name).join(', ');
    } catch (e) {
      this.logger.warn('Failed to fetch accounts context', e);
    }

    // 2. Parse
    const result = await this.parser.parse(text, { accounts: accountsContext });
    if (result.status === 'error') {
      return `Gagal: ${result.message}`;
    }
    const parsed = result.data;

    if (parsed.isTransaction === false) {
      return parsed.chatReply || 'Maaf, saya tidak mengerti maksudmu.';
    }

    // 3. Validate what the AI extracted
    const type: TxType = TX_TYPES.includes(parsed.type as TxType) ? (parsed.type as TxType) : 'EXPENSE';

    if (type === 'TRANSFER' && (!parsed.fromAccount || !parsed.toAccount)) {
      return 'Tolong sebutkan rekening sumber dan tujuan untuk transfer ini (contoh: Transfer 50k dari BCA ke OVO).';
    }
    if (type === 'INCOME' && !parsed.toAccount && !parsed.account) {
      return 'Tolong sebutkan rekening tujuan untuk pemasukan ini (contoh: BCA, OVO, Cash, dll).';
    }
    if (type === 'EXPENSE' && !parsed.fromAccount && !parsed.account) {
      return 'Tolong sebutkan sumber dana untuk pengeluaran ini (contoh: BCA, OVO, Cash, dll).';
    }
    if (typeof parsed.amount !== 'number' || !(parsed.amount > 0)) {
      return 'Tolong sebutkan nominal transaksinya (contoh: Makan siang 25k pakai BCA).';
    }

    const fromName = parsed.fromAccount || (type !== 'INCOME' ? parsed.account : undefined);
    const toName = parsed.toAccount || (type === 'INCOME' ? parsed.account : undefined);
    const from = fromName ? await this.accounts.findOrCreateByName(userId, fromName) : null;
    const to = toName ? await this.accounts.findOrCreateByName(userId, toName) : null;

    // 4. Save (low confidence => draft that must be confirmed on the dashboard)
    const { transaction, fromAccount, toAccount } = await this.transactions.create(userId, {
      type,
      amount: parsed.amount,
      category: parsed.category,
      subcategory: parsed.subcategory,
      fromAccountId: from?.id,
      toAccountId: to?.id,
      rawText: text,
      confidence: parsed.confidence,
    });

    // 5. Reply
    const amount = formatIDR(parsed.amount);
    const item = parsed.subcategory || parsed.category;
    const fromLabel = from?.name;
    const toLabel = to?.name;
    const at = transaction.createdAt;
    const timestamp = `\n*(Tercatat pada: ${at.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}, ${at.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })})*`;

    if (transaction.status === 'NEEDS_REVIEW') {
      const via = type === 'TRANSFER' ? `${fromLabel} -> ${toLabel}` : type === 'INCOME' ? toLabel : fromLabel;
      return `Tercatat sebagai DRAFT: ${amount} untuk ${item} via ${via} ⚠️\nSilakan konfirmasi di Web Dashboard untuk memastikan tidak ada kesalahan.${timestamp}`;
    }

    const fromBal = formatIDR(fromAccount?.balance || 0);
    const toBal = formatIDR(toAccount?.balance || 0);
    if (type === 'TRANSFER') {
      return `Berhasil! Transfer ${amount} dari ${fromLabel} ke ${toLabel} telah dicatat.\nSisa saldo ${fromLabel}: ${fromBal}\nSisa saldo ${toLabel}: ${toBal}${timestamp}`;
    }
    if (type === 'INCOME') {
      return `Berhasil! Pemasukan ${amount} untuk ${item} telah ditambahkan ke ${toLabel}.\nSisa saldo ${toLabel}: ${toBal}${timestamp}`;
    }
    return `Berhasil! ${amount} untuk ${item} telah dicatat dari rekening ${fromLabel}.\nSisa saldo ${fromLabel}: ${fromBal}${timestamp}`;
  }

  private async recap(userId: string): Promise<string> {
    const now = new Date();
    const [summary, accounts, budgets] = await Promise.all([
      this.transactions.monthlySummary(userId, now),
      this.accounts.list(userId),
      this.budgets.list(userId),
    ]);
    const monthName = now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

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
            const status = spent > b.limit ? 'Over ⚠️' : 'Aman ✅';
            return `- ${b.categoryName}: ${formatIDR(spent)} / ${formatIDR(b.limit)} (${status})\n`;
          })
          .join('');

    return recap;
  }
}
