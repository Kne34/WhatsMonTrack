jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));

import { BotService } from './bot.service';
import { normalizeAccountName } from '../accounts/accounts.service';

const USER = { id: 'u1', isVerified: true, phoneNumber: '6281111111111', timezone: 'Asia/Jakarta' };
const ACCOUNTS = [
  { id: 'a1', name: 'BCA', balance: 100000n },
  { id: 'a2', name: 'TUNAI', balance: 50000n },
  { id: 'a3', name: 'GO PAY', balance: 20000n },
];

function setup(parsed: Record<string, unknown>, opts: { recorded?: string[]; createError?: unknown } = {}) {
  const recorded = new Set(opts.recorded ?? []);
  const prisma = {
    user: {
      findUnique: jest.fn(async ({ where }) => (where.phoneNumber === USER.phoneNumber || where.id === USER.id ? USER : null)),
    },
  };
  const accounts = {
    list: jest.fn(async () => ACCOUNTS),
    findByName: jest.fn(async (_u: string, name: string) => {
      const key = normalizeAccountName(name);
      const keys = key === 'CASH' ? ['CASH', 'TUNAI'] : [key];
      return ACCOUNTS.find((a) => keys.includes(normalizeAccountName(a.name))) ?? null;
    }),
  };
  const transactions = {
    existsForMessage: jest.fn(async (id: string) => recorded.has(id)),
    create: jest.fn(async (_u: string, input: any) => {
      if (opts.createError) throw opts.createError;
      const from = ACCOUNTS.find((a) => a.id === input.fromAccountId);
      return {
        transaction: { status: 'CONFIRMED', createdAt: new Date('2026-10-31T23:30:00Z') },
        fromAccount: from ? { ...from, balance: from.balance - BigInt(input.amount) } : null,
        toAccount: null,
      };
    }),
    monthlySummary: jest.fn(),
  };
  const parser = { parse: jest.fn(async (_text: string, _ctx?: unknown) => ({ source: 'test', status: 'success', data: parsed })) };
  const phoneLink = { confirm: jest.fn(async () => 'linked') };
  const bot = new BotService(prisma as any, accounts as any, {} as any, transactions as any, parser as any, phoneLink as any);
  return { bot, transactions, parser, accounts };
}

const expense = (account: string, amount = 25000) => ({
  isTransaction: true, type: 'EXPENSE', amount, category: 'FOOD', subcategory: 'Makan siang', fromAccount: account, confidence: 0.95,
});

