import { NOT_UNDERSTOOD_REPLY, parseWithRegex } from './regex-parser';

const ACCOUNTS = ['BCA', 'GoPay', 'TUNAI'];
const parse = (text: string) => {
  const r = parseWithRegex(text, ACCOUNTS);
  if (r.status !== 'success') throw new Error(`not parsed: ${text}`);
  return r.data;
};

describe('parseWithRegex', () => {
  it('reads an everyday expense', () => {
    expect(parse('makan siang 25rb pakai BCA')).toMatchObject({
      type: 'EXPENSE', amount: 25000, fromAccount: 'BCA', category: 'FOOD', subcategory: 'makan siang', confidence: 0.5,
    });
  });

  it('understands Indonesian amount formats', () => {
    expect(parse('beli sepatu 1,5jt bca').amount).toBe(1_500_000);
    expect(parse('bayar kos Rp1.500.000 bca').amount).toBe(1_500_000);
    expect(parse('parkir 5 rb tunai').amount).toBe(5000);
    expect(parse('bensin ceban gopay').amount).toBe(10_000);
    expect(parse('kopi 18k, gopay').amount).toBe(18_000);
  });

  it('matches the user\'s own account names, with cash = tunai and Go-Pay = GoPay', () => {
    expect(parse('jajan 10rb cash').fromAccount).toBe('TUNAI');
    expect(parse('jajan 10rb pakai Go-Pay').fromAccount).toBe('GoPay');
  });

  it('reads income only from income words, not from a stray "masuk"', () => {
    expect(parse('gaji 5jt masuk ke BCA')).toMatchObject({ type: 'INCOME', toAccount: 'BCA', category: 'INCOME' });
    expect(parse('uang 200rb masuk ke gopay')).toMatchObject({ type: 'INCOME', toAccount: 'GoPay' });
    expect(parse('beli sesuatu 30rb pakai BCA biar tidak masuk review').type).toBe('EXPENSE');
  });

  it('reads transfers between two different accounts', () => {
    expect(parse('transfer 100rb dari BCA ke GoPay')).toMatchObject({ type: 'TRANSFER', fromAccount: 'BCA', toAccount: 'GoPay' });
    expect(parse('top up gopay 50rb pakai bca')).toMatchObject({ type: 'TRANSFER', fromAccount: 'BCA', toAccount: 'GoPay' });
  });

  it('never guesses a transfer to the same account', () => {
    const data = parse('kopi 25rb bca, lalu transfer 500rb dari BCA');
    expect(data.type).toBe('TRANSFER');
    expect(data.fromAccount).toBe('BCA');
    expect(data.toAccount).toBeUndefined(); // the bot then asks for both accounts
  });

  it('files lending and debt under DEBT, out or in depending on who pays', () => {
    const out = ['talangin makan Budi 150rb pakai BCA', 'minjemin Andi 200rb dari gopay', 'bayar utang ke Sinta 100rb pakai BCA', 'bayarin tiket Rani 300rb BCA'];
    for (const text of out) expect(parse(text)).toMatchObject({ type: 'EXPENSE', category: 'DEBT', fromAccount: expect.any(String) });
    const back = ['Budi bayar utang 150rb ke BCA', 'Andi transfer ganti uang 50rb ke gopay', 'uang talangan Rani kembali 300rb masuk ke BCA', 'pinjam dari Sinta 500rb masuk BCA', 'Budi bayar utang ke aku 75rb BCA'];
    for (const text of back) expect(parse(text)).toMatchObject({ type: 'INCOME', category: 'DEBT', toAccount: expect.any(String) });
    expect(parse('talangin makan Budi 150rb pakai BCA').subcategory).toBe('talangin makan Budi');
  });

  it('keeps a transfer between two own accounts a transfer, even with debt words', () => {
    expect(parse('transfer 100rb dari BCA ke GoPay buat bayar utang')).toMatchObject({ type: 'TRANSFER', category: 'OTHER' });
  });

  it('leaves the account empty when none is mentioned instead of assuming cash', () => {
    expect(parse('makan 20rb').fromAccount).toBeUndefined();
  });

  it('answers in Indonesian when there is no amount', () => {
    for (const text of ['halo', 'Could you help me', 'pengeluaran -50000 dari BCA']) {
      expect(parseWithRegex(text, ACCOUNTS)).toEqual({ source: 'regex_fallback', status: 'error', message: NOT_UNDERSTOOD_REPLY });
    }
  });
});
