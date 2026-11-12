// Injected as plain mocks below; stub the modules so Jest (CommonJS) doesn't load
// their ESM-only dependencies (@nestjs/jwt) or a real DB client.
jest.mock('@nestjs/jwt', () => ({ JwtService: class {} }));
jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));

import * as bcrypt from 'bcryptjs';
import { AuthService, MAX_OTP_ATTEMPTS, OTP_TTL_MINUTES } from './auth.service';

type UserRow = Record<string, any>;

function setup(users: UserRow[] = [], opts: { mailFails?: boolean } = {}) {
  const db: UserRow[] = users.map((u) => ({ isVerified: false, otpAttempts: 0, phoneNumber: null, ...u }));
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
        const u = { id: `new-${db.length}`, isVerified: false, phoneNumber: null, ...data };
        db.push(u);
        return u;
      }),
    },
  };
  const mail = {
    sendOtp: jest.fn(async () => {
      if (opts.mailFails) throw new Error('smtp down');
    }),
  };
  const jwt = { signAsync: jest.fn(async () => 'signed-token') };
  const service = new AuthService(prisma as any, jwt as any, mail as any);
  return { service, db, mail, jwt };
}

const reg = { email: 'a@test.com', password: 'password123' };

describe('AuthService.register', () => {
  it('creates an unverified user without a phone number and emails a code', async () => {
    const { service, db, mail } = setup();
    const res = await service.register(reg);

    expect(res.success).toBe(true);
    expect(db).toHaveLength(1);
    expect(db[0]).toMatchObject({ email: reg.email, isVerified: false, phoneNumber: null });
    expect(await bcrypt.compare('password123', db[0].password)).toBe(true);
    expect(mail.sendOtp).toHaveBeenCalledWith(reg.email, db[0].otpCode, OTP_TTL_MINUTES);
  });

  it('rejects an email that is already verified', async () => {
    const { service, mail } = setup([{ id: 'u1', email: reg.email, isVerified: true }]);
    expect((await service.register(reg)).success).toBe(false);
    expect(mail.sendOtp).not.toHaveBeenCalled();
  });

  it('re-registering an unverified email resends a new code (after the cooldown)', async () => {
    const { service, db, mail } = setup();
    await service.register(reg);
    const first = db[0].otpCode;

    // within the cooldown: refused
    expect((await service.register(reg)).success).toBe(false);

    // pretend the first code was sent 2 minutes ago
    db[0].otpExpiresAt = new Date(Date.now() + (OTP_TTL_MINUTES - 2) * 60 * 1000);
    expect((await service.register(reg)).success).toBe(true);
    expect(db).toHaveLength(1);
    expect(mail.sendOtp).toHaveBeenCalledTimes(2);
    expect(mail.sendOtp).toHaveBeenLastCalledWith(reg.email, db[0].otpCode, OTP_TTL_MINUTES);
    expect(typeof first).toBe('string');
  });

  it('reports an email delivery failure', async () => {
    const { service } = setup([], { mailFails: true });
    expect((await service.register(reg)).success).toBe(false);
  });
});

describe('AuthService.verifyOtp', () => {
  async function registered() {
    const ctx = setup();
    await ctx.service.register(reg);
    return ctx;
  }

  it('activates the account with the emailed code and returns a token', async () => {
    const { service, db } = await registered();
    const res = await service.verifyOtp({ email: reg.email, otpCode: db[0].otpCode });
    expect(res).toMatchObject({ success: true, token: 'signed-token' });
    expect(db[0]).toMatchObject({ isVerified: true, otpCode: null });
  });

  it('rejects a wrong code and counts the attempt', async () => {
    const { service, db } = await registered();
    const wrong = db[0].otpCode === '000000' ? '111111' : '000000';
    expect((await service.verifyOtp({ email: reg.email, otpCode: wrong })).success).toBe(false);
    expect(db[0].otpAttempts).toBe(1);
    expect(db[0].isVerified).toBe(false);
  });

  it('locks after too many wrong attempts, even with the right code', async () => {
    const { service, db } = await registered();
    db[0].otpAttempts = MAX_OTP_ATTEMPTS;
    expect((await service.verifyOtp({ email: reg.email, otpCode: db[0].otpCode })).success).toBe(false);
  });

  it('rejects expired codes', async () => {
    const { service, db } = await registered();
    db[0].otpExpiresAt = new Date(Date.now() - 1000);
    expect((await service.verifyOtp({ email: reg.email, otpCode: db[0].otpCode })).success).toBe(false);
  });
});

