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
const { useDatabaseAuthState, clearDatabaseAuthState, isBotStopped, setBotStopped } = require('../dist/whatsapp/db-auth-state');

// ---- fakes ----
const BOT_PHONE = '6280000000000';
const fakeWhatsApp = {
  connected: true,
  resets: 0,
  stops: 0,
  starts: 0,
  onModuleInit: async () => {},
  isConnected() { return this.connected; },
  botPhoneNumber() { return this.connected ? BOT_PHONE : null; },
  getConnectionStatus: () => ({ connected: true, qr: 'SECRET-QR', state: 'connected' }),
  async resetSession() { this.resets++; return { success: true }; },
  async stop() { this.stops++; return { success: true, state: 'stopped' }; },
  async start() { this.starts++; return { success: true, state: 'connecting' }; },
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
  await prisma.$executeRawUnsafe('TRUNCATE "ChatMessage", "Transaction", "Account", "Budget", "User", "WhatsAppAuth" CASCADE');
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

  test('the bot state is reported, and only admins see the bot number', async () => {
    const asUser = await http().get('/api/whatsapp/status').set(auth(alice)).expect(200);
    assert.equal(asUser.body.state, 'connected');
    assert.equal(asUser.body.botPhone, null);
    const asAdmin = await http().get('/api/whatsapp/status').set(auth(bob)).expect(200);
    assert.equal(asAdmin.body.botPhone, BOT_PHONE);
  });

  test('only admins can unlink (stop) and start the bot', async () => {
    await http().post('/api/whatsapp/stop').expect(401);
    await http().post('/api/whatsapp/stop').set(auth(alice)).expect(403);
    await http().post('/api/whatsapp/start').set(auth(alice)).expect(403);
    assert.equal(fakeWhatsApp.stops, 0);

    const stopped = await http().post('/api/whatsapp/stop').set(auth(bob)).expect(201);
    assert.equal(stopped.body.state, 'stopped');
    await http().post('/api/whatsapp/start').set(auth(bob)).expect(201);
    assert.equal(fakeWhatsApp.stops, 1);
    assert.equal(fakeWhatsApp.starts, 1);
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

  test('transaction filters: type, category, account, text and status (combined, with the right total)', async () => {
    const ovo = (await http().post('/api/accounts').set(auth(token)).send({ name: 'OVO filter', initialBalance: 500000 }).expect(201)).body;
    const add = (data) => http().post('/api/transactions/manual').set(auth(token))
      .send({ data: { createdAt: '2026-12-05T05:00:00.000Z', ...data } }).expect(201);
    await add({ type: 'EXPENSE', amount: 40000, category: 'FOOD', subcategory: 'Bakmi Acet', fromAccountId: ovo.id });
    await add({ type: 'EXPENSE', amount: 161500, category: 'DEBT', subcategory: 'Talangin bakmi acet', fromAccountId: ovo.id });
    await add({ type: 'INCOME', amount: 29000, category: 'DEBT', subcategory: 'Elbert bayar utang', toAccountId: account.id });
    await add({ type: 'TRANSFER', amount: 10000, fromAccountId: account.id, toAccountId: ovo.id });

    const list = async (params) => (await http().get('/api/transactions').query({ month: 12, year: 2026, ...params }).set(auth(token)).expect(200)).body;
    assert.equal((await list({})).total, 4);
    assert.equal((await list({ type: 'EXPENSE' })).total, 2);
    assert.equal((await list({ category: 'debt' })).total, 2); // case-insensitive
    assert.equal((await list({ accountId: ovo.id })).total, 3); // out of OVO, and the transfer into it
    assert.equal((await list({ q: 'ACET' })).total, 2);
    const combined = await list({ type: 'EXPENSE', category: 'DEBT', accountId: ovo.id, q: 'bakmi', limit: 1 });
    assert.equal(combined.total, 1);
    assert.equal(combined.totalPages, 1);
    assert.equal(combined.data[0].subcategory, 'Talangin bakmi acet');
    assert.equal((await list({ status: 'NEEDS_REVIEW' })).total, 0);

    await http().get('/api/transactions?type=LOAN').set(auth(token)).expect(400);
    await http().get('/api/transactions?accountId=not-a-uuid').set(auth(token)).expect(400);
  });
});

describe('WhatsApp session stored in PostgreSQL', () => {
  test('credentials and keys survive a restart and are wiped by a reset', async () => {
    const first = await useDatabaseAuthState(prisma);
    await first.saveCreds();
    await first.state.keys.set({ 'pre-key': { 1: { public: Buffer.from([1]), private: Buffer.from([2]) } } });

    const restarted = await useDatabaseAuthState(prisma);
    assert.equal(restarted.state.creds.registrationId, first.state.creds.registrationId);
    assert.deepEqual(restarted.state.creds.noiseKey.private, first.state.creds.noiseKey.private);
    const keys = await restarted.state.keys.get('pre-key', ['1']);
    assert.deepEqual(keys['1'].private, Buffer.from([2]));

    await clearDatabaseAuthState(prisma);
    assert.equal(await prisma.whatsAppAuth.count(), 0);
  });

  test('the "stopped" mark survives a restart and is cleared by start or a reset', async () => {
    assert.equal(await isBotStopped(prisma), false);
    await setBotStopped(prisma, true);
    await setBotStopped(prisma, true); // idempotent
    assert.equal(await isBotStopped(prisma), true);
    await setBotStopped(prisma, false);
    assert.equal(await isBotStopped(prisma), false);

    await setBotStopped(prisma, true);
    await clearDatabaseAuthState(prisma);
    assert.equal(await isBotStopped(prisma), false);
  });
});

describe('web chat with the bot (no bot number needed)', () => {
  let token, other, account;
  before(async () => {
    // Existing users (sign-up is rate limited): carol has no accounts yet
    const login = async (email) => (await http().post('/api/auth/login').send({ email, password: 'password123' }).expect(201)).body.token;
    token = await login('carol@test.com');
    other = await login('alice@test.com');
    account = (await http().post('/api/accounts').set(auth(token)).send({ name: 'BCA', initialBalance: 100000 }).expect(201)).body;
  });

  test('works while the WhatsApp bot is offline and without a linked phone', async () => {
    fakeWhatsApp.connected = false;
    try {
      const res = await http().post('/api/chat').set(auth(token)).send({ text: '  kopi 25000 bca  ' }).expect(201);
      assert.equal(res.body.message.text, 'kopi 25000 bca');
      assert.equal(res.body.message.fromBot, false);
      assert.equal(res.body.reply.fromBot, true);
      assert.match(res.body.reply.text, /^Berhasil!/);
    } finally {
      fakeWhatsApp.connected = true;
    }
    const acc = (await http().get('/api/accounts').set(auth(token)).expect(200)).body.find((a) => a.id === account.id);
    assert.equal(Number(acc.balance), 75000);
    const txs = (await http().get('/api/transactions').set(auth(token)).expect(200)).body.data;
    assert.equal(txs.length, 1);
    assert.equal(txs[0].rawText, 'kopi 25000 bca');
  });

  test('commands work too, and the history is kept in order', async () => {
    const res = await http().post('/api/chat').set(auth(token)).send({ text: '/rekap' }).expect(201);
    assert.match(res.body.reply.text, /Rekap Bulan Ini/);
    const history = (await http().get('/api/chat').set(auth(token)).expect(200)).body;
    assert.deepEqual(history.map((m) => m.fromBot), [false, true, false, true]);
    assert.equal(history[2].text, '/rekap');
  });

  test('a failing parser still gets a reply and records nothing', async () => {
    const original = fakeParser.parse;
    fakeParser.parse = async () => { throw new Error('AI down'); };
    try {
      const res = await http().post('/api/chat').set(auth(token)).send({ text: 'teh 5000 bca' }).expect(201);
      assert.match(res.body.reply.text, /gagal diproses/);
    } finally {
      fakeParser.parse = original;
    }
    assert.equal((await http().get('/api/transactions').set(auth(token)).expect(200)).body.data.length, 1);
  });

  test('history is private, validated, and can be cleared', async () => {
    assert.deepEqual((await http().get('/api/chat').set(auth(other)).expect(200)).body, []);
    await http().post('/api/chat').set(auth(token)).send({ text: '   ' }).expect(400);
    await http().post('/api/chat').set(auth(token)).send({ text: 'x'.repeat(501) }).expect(400);
    await http().get('/api/chat').expect(401);

    await http().delete('/api/chat').set(auth(other)).expect(200);
    assert.equal((await http().get('/api/chat').set(auth(token)).expect(200)).body.length, 6);
    const cleared = await http().delete('/api/chat').set(auth(token)).expect(200);
    assert.equal(cleared.body.deleted, 6);
    assert.deepEqual((await http().get('/api/chat').set(auth(token)).expect(200)).body, []);
    // Clearing the chat keeps the recorded transactions
    assert.equal((await http().get('/api/transactions').set(auth(token)).expect(200)).body.data.length, 1);
  });
});

describe('deleting an account together with its transactions', () => {
  let bob, alice, bca, gopay, cash;
  const balanceOf = async (id) => Number((await prisma.account.findUnique({ where: { id } })).balance);
  const book = (data) => http().post('/api/transactions/manual').set(auth(bob)).send({ data }).expect(201);

  before(async () => {
    const login = async (email) => (await http().post('/api/auth/login').send({ email, password: 'password123' }).expect(201)).body.token;
    bob = await login('admin@test.com');
    alice = await login('alice@test.com');
    const create = async (name, initialBalance) =>
      (await http().post('/api/accounts').set(auth(bob)).send({ name, initialBalance }).expect(201)).body;
    bca = await create('BCA', 1000000);
    gopay = await create('GoPay', 100000);
    cash = await create('Tunai', 50000);
    await book({ type: 'EXPENSE', amount: 50000, category: 'FOOD', fromAccountId: bca.id });
    await book({ type: 'INCOME', amount: 200000, category: 'INCOME', toAccountId: bca.id });
    await book({ type: 'TRANSFER', amount: 300000, category: 'OTHER', fromAccountId: bca.id, toAccountId: gopay.id });
    await book({ type: 'EXPENSE', amount: 20000, category: 'FOOD', fromAccountId: gopay.id });
  });

  test('the account list says how many transactions use each account', async () => {
    const list = (await http().get('/api/accounts').set(auth(bob)).expect(200)).body;
    const count = Object.fromEntries(list.map((a) => [a.name, a.transactionCount]));
    assert.deepEqual(count, { BCA: 3, GOPAY: 2, TUNAI: 0 });
  });

  test('an account in use is not deleted without asking (409 with the count)', async () => {
    const res = await http().delete(`/api/accounts/${bca.id}`).set(auth(bob)).expect(409);
    assert.equal(res.body.transactionCount, 3);
    assert.match(res.body.message, /3 transaksi/);
    assert.ok(await prisma.account.findUnique({ where: { id: bca.id } }));
  });

  test('other users cannot delete it, not even with transactions', async () => {
    await http().delete(`/api/accounts/${bca.id}?withTransactions=true`).set(auth(alice)).expect(404);
    assert.ok(await prisma.account.findUnique({ where: { id: bca.id } }));
  });

  test('withTransactions deletes all of them and gives transfers back to the other account', async () => {
    assert.equal(await balanceOf(gopay.id), 380000); // 100k + 300k transfer − 20k
    const res = await http().delete(`/api/accounts/${bca.id}?withTransactions=true`).set(auth(bob)).expect(200);
    assert.deepEqual(res.body, { success: true, deletedTransactions: 3 });
    assert.equal(await prisma.account.findUnique({ where: { id: bca.id } }), null);
    assert.equal(await balanceOf(gopay.id), 80000); // the transfer from BCA is undone; GoPay's own expense stays
    const left = (await http().get('/api/transactions').set(auth(bob)).expect(200)).body.data;
    assert.deepEqual(left.map((t) => [t.type, Number(t.amount)]), [['EXPENSE', 20000]]);
  });

  test('an unused account is deleted directly', async () => {
    const res = await http().delete(`/api/accounts/${cash.id}`).set(auth(bob)).expect(200);
    assert.deepEqual(res.body, { success: true, deletedTransactions: 0 });
  });
});
