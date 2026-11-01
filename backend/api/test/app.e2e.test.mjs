// End-to-end tests: real HTTP + real PostgreSQL, with WhatsApp and email replaced by fakes.
//
//   TEST_DATABASE_URL=postgresql://... npm run test:e2e
//
// The database must already be migrated (`npx prisma migrate deploy`). ALL TABLES ARE WIPED,
// so this refuses to run without TEST_DATABASE_URL — never point it at real data.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

if (!process.env.TEST_DATABASE_URL) {
  console.error('TEST_DATABASE_URL is not set; refusing to run (tests wipe the database).');
  process.exit(1);
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.JWT_SECRET = 'e2e-test-secret-that-is-at-least-32-chars';
process.env.ADMIN_EMAILS = 'admin@test.com';

const { Test } = require('@nestjs/testing');
const request = require('supertest');
const { AppModule } = require('../dist/app.module');
const { configureApp } = require('../dist/app.setup');
const { WhatsAppService } = require('../dist/whatsapp/whatsapp.service');
const { MailService } = require('../dist/auth/mail.service');
const { BotService } = require('../dist/whatsapp/bot.service');
const { ParserService } = require('../dist/parser/parser.service');
const { PrismaService } = require('../dist/database/prisma.service');

// ---- fakes ----
const BOT_PHONE = '6280000000000';
const fakeWhatsApp = {
  connected: true,
  resets: 0,
  onModuleInit: async () => {},
  isConnected() { return this.connected; },
  botPhoneNumber() { return this.connected ? BOT_PHONE : null; },
  getConnectionStatus: () => ({ connected: true, qr: 'SECRET-QR' }),
  async resetSession() { this.resets++; return { success: true }; },
};
const mailOutbox = [];
const fakeMail = { async sendOtp(to, code) { mailOutbox.push({ to, code }); } };

/** Deterministic stand-in for Gemini: "<item> <amount> <account>", e.g. "kopi 25000 bca". */
const fakeParser = {
  parseCalls: 0,
  async parse(text) {
    this.parseCalls++;
    const [subcategory, amount, account] = text.split(' ');
    return { source: 'fake', status: 'success', data: {
      isTransaction: true, type: 'EXPENSE', amount: Number(amount), category: 'FOOD', subcategory, fromAccount: account, confidence: 0.95,
    } };
  },
};

const lastMailCode = (to) => mailOutbox.filter((m) => m.to === to).at(-1).code;

let app, http, prisma;

before(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(WhatsAppService).useValue(fakeWhatsApp)
    .overrideProvider(MailService).useValue(fakeMail)
    .overrideProvider(ParserService).useValue(fakeParser)
    .compile();
  app = configureApp(moduleRef.createNestApplication());
  await app.init();
  http = () => request(app.getHttpServer());
  prisma = app.get(PrismaService);
  await prisma.$executeRawUnsafe('TRUNCATE "Transaction", "Account", "Budget", "User" CASCADE');
});

after(async () => {
  await app?.close();
});

/** Registers + verifies a user (email only) through the public API and returns its bearer token. */
async function signUp(email, password = 'password123') {
  const reg = await http().post('/api/auth/register').send({ email, password });
  assert.equal(reg.body.success, true, JSON.stringify(reg.body));
  const res = await http().post('/api/auth/verify-otp').send({ email, otpCode: lastMailCode(email) });
  assert.equal(res.body.success, true, JSON.stringify(res.body));
  return res.body.token;
}

/** Simulates an incoming WhatsApp text from `phone` through the real bot routing. */
const incomingWhatsApp = (phone, text) => app.get(BotService).reply(phone, text);

/** Requests a link code on the web, then "sends" it to the bot from `phone`. Returns the bot reply. */
async function linkPhone(token, phone, enteredPhone) {
  const res = await http().post('/api/phone/link').set(auth(token))
    .send(enteredPhone ? { phoneNumber: enteredPhone } : {}).expect(201);
  return incomingWhatsApp(phone, res.body.message);
}
const auth = (token) => ({ Authorization: `Bearer ${token}` });

describe('registration (email only)', () => {
  test('works while the WhatsApp bot is offline', async () => {
    fakeWhatsApp.connected = false;
    try {
      const token = await signUp('alice@test.com');
      const me = await http().get('/api/auth/me').set(auth(token)).expect(200);
      assert.equal(me.body.email, 'alice@test.com');
      assert.equal(me.body.phoneNumber, null);
    } finally {
      fakeWhatsApp.connected = true;
    }
  });

  test('phoneNumber is no longer accepted at registration', async () => {
    await http().post('/api/auth/register')
      .send({ email: 'x@test.com', password: 'password123', phoneNumber: '081111111111' }).expect(400);
  });
});

