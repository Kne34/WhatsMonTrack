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
const { PrismaService } = require('../dist/database/prisma.service');

// ---- fakes ----
const waOutbox = [];
const fakeWhatsApp = {
  connected: true,
  notOnWhatsApp: new Set(),
  resets: 0,
  onModuleInit: async () => {},
  isConnected() { return this.connected; },
  async sendToPhone(phone, text) {
    if (this.notOnWhatsApp.has(phone)) return false;
    waOutbox.push({ phone, text });
    return true;
  },
  getConnectionStatus: () => ({ connected: true, qr: 'SECRET-QR' }),
  async resetSession() { this.resets++; return { success: true }; },
};
const mailOutbox = [];
const fakeMail = { async sendOtp(to, code) { mailOutbox.push({ to, code }); } };

const lastWaCode = (phone) => /\*(\d{6})\*/.exec(waOutbox.filter((m) => m.phone === phone).at(-1).text)[1];
const lastMailCode = (to) => mailOutbox.filter((m) => m.to === to).at(-1).code;

let app, http, prisma;

before(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(WhatsAppService).useValue(fakeWhatsApp)
    .overrideProvider(MailService).useValue(fakeMail)
    .compile();
  app = configureApp(moduleRef.createNestApplication());
  await app.init();
  http = () => request(app.getHttpServer());
  prisma = app.get(PrismaService);
  await prisma.$executeRawUnsafe('TRUNCATE "Transaction", "Account", "Budget", "Session", "User" CASCADE');
});

after(async () => {
  await app?.close();
});

/** Registers + verifies a user through the public API and returns its bearer token. */
async function signUp(email, phoneNumber, password = 'password123') {
  const reg = await http().post('/api/auth/register').send({ email, password, phoneNumber });
  assert.equal(reg.body.success, true, JSON.stringify(reg.body));
  const canonical = '62' + phoneNumber.replace(/\D/g, '').replace(/^0|^62/, '');
  const res = await http().post('/api/auth/verify-otp')
    .send({ email, otpCode: lastMailCode(email), phoneCode: lastWaCode(canonical) });
  assert.equal(res.body.success, true, JSON.stringify(res.body));
  return res.body.token;
}
const auth = (token) => ({ Authorization: `Bearer ${token}` });

describe('phone number format', () => {
  test('0812… from the web is stored as 62812… and the bot finds the same user', async () => {
    const token = await signUp('alice@test.com', '0811-1111-1111');
    const me = await http().get('/api/auth/me').set(auth(token)).expect(200);
    assert.equal(me.body.phoneNumber, '6281111111111');

    // The bot resolves senders from JIDs (62…) and must hit the same row — the old bug used 0…
    const bot = app.get(BotService);
    const viaBot = await bot.findUserByPhone('6281111111111');
    const viaLegacy = await bot.findUserByPhone('081111111111');
    assert.equal(viaBot.id, me.body.id);
    assert.equal(viaLegacy.id, me.body.id);
    assert.equal(viaBot.isVerified, true);
  });
});

describe('phone ownership verification', () => {
  test('the WhatsApp code is sent to the registered number', async () => {
    assert.ok(waOutbox.some((m) => m.phone === '6281111111111'));
  });

  test('cannot register a number that is already owned by a verified user', async () => {
    const before = waOutbox.length;
    const res = await http().post('/api/auth/register')
      .send({ email: 'mallory@test.com', password: 'password123', phoneNumber: '081111111111' });
    assert.equal(res.body.success, false);
    assert.equal(waOutbox.length, before, 'no code must be sent to the victim');
  });

  test('the email code alone does not activate the account', async () => {
    await http().post('/api/auth/register')
      .send({ email: 'eve@test.com', password: 'password123', phoneNumber: '082222222222' })
      .expect(201);
    const res = await http().post('/api/auth/verify-otp')
      .send({ email: 'eve@test.com', otpCode: lastMailCode('eve@test.com'), phoneCode: '000000' === lastWaCode('6282222222222') ? '111111' : '000000' });
    assert.equal(res.body.success, false);
    const login = await http().post('/api/auth/login').send({ email: 'eve@test.com', password: 'password123' });
    assert.equal(login.body.success, false);
  });

  test('numbers that are not on WhatsApp are rejected', async () => {
    fakeWhatsApp.notOnWhatsApp.add('6289999999999');
    const res = await http().post('/api/auth/register')
      .send({ email: 'ghost@test.com', password: 'password123', phoneNumber: '089999999999' });
    assert.equal(res.body.success, false);
    assert.equal(await prisma.user.findUnique({ where: { email: 'ghost@test.com' } }), null);
  });
});

describe('ownership & validation', () => {
  let alice, bob, aliceAccount;

  before(async () => {
    alice = (await http().post('/api/auth/login').send({ email: 'alice@test.com', password: 'password123' })).body.token;
    bob = await signUp('admin@test.com', '083333333333'); // also the admin (ADMIN_EMAILS)
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
    assert.equal(acc.balance, 100000);
  });

  test('unknown fields such as userId are rejected', async () => {
    await http().put(`/api/accounts/${aliceAccount.id}`).set(auth(alice))
      .send({ name: 'x', userId: 'someone-else' }).expect(400);
  });

  test('balances follow create → edit → delete of a transaction', async () => {
    const balance = async () => (await prisma.account.findUnique({ where: { id: aliceAccount.id } })).balance;

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
