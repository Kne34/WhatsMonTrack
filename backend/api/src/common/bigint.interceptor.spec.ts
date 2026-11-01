import { bigintToNumber } from './bigint.interceptor';

describe('bigintToNumber', () => {
  it('converts nested bigints and keeps everything else', () => {
    const date = new Date('2026-11-01T00:00:00Z');
    const out = bigintToNumber({
      data: [{ amount: 25000n, createdAt: date, fromAccount: { balance: -1500n, name: 'BCA' }, toAccount: null }],
      total: 1,
    });
    expect(out).toEqual({
      data: [{ amount: 25000, createdAt: date, fromAccount: { balance: -1500, name: 'BCA' }, toAccount: null }],
      total: 1,
    });
    expect(out.data[0].createdAt).toBe(date);
    expect(() => JSON.stringify(out)).not.toThrow();
  });
});