describe('linking a WhatsApp number after login', () => {
  let alice, carol;
  before(async () => {
    alice = (await http().post('/api/auth/login').send({ email: 'alice@test.com', password: 'password123' })).body.token;
    carol = await signUp('carol@test.com');
  });

  test('cannot create a link code while the bot is offline', async () => {
    fakeWhatsApp.connected = false;
    try {
      await http().post('/api/phone/link').set(auth(alice)).send({}).expect(503);
    } finally {
      fakeWhatsApp.connected = true;
    }
  });

  test('the link code comes with a wa.me link to the bot', async () => {
    const res = await http().post('/api/phone/link').set(auth(alice)).send({}).expect(201);
    assert.match(res.body.code, /^[A-Z2-9]{6}$/);
    assert.equal(res.body.waLink, `https://wa.me/${BOT_PHONE}?text=VERIFIKASI%20${res.body.code}`);
    const status = await http().get('/api/phone').set(auth(alice)).expect(200);
    assert.equal(status.body.pending.code, res.body.code);
  });

  test('unlinked numbers get instructions once, then silence', async () => {
    assert.match(await incomingWhatsApp('6281111111111', 'makan 10k'), /belum terhubung/);
    assert.equal(await incomingWhatsApp('6281111111111', 'makan 10k'), null);
  });

  test('sending the code from WhatsApp links that number (0812… is normalised)', async () => {
    const reply = await linkPhone(alice, '6281111111111', '0811-1111-1111');
    assert.match(reply, /^Berhasil!/);
    const me = await http().get('/api/auth/me').set(auth(alice)).expect(200);
    assert.equal(me.body.phoneNumber, '6281111111111');
    assert.equal((await http().get('/api/phone').set(auth(alice))).body.pending, null);
  });

  test('a code made for one number cannot be used from another', async () => {
    const reply = await linkPhone(carol, '6289999999999', '082222222222');
    assert.match(reply, /nomor lain/);
    assert.equal((await http().get('/api/auth/me').set(auth(carol))).body.phoneNumber, null);
  });

  test('cannot take over a number linked to another account', async () => {
    await http().post('/api/phone/link').set(auth(carol)).send({ phoneNumber: '081111111111' }).expect(409);
    const reply = await linkPhone(carol, '6281111111111');
    assert.match(reply, /akun lain/);
    assert.equal((await http().get('/api/auth/me').set(auth(alice))).body.phoneNumber, '6281111111111');
  });

  test('the number can be switched and unlinked', async () => {
    assert.match(await linkPhone(carol, '6282222222222'), /^Berhasil!/);
    assert.match(await linkPhone(carol, '6283333333333'), /^Berhasil!/);
    assert.equal((await http().get('/api/auth/me').set(auth(carol))).body.phoneNumber, '6283333333333');
    await http().delete('/api/phone').set(auth(carol)).expect(200);
    assert.equal((await http().get('/api/auth/me').set(auth(carol))).body.phoneNumber, null);
  });
});

describe('ownership & validation', () => {
  let alice, bob, aliceAccount;

  before(async () => {
    alice = (await http().post('/api/auth/login').send({ email: 'alice@test.com', password: 'password123' })).body.token;
    bob = await signUp('admin@test.com'); // also the admin (ADMIN_EMAILS)
    aliceAccount = (await http().post('/api/accounts').set(auth(alice))
      .send({ name: 'bca', initialBalance: 100000 }).expect(201)).body;
  });

  test('other users cannot read, edit or delete my account', async () => {
    const list = await http().get('/api/accounts').set(auth(bob)).expect(200);
    assert.deepEqual(list.body, []);
    await http().put(`/api/accounts/${aliceAccount.id}`).set(auth(bob)).send({ balance: 0 }).expect(404);
    await http().delete(`/api/accounts/${aliceAccount.id}`).set(auth(bob)).expect(404);
  });

  test('cannot book a transaction against someone else’s account', async () => {
    await http().post('/api/transactions/manual').set(auth(bob))
      .send({ data: { type: 'EXPENSE', amount: 1000, fromAccountId: aliceAccount.id } })
      .expect(404);
    const acc = await prisma.account.findUnique({ where: { id: aliceAccount.id } });
    assert.equal(Number(acc.balance), 100000);
  });

  test('unknown fields such as userId are rejected', async () => {
    await http().put(`/api/accounts/${aliceAccount.id}`).set(auth(alice))
      .send({ name: 'x', userId: 'someone-else' }).expect(400);
  });

  test('balances follow create → edit → delete of a transaction', async () => {
    const balance = async () => Number((await prisma.account.findUnique({ where: { id: aliceAccount.id } })).balance);

    const created = await http().post('/api/transactions/manual').set(auth(alice))
      .send({ data: { type: 'EXPENSE', amount: 50000, category: 'FOOD', fromAccountId: aliceAccount.id } })
      .expect(201);
    assert.equal(await balance(), 50000);

    const txId = created.body.transaction.id;
    await http().put(`/api/transactions/${txId}`).set(auth(bob)).send({ amount: 1 }).expect(404);
    await http().put(`/api/transactions/${txId}`).set(auth(alice)).send({ amount: 30000 }).expect(200);
    assert.equal(await balance(), 70000);

    await http().delete(`/api/transactions/${txId}`).set(auth(bob)).expect(404);
    await http().delete(`/api/transactions/${txId}`).set(auth(alice)).expect(200);
    assert.equal(await balance(), 100000);
  });

  test('requests without a token are rejected', async () => {
    await http().get('/api/accounts').expect(401);
    await http().get('/api/whatsapp/status').expect(401);
    await http().post('/parse').send({ text: 'makan 10k' }).expect(401);
    await http().post('/api/phone/link').send({}).expect(401);
  });

  test('only admins see the QR code and can reset the bot', async () => {
    const asUser = await http().get('/api/whatsapp/status').set(auth(alice)).expect(200);
    assert.equal(asUser.body.qr, '');
    assert.equal(asUser.body.canManage, false);
    await http().post('/api/whatsapp/reset').set(auth(alice)).expect(403);

    const asAdmin = await http().get('/api/whatsapp/status').set(auth(bob)).expect(200);
    assert.equal(asAdmin.body.qr, 'SECRET-QR');
    await http().post('/api/whatsapp/reset').set(auth(bob)).expect(201);
    assert.equal(fakeWhatsApp.resets, 1);
  });
});

