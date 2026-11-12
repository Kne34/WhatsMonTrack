import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomInt, timingSafeEqual } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { isAdmin, JwtUser } from '../common/config';
import { MailService } from './mail.service';
import { ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto, VerifyOtpDto } from './auth.dto';

export const OTP_TTL_MINUTES = 15;
export const MAX_OTP_ATTEMPTS = 5;
/** Minimum gap between OTP emails for the same account (limits email spam to a victim). */
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

const generateOtp = () => randomInt(100000, 1000000).toString(); // CSPRNG, not Math.random

/**
 * Accounts are email-based. The WhatsApp number is linked after login (see whatsapp/phone-link.service.ts),
 * so registering never depends on the bot being online.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
  ) {}

  /** Re-registering an *unverified* email acts as "resend code" (e.g. the email never arrived). */
  async register({ email, password, timeZone }: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing?.isVerified) {
      return { success: false, message: 'Email sudah terdaftar. Silakan masuk.' };
    }
    if (existing?.otpExpiresAt) {
      const lastSentAt = existing.otpExpiresAt.getTime() - OTP_TTL_MINUTES * 60 * 1000;
      if (Date.now() - lastSentAt < OTP_RESEND_COOLDOWN_MS) {
        return { success: false, message: 'Tunggu 1 menit sebelum meminta kode baru.' };
      }
    }

    const otpCode = generateOtp();
    const fields = {
      password: await bcrypt.hash(password, 10),
      otpCode,
      otpExpiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
      otpAttempts: 0,
      ...(timeZone && { timezone: timeZone }),
    };
    if (existing) {
      await this.prisma.user.update({ where: { id: existing.id }, data: fields });
    } else {
      await this.prisma.user.create({ data: { email, ...fields } });
    }

    try {
      await this.mail.sendOtp(email, otpCode, OTP_TTL_MINUTES);
    } catch (err) {
      this.logger.error(`Failed to send OTP email to ${email}`, err);
      return { success: false, message: 'Gagal mengirim email OTP. Silakan coba daftar lagi.' };
    }
    return { success: true, message: 'Kode verifikasi telah dikirim ke email Anda.' };
  }

  async verifyOtp({ email, otpCode }: VerifyOtpDto) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.isVerified) return { success: false, message: 'Kode verifikasi salah.' };

    const error = await this.checkOtp(user, otpCode);
    if (error) return { success: false, message: error };

    await this.prisma.user.update({
      where: { id: user.id },
      data: { isVerified: true, otpCode: null, otpExpiresAt: null, otpAttempts: 0 },
    });
    return this.loginResult(user);
  }

  /**
   * Always answers the same way, whether or not the email exists, so the form
   * can't be used to find out which emails have an account.
   */
  async forgotPassword({ email }: ForgotPasswordDto) {
    const generic = { success: true, message: 'Jika email terdaftar, kode reset telah dikirim.' };
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.isVerified) return generic;

    if (user.otpExpiresAt) {
      const lastSentAt = user.otpExpiresAt.getTime() - OTP_TTL_MINUTES * 60 * 1000;
      if (Date.now() - lastSentAt < OTP_RESEND_COOLDOWN_MS) return generic;
    }

    const otpCode = generateOtp();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { otpCode, otpExpiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000), otpAttempts: 0 },
    });
    try {
      await this.mail.sendOtp(email, otpCode, OTP_TTL_MINUTES, 'reset');
    } catch (err) {
      this.logger.error(`Failed to send reset email to ${email}`, err);
      return { success: false, message: 'Gagal mengirim email. Coba lagi beberapa saat lagi.' };
    }
    return generic;
  }

  /** Sets a new password with the emailed code, then signs the user in. */
  async resetPassword({ email, otpCode, password }: ResetPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.isVerified) return { success: false, message: 'Kode reset salah.' };

    const error = await this.checkOtp(user, otpCode);
    if (error) return { success: false, message: error };

    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: await bcrypt.hash(password, 10), otpCode: null, otpExpiresAt: null, otpAttempts: 0 },
    });
    return this.loginResult(user);
  }

  async login({ email, password, timeZone }: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return { success: false, message: 'Email atau password salah.' };

    // Check the password before revealing verification status
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return { success: false, message: 'Email atau password salah.' };
    if (!user.isVerified) {
      return { success: false, reason: 'EMAIL_NOT_VERIFIED', message: 'Email belum diverifikasi.' };
    }
    if (timeZone && timeZone !== user.timezone) {
      await this.prisma.user.update({ where: { id: user.id }, data: { timezone: timeZone } });
    }

    return this.loginResult(user);
  }

  /** Is this the signed-in user's password? Used to show amounts hidden behind the dashboard's eye icons. */
  async verifyPassword(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
    if (!user) throw new NotFoundException('User not found');
    const valid = await bcrypt.compare(password, user.password);
    return valid ? { valid: true } : { valid: false, message: 'Password salah.' };
  }

  /** Current profile, read from the DB so a freshly linked phone number shows up without re-login. */
  async profile(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return { id: user.id, email: user.email, phoneNumber: user.phoneNumber, isAdmin: isAdmin(user.email) };
  }

  /** Returns an error message, or null if the code is valid. Counts wrong attempts. */
  private async checkOtp(
    user: { id: string; otpCode: string | null; otpExpiresAt: Date | null; otpAttempts: number },
    otpCode: string,
  ): Promise<string | null> {
    if (!user.otpCode || !user.otpExpiresAt) return 'Kode salah. Minta kode baru.';
    if (user.otpAttempts >= MAX_OTP_ATTEMPTS) return 'Terlalu banyak percobaan. Minta kode baru.';
    if (user.otpExpiresAt < new Date()) return 'Kode sudah kedaluwarsa. Minta kode baru.';
    if (!safeEqual(user.otpCode, otpCode)) {
      await this.prisma.user.update({ where: { id: user.id }, data: { otpAttempts: { increment: 1 } } });
      return 'Kode salah.';
    }
    return null;
  }

  private async loginResult(user: { id: string; email: string; phoneNumber: string | null }) {
    const payload: JwtUser = { id: user.id, email: user.email };
    const token = await this.jwt.signAsync(payload);
    return { success: true, token, user: { id: user.id, email: user.email, phoneNumber: user.phoneNumber } };
  }
}

function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