describe('BotService.reply', () => {
  it('records an expense against an existing account and replies with the WIB time', async () => {
    const { bot, transactions } = setup(expense('bca'));
    const reply = await bot.reply('6281111111111', 'makan siang 25rb bca', 'MSG1');

    expect(transactions.create).toHaveBeenCalledWith('u1', expect.objectContaining({
      amount: 25000, fromAccountId: 'a1', sourceMessageId: 'MSG1',
    }));
    expect(reply).toMatch(/^Berhasil!/);
    expect(reply).toContain('Sisa saldo BCA: Rp');
    expect(reply).toContain('06.30'); // 23:30 UTC = 06:30 WIB the next day
  });

  it('matches account names loosely: "Go-Pay" = "GO PAY", "cash" = "TUNAI"', async () => {
    for (const [said, id] of [['Go-Pay', 'a3'], ['cash', 'a2']]) {
      const { bot, transactions } = setup(expense(said));
      await bot.reply('6281111111111', `jajan 10rb ${said}`, `M-${said}`);
      expect(transactions.create).toHaveBeenCalledWith('u1', expect.objectContaining({ fromAccountId: id }));
    }
  });

  it('never creates an account from an AI guess: unknown names are reported back', async () => {
    const { bot, transactions } = setup(expense('Mandiri'));
    const reply = await bot.reply('6281111111111', 'bayar listrik 300rb mandiri', 'MSG2');

    expect(transactions.create).not.toHaveBeenCalled();
    expect(reply).toContain('Rekening "Mandiri" tidak ditemukan');
    expect(reply).toContain('BCA, TUNAI, GO PAY');
  });

  it('skips a message that was already recorded, without calling the AI again', async () => {
    const { bot, transactions, parser } = setup(expense('bca'), { recorded: ['MSG3'] });
    expect(await bot.reply('6281111111111', 'makan 25rb bca', 'MSG3')).toBeNull();
    expect(parser.parse).not.toHaveBeenCalled();
    expect(transactions.create).not.toHaveBeenCalled();
  });

  it('stays silent when a concurrent duplicate hits the unique constraint', async () => {
    const { bot } = setup(expense('bca'), { createError: Object.assign(new Error('unique'), { code: 'P2002' }) });
    expect(await bot.reply('6281111111111', 'makan 25rb bca', 'MSG4')).toBeNull();
  });

  it('rounds fractional AI amounts to whole rupiah', async () => {
    const { bot, transactions } = setup(expense('bca', 12500.4));
    await bot.reply('6281111111111', 'kopi 12,5rb bca', 'MSG5');
    expect(transactions.create).toHaveBeenCalledWith('u1', expect.objectContaining({ amount: 12500 }));
  });

  it('processes user messages that start with words the old prefix filter dropped', async () => {
    const { bot, parser } = setup(expense('bca'));
    await bot.reply('6281111111111', 'Tolong catat makan 25rb pakai bca', 'MSG6');
    expect(parser.parse).toHaveBeenCalled();
  });

  it('gives the parser the account names as a list', async () => {
    const { bot, parser } = setup(expense('bca'));
    await bot.reply('6281111111111', 'kopi 25rb bca', 'MSG7');
    expect(parser.parse).toHaveBeenCalledWith('kopi 25rb bca', { accounts: ['BCA', 'TUNAI', 'GO PAY'] });
  });

  it('refuses amounts above Rp 1 triliun, like the manual form', async () => {
    for (const amount of [1e12 + 1, 1e23]) {
      const { bot, transactions } = setup(expense('bca', amount));
      const reply = await bot.reply('6281111111111', `gaji ${amount} bca`, `BIG-${amount}`);
      expect(transactions.create).not.toHaveBeenCalled();
      expect(reply).toMatch(/^Nominal terlalu besar/);
    }
  });

  it('refuses a transfer to the same account', async () => {
    const { bot, transactions } = setup({ isTransaction: true, type: 'TRANSFER', amount: 50000, fromAccount: 'BCA', toAccount: 'bca', confidence: 0.95 });
    const reply = await bot.reply('6281111111111', 'transfer 50rb bca ke bca', 'MSG8');
    expect(transactions.create).not.toHaveBeenCalled();
    expect(reply).toContain('Rekening sumber dan tujuan transfer sama (BCA)');
  });

  it('reads a short answer to its question together with the earlier message', async () => {
    const { bot, parser, transactions } = setup({});
    // Like the parser: an account only when the text names one
    parser.parse.mockImplementation(async (text: string) => ({
      source: 'test', status: 'success',
      data: { ...expense(/ovo/i.test(text) ? 'TUNAI' : ''), amount: 9000 } as Record<string, unknown>,
    }));

    expect(await bot.reply('6281111111111', '9rb grabbike', 'F1')).toMatch(/^Dibayar pakai rekening apa\?/);
    await bot.reply('6281111111111', 'OVO', 'F2');
    expect(parser.parse).toHaveBeenLastCalledWith('9rb grabbike OVO', expect.anything());
    expect(transactions.create).toHaveBeenCalledWith('u1', expect.objectContaining({ amount: 9000, rawText: '9rb grabbike OVO', sourceMessageId: 'F2' }));

    // The question is answered once; a later "OVO" is a new message
    await bot.reply('6281111111111', 'OVO', 'F3');
    expect(parser.parse).toHaveBeenLastCalledWith('OVO', expect.anything());
  });

  it('treats a long new message after a question as a new message', async () => {
    const { bot, parser } = setup({ ...expense(''), amount: 9000 });
    await bot.reply('6281111111111', '9rb grabbike', 'G1');
    await bot.reply('6281111111111', 'makan siang 25rb pakai BCA tadi', 'G2');
    expect(parser.parse).toHaveBeenLastCalledWith('makan siang 25rb pakai BCA tadi', expect.anything());
  });

  it('passes the parser\'s own message through when it cannot read the text', async () => {
    const { bot, parser } = setup({});
    parser.parse.mockResolvedValueOnce({ source: 'regex_fallback', status: 'error', message: 'Maaf, pesan ini belum bisa saya pahami.' } as any);
    expect(await bot.reply('6281111111111', 'halo', 'MSG9')).toBe('Maaf, pesan ini belum bisa saya pahami.');
  });
});

describe('BotService lending and debt', () => {
  it('says a debt payment changes the balance but is not counted as spending', async () => {
    const { bot } = setup({ ...expense('bca', 150000), category: 'DEBT', subcategory: 'Talangin makan Budi' });
    const reply = await bot.reply('6281111111111', 'talangin makan Budi 150rb pakai BCA', 'MSG-D1');
    expect(reply).toContain('Utang-piutang Rp');
    expect(reply).toContain('Tidak dihitung sebagai pengeluaran');
    expect(reply).toContain('Sisa saldo BCA');
  });

  it('lists lending and debt apart in /rekap', async () => {
    const { bot, transactions } = setup({});
    transactions.monthlySummary.mockResolvedValue({
      totalIncome: 1000000, totalExpense: 200000, expenseByCategory: {}, debtOut: 150000, debtIn: 50000, year: 2026, month: 11, timezone: 'Asia/Jakarta',
    });
    (bot as any).budgets = { list: jest.fn(async () => []) };
    const reply = await bot.reply('6281111111111', '/rekap', 'MSG-D2');
    expect(reply).toContain('Utang-piutang');
    expect(reply).toMatch(/Keluar.*150\.000/);
    expect(reply).toMatch(/Masuk.*50\.000/);
  });
});

describe('normalizeAccountName', () => {
  it('ignores case, spaces and punctuation', () => {
    expect(normalizeAccountName(' go-pay ')).toBe('GOPAY');
    expect(normalizeAccountName('Bank BCA')).toBe('BANKBCA');
  });
});