describe('money, time zones and the WhatsApp bot (real database)', () => {
  let token, user, account;

  before(async () => {
    const reg = await http().post('/api/auth/register')
      .send({ email: 'dina@test.com', password: 'password123', timeZone: 'Asia/Jakarta' });
    assert.equal(reg.body.success, true, JSON.stringify(reg.body));
    token = (await http().post('/api/auth/verify-otp').send({ email: 'dina@test.com', otpCode: lastMailCode('dina@test.com') })).body.token;
    user = await prisma.user.findUnique({ where: { email: 'dina@test.com' } });
    account = (await http().post('/api/accounts').set(auth(token)).send({ name: 'BCA', initialBalance: 1000000 }).expect(201)).body;
    await prisma.user.update({ where: { id: user.id }, data: { phoneNumber: '6285555555555' } });
  });

  test('the browser time zone is stored at registration', () => {
    assert.equal(user.timezone, 'Asia/Jakarta');
  });

  test('money is stored as BIGINT and returned as plain JSON numbers', async () => {
    assert.equal(typeof account.balance, 'number');
    assert.equal(account.balance, 1000000);
    const row = await prisma.account.findUnique({ where: { id: account.id } });
    assert.equal(typeof row.balance, 'bigint');
    const list = await http().get('/api/accounts').set(auth(token)).expect(200);
    assert.equal(list.body[0].balance, 1000000);
  });

  test('fractional rupiah amounts are rejected', async () => {
    await http().post('/api/transactions/manual').set(auth(token))
      .send({ data: { type: 'EXPENSE', amount: 12.5, fromAccountId: account.id } }).expect(400);
  });

  test('month and day filters follow the user zone (06:30 WIB on Nov 1 is November, not October)', async () => {
    await http().post('/api/transactions/manual').set(auth(token))
      .send({ data: { type: 'EXPENSE', amount: 30000, category: 'FOOD', fromAccountId: account.id, createdAt: '2026-10-31T23:30:00.000Z' } })
      .expect(201);
    const nov = await http().get('/api/transactions?month=11&year=2026').set(auth(token)).expect(200);
    const oct = await http().get('/api/transactions?month=10&year=2026').set(auth(token)).expect(200);
    const nov1 = await http().get('/api/transactions?month=11&year=2026&day=1').set(auth(token)).expect(200);
    assert.equal(nov.body.total, 1);
    assert.equal(oct.body.total, 0);
    assert.equal(nov1.body.total, 1);
    assert.equal(typeof nov.body.data[0].amount, 'number');
  });

  test('the same WhatsApp message is recorded only once, even if delivered again', async () => {
    const bot = app.get(BotService);
    const callsBefore = fakeParser.parseCalls;
    const first = await bot.reply('6285555555555', 'kopi 25000 bca', 'WAMSG-1');
    const again = await bot.reply('6285555555555', 'kopi 25000 bca', 'WAMSG-1');

    assert.match(first, /^Berhasil!/);
    assert.equal(again, null);
    assert.equal(fakeParser.parseCalls, callsBefore + 1, 'the AI is not called for the duplicate');
    assert.equal(await prisma.transaction.count({ where: { sourceMessageId: 'WAMSG-1' } }), 1);
    const bal = await prisma.account.findUnique({ where: { id: account.id } });
    assert.equal(Number(bal.balance), 1000000 - 30000 - 25000);
  });

  test('the database rejects a second transaction for the same message id', async () => {
    await assert.rejects(
      prisma.transaction.create({ data: { userId: user.id, type: 'EXPENSE', amount: 1, category: 'X', sourceMessageId: 'WAMSG-1' } }),
      (err) => err.code === 'P2002',
    );
  });

  test('an unknown account name is reported back, not created', async () => {
    const before = await prisma.account.count({ where: { userId: user.id } });
    const reply = await app.get(BotService).reply('6285555555555', 'bensin 50000 mandiri', 'WAMSG-2');
    assert.match(reply, /Rekening "mandiri" tidak ditemukan/);
    assert.equal(await prisma.account.count({ where: { userId: user.id } }), before);
    assert.equal(await prisma.transaction.count({ where: { sourceMessageId: 'WAMSG-2' } }), 0);
  });
});
