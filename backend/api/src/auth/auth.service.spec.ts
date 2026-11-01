// These are injected as plain mocks below; stub the modules so Jest (CommonJS) doesn't load
// their ESM-only dependencies (@nestjs/jwt, Baileys) or a real DB client.
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));
jest.mock('../whatsapp/whatsapp.service', () => ({ WhatsAppService: class {} }));
jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));

import { ServiceUnavailableException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService, MAX_OTP_ATTEMPTS, OTP_TTL_MINUTES } from './auth.service';

type UserRow = Record<string, any>;

function setup(users: UserRow[] = [], opts: { connected?: boolean; onWhatsApp?: boolean } = {}) {
  const db: UserRow[] = users.map((u) => ({ isVerified: false, otpAttempts: 0, ...u }));
  const prisma = {
    user: {
      findUnique: jest.fn(async ({ where }) => db.find((u) => Object.entries(where).every(([k, v]) => u[k] === v)) ?? null),
      update: jest.fn(async ({ where, data }) => {
        const u = db.find((x) => x.id === where.id)!;
        for (const [k, v] of Object.entries<any>(data)) {
          u[k] = v && typeof v === 'object' && 'increment' in v ? u[k] + v.increment : v;
        }
        return u;
      }),
      create: jest.fn(async ({ data }) => {
        const u = { id: `new-${db.length}`, isVerified: false, ...data };
        db.push(u);
        return u;
      }),
    },
  };
  const whatsapp = {
    isConnected: jest.fn(() => opts.connected ?? true),
    sendToPhone: jest.fn(async () => opts.onWhatsApp ?? true),
  };
  const mail = { sendOtp: jest.fn(async () => undefined) };
  const jwt = { signAsync: jest.fn(async () => 'signed-token') };
  const service = new AuthService(prisma as any, jwt as any, mail as any, whatsapp as any);
  return { service, db, prisma, whatsapp, mail, jwt };
}

const reg = { email: 'a@test.com', password: 'password123', phoneNumber: '6281111111111' };
const sentPhoneCode = (whatsapp: any) => /\*(\d{6})\*/.exec(whatsapp.sendToPhone.mock.calls.at(-1)[1])![1];

describe('AuthService.register', () => {
  it('creates an unverified user and sends one code by WhatsApp and one by email', async () => {
    const { service, db, whatsapp, mail } = setup();
    const res = await service.register(reg);

    expect(res.success).toBe(true);
    expect(db).toHaveLength(1);
    const user = db[0];
    expect(user.isVerified).toBe(false);
    expect(user.phoneNumber).toBe('6281111111111');
    expect(await bcrypt.compare('password123', user.password)).toBe(true);

    expect(whatsapp.sendToPhone).toHaveBeenCalledWith('6281111111111', expect.any(String));
    expect(sentPhoneCode(whatsapp)).toBe(user.phoneOtpCode);
    expect(mail.sendOtp).toHaveBeenCalledWith('a@test.com', user.otpCode, OTP_TTL_MINUTES);
    expect(user.otpCode).not.toBe(user.phoneOtpCode);
  });

  it('rejects a phone number that already belongs to a verified user', async () => {
    const { service, whatsapp } = setup([{ id: 'u1', email: 'victim@test.com', phoneNumber: reg.phoneNumber, isVerified: true }]);
    const res = await service.register(reg);
    expect(res.success).toBe(false);
    expect(whatsapp.sendToPhone).not.toHaveBeenCalled();
  });

  it('rejects an email that already belongs to a verified user', async () => {
    const { service } = setup([{ id: 'u1', email: reg.email, phoneNumber: '6289999999999', isVerified: true }]);
    expect((await service.register(reg)).success).toBe(false);
  });

  it('fails when the number is not on WhatsApp, without creating a user', async () => {
    const { service, db } = setup([], { onWhatsApp: false });
    const res = await service.register(reg);
    expect(res).toEqual({ success: false, message: 'Nomor ini tidak terdaftar di WhatsApp.' });
    expect(db).toHaveLength(0);
  });

  it('returns 503 when the bot is offline', async () => {
    const { service } = setup([], { connected: false });
    await expect(service.register(reg)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('lets the bot owner claim the bare user created by "Note to Self" (keeps its id/data)', async () => {
    const { service, db } = setup([{ id: 'bot-user', email: 'some-uuid', phoneNumber: reg.phoneNumber }]);
    const res = await service.register(reg);
    expect(res.success).toBe(true);
    expect(db).toHaveLength(1);
    expect(db[0]).toMatchObject({ id: 'bot-user', email: reg.email, isVerified: false });
  });

  it('enforces a cooldown between code sends', async () => {
    const { service, whatsapp } = setup();
    await service.register(reg);
    const again = await service.register(reg);
    expect(again.success).toBe(false);
    expect(whatsapp.sendToPhone).toHaveBeenCalledTimes(1);
  });
});

describe('AuthService.verifyOtp', () => {
  async function registered() {
    const ctx = setup();
    await ctx.service.register(reg);
    return ctx;
  }

  it('activates the account only when both codes are correct', async () => {
    const { service, db } = await registered();
    const { otpCode, phoneOtpCode } = db[0];
    const res = await service.verifyOtp({ email: reg.email, otpCode, phoneCode: phoneOtpCode });

    expect(res).toMatchObject({ success: true, token: 'signed-token' });
    expect(db[0]).toMatchObject({ isVerified: true, otpCode: null, phoneOtpCode: null });
  });

  it('rejects a correct email code with a wrong WhatsApp code (phone not proven)', async () => {
    const { service, db } = await registered();
    const wrong = db[0].phoneOtpCode === '000000' ? '111111' : '000000';
    const res = await service.verifyOtp({ email: reg.email, otpCode: db[0].otpCode, phoneCode: wrong });

    expect(res.success).toBe(false);
    expect(db[0].isVerified).toBe(false);
    expect(db[0].otpAttempts).toBe(1);
  });

  it('locks verification after too many wrong attempts, even with the right codes', async () => {
    const { service, db } = await registered();
    db[0].otpAttempts = MAX_OTP_ATTEMPTS;
    const res = await service.verifyOtp({ email: reg.email, otpCode: db[0].otpCode, phoneCode: db[0].phoneOtpCode });
    expect(res.success).toBe(false);
    expect(db[0].isVerified).toBe(false);
  });

  it('rejects expired codes', async () => {
    const { service, db } = await registered();
    db[0].otpExpiresAt = new Date(Date.now() - 1000);
    const res = await service.verifyOtp({ email: reg.email, otpCode: db[0].otpCode, phoneCode: db[0].phoneOtpCode });
    expect(res.success).toBe(false);
  });
});

describe('AuthService.login', () => {
  it('refuses unverified users and accepts verified ones', async () => {
    const password = await bcrypt.hash('password123', 4);
    const { service, db } = setup([{ id: 'u1', email: reg.email, phoneNumber: reg.phoneNumber, password }]);

    expect((await service.login({ email: reg.email, password: 'password123' })).success).toBe(false);
    db[0].isVerified = true;
    expect(await service.login({ email: reg.email, password: 'password123' })).toMatchObject({ success: true });
    expect((await service.login({ email: reg.email, password: 'wrong-password' })).success).toBe(false);
  });
});