describe('AuthService.login', () => {
  it('refuses unverified users and wrong passwords, accepts verified ones', async () => {
    const password = await bcrypt.hash('password123', 4);
    const { service, db } = setup([{ id: 'u1', email: reg.email, password }]);

    expect((await service.login({ email: reg.email, password: 'password123' })).success).toBe(false);
    db[0].isVerified = true;
    expect(await service.login({ email: reg.email, password: 'password123' })).toMatchObject({ success: true });
    expect((await service.login({ email: reg.email, password: 'wrong-password' })).success).toBe(false);
  });
});

describe('AuthService.verifyPassword', () => {
  it('accepts only the password of the signed-in user', async () => {
    const password = await bcrypt.hash('password123', 4);
    const { service } = setup([{ id: 'u1', email: reg.email, password, isVerified: true }]);

    expect(await service.verifyPassword('u1', 'password123')).toEqual({ valid: true });
    expect(await service.verifyPassword('u1', 'wrong-password')).toMatchObject({ valid: false });
    await expect(service.verifyPassword('nobody', 'password123')).rejects.toThrow('User not found');
  });
});

describe('AuthService.forgotPassword / resetPassword', () => {
  async function verifiedUser() {
    const password = await bcrypt.hash('old-password', 4);
    return setup([{ id: 'u1', email: reg.email, password, isVerified: true }]);
  }

  it('answers identically for unknown emails and sends nothing', async () => {
    const known = await verifiedUser();
    const unknown = setup();
    const a = await known.service.forgotPassword({ email: reg.email });
    const b = await unknown.service.forgotPassword({ email: reg.email });
    expect(a).toEqual(b);
    expect(unknown.mail.sendOtp).not.toHaveBeenCalled();
    expect(known.mail.sendOtp).toHaveBeenCalledWith(reg.email, known.db[0].otpCode, OTP_TTL_MINUTES, 'reset');
  });

  it('sets the new password with the right code and signs in', async () => {
    const { service, db } = await verifiedUser();
    await service.forgotPassword({ email: reg.email });
    const res = await service.resetPassword({ email: reg.email, otpCode: db[0].otpCode, password: 'new-password' });

    expect(res).toMatchObject({ success: true, token: 'signed-token' });
    expect(await bcrypt.compare('new-password', db[0].password)).toBe(true);
    expect(db[0].otpCode).toBeNull();
    expect((await service.login({ email: reg.email, password: 'old-password' })).success).toBe(false);
  });

  it('rejects a wrong code without changing the password', async () => {
    const { service, db } = await verifiedUser();
    await service.forgotPassword({ email: reg.email });
    const wrong = db[0].otpCode === '000000' ? '111111' : '000000';
    expect((await service.resetPassword({ email: reg.email, otpCode: wrong, password: 'new-password' })).success).toBe(false);
    expect(await bcrypt.compare('old-password', db[0].password)).toBe(true);
    expect(db[0].otpAttempts).toBe(1);
  });

  it('cannot be used to take over an unverified account', async () => {
    const { service } = setup([{ id: 'u1', email: reg.email, otpCode: '123456', otpExpiresAt: new Date(Date.now() + 60_000) }]);
    expect((await service.resetPassword({ email: reg.email, otpCode: '123456', password: 'new-password' })).success).toBe(false);
  });
});
