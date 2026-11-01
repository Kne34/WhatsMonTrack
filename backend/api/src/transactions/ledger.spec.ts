import { applyToBalances, LedgerEntry } from './ledger';

function mockTx() {
  const update = jest.fn().mockResolvedValue({});
  return { tx: { account: { update } } as any, update };
}

const base = { amount: 50_000, fromAccountId: 'from', toAccountId: 'to' };

describe('applyToBalances', () => {
  it('EXPENSE debits only the source account', async () => {
    const { tx, update } = mockTx();
    await applyToBalances(tx, { ...base, type: 'EXPENSE' }, 1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ where: { id: 'from' }, data: { balance: { increment: -50_000 } } });
  });

  it('INCOME credits only the destination account', async () => {
    const { tx, update } = mockTx();
    await applyToBalances(tx, { ...base, type: 'INCOME' }, 1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ where: { id: 'to' }, data: { balance: { increment: 50_000 } } });
  });

  it('TRANSFER moves money between both accounts', async () => {
    const { tx, update } = mockTx();
    await applyToBalances(tx, { ...base, type: 'TRANSFER' }, 1);
    expect(update).toHaveBeenCalledWith({ where: { id: 'from' }, data: { balance: { increment: -50_000 } } });
    expect(update).toHaveBeenCalledWith({ where: { id: 'to' }, data: { balance: { increment: 50_000 } } });
  });

  it('direction -1 exactly reverses direction 1', async () => {
    for (const type of ['EXPENSE', 'INCOME', 'TRANSFER']) {
      const net: Record<string, number> = {};
      const tx = {
        account: {
          update: jest.fn(async ({ where, data }) => {
            net[where.id] = (net[where.id] || 0) + data.balance.increment;
          }),
        },
      } as any;
      const entry: LedgerEntry = { ...base, type };
      await applyToBalances(tx, entry, 1);
      await applyToBalances(tx, entry, -1);
      expect(Object.values(net).every((v) => v === 0)).toBe(true);
    }
  });

  it('skips missing accounts and non-balance types', async () => {
    const { tx, update } = mockTx();
    await applyToBalances(tx, { type: 'EXPENSE', amount: 1, fromAccountId: null, toAccountId: null }, 1);
    await applyToBalances(tx, { ...base, type: 'DEBT_OUT' }, 1);
    expect(update).not.toHaveBeenCalled();
  });
});
