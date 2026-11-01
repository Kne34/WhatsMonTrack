jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));

import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { LINK_MESSAGE_REGEX, PhoneLinkService, waLink } from './phone-link.service';

type UserRow = Record<string, any>;
const BOT = '6280000000000';

function setup(users: UserRow[] = []) {
  const db: UserRow[] = users.map((u) => ({ isVerified: true, phoneNumber: null, phoneLinkCode: null, pendingPhone: null, ...u }));
  const moved: string[] = [];
  const match = (where: any) => (u: UserRow) => Object.entries(where).every(([k, v]) => u[k] === v);
  const user = {
    findUnique: jest.fn(async ({ where }) => db.find(match(where)) ?? null),
    findUniqueOrThrow: jest.fn(async ({ where }) => db.find(match(where))!),
    update: jest.fn(async ({ where, data }) => Object.assign(db.find((x) => x.id === where.id)!, data)),
    delete: jest.fn(async ({ where }) => db.splice(db.findIndex((x) => x.id === where.id), 1)),
  };
  const many = (name: string) => ({
    updateMany: jest.fn(async ({ where }) => moved.push(`${name}:${where.userId}`)),
    deleteMany: jest.fn(async () => ({ count: 0 })),
    findMany: jest.fn(async () => []),
  });
  const tx = { user, account: many('account'), transaction: many('transaction'), budget: many('budget') };
  const prisma = { user, $transaction: (fn: any) => fn(tx) };
  return { service: new PhoneLinkService(prisma as any), db, moved };
}

describe('PhoneLinkService.start', () => {
  it('refuses while the bot is offline', async () => {
    const { service } = setup([{ id: 'u1' }]);
    await expect(service.start('u1', undefined, null)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('returns a code and a wa.me link that pre-fills the verification message', async () => {
    const { service, db } = setup([{ id: 'u1' }]);
    const res = await service.start('u1', undefined, BOT);

    expect(res.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(res.waLink).toBe(`https://wa.me/${BOT}?text=VERIFIKASI%20${res.code}`);
    expect(LINK_MESSAGE_REGEX.exec(res.message)?.[1]).toBe(res.code);
    expect(db[0].phoneLinkCode).toBe(res.code);
  });

  it('normalises the optional phone number', async () => {
    const { service, db } = setup([{ id: 'u1' }]);
    await service.start('u1', '0812-1111-1111', BOT);
    expect(db[0].pendingPhone).toBe('6281211111111');
  });

  it('refuses a number already linked to another verified account', async () => {
    const { service } = setup([{ id: 'u1' }, { id: 'u2', phoneNumber: '6281211111111' }]);
    await expect(service.start('u1', '081211111111', BOT)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('PhoneLinkService.confirm', () => {
  async function withCode(extra: UserRow[] = [], phone?: string) {
    const ctx = setup([{ id: 'u1', email: 'a@test.com' }, ...extra]);
    const { code } = await ctx.service.start('u1', phone, BOT);
    return { ...ctx, code };
  }

  it('links the sender number to the account that requested the code', async () => {
    const { service, db, code } = await withCode();
    const reply = await service.confirm(code.toLowerCase(), '081211111111');

    expect(reply).toMatch(/^Berhasil!/);
    expect(db[0]).toMatchObject({ phoneNumber: '6281211111111', phoneLinkCode: null });
  });

  it('rejects unknown and expired codes', async () => {
    const { service, db, code } = await withCode();
    expect(await service.confirm('ZZZZZZ', '6281211111111')).toMatch(/tidak valid/);
    db[0].phoneLinkExpiresAt = new Date(Date.now() - 1000);
    expect(await service.confirm(code, '6281211111111')).toMatch(/tidak valid/);
    expect(db[0].phoneNumber).toBeNull();
  });

  it('only the number entered on the web can use the code', async () => {
    const { service, db, code } = await withCode([], '081211111111');
    expect(await service.confirm(code, '6289999999999')).toMatch(/nomor lain/);
    expect(db[0].phoneNumber).toBeNull();
    expect(await service.confirm(code, '6281211111111')).toMatch(/^Berhasil!/);
  });

  it('does not steal a number that belongs to another verified account', async () => {
    const { service, db, code } = await withCode([{ id: 'u2', phoneNumber: '6281211111111' }]);
    expect(await service.confirm(code, '6281211111111')).toMatch(/akun lain/);
    expect(db[0].phoneNumber).toBeNull();
    expect(db[1].phoneNumber).toBe('6281211111111');
  });

  it('absorbs data of a leftover unverified user that had this number', async () => {
    const { service, db, moved, code } = await withCode([{ id: 'orphan', phoneNumber: '6281211111111', isVerified: false }]);
    expect(await service.confirm(code, '6281211111111')).toMatch(/^Berhasil!/);
    expect(moved).toEqual(expect.arrayContaining(['account:orphan', 'transaction:orphan']));
    expect(db.find((u) => u.id === 'orphan')).toBeUndefined();
    expect(db[0].phoneNumber).toBe('6281211111111');
  });

  it('rate-limits a sender guessing codes', async () => {
    const { service, code } = await withCode();
    for (let i = 0; i < 5; i++) await service.confirm('ZZZZZZ', '6281211111111');
    expect(await service.confirm(code, '6281211111111')).toMatch(/Terlalu banyak/);
  });
});

describe('waLink / LINK_MESSAGE_REGEX', () => {
  it('round-trips', () => {
    const url = new URL(waLink(BOT, 'ABC234'));
    expect(url.pathname).toBe(`/${BOT}`);
    expect(LINK_MESSAGE_REGEX.exec(url.searchParams.get('text')!)?.[1]).toBe('ABC234');
  });
});
