import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomInt, timingSafeEqual } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { JwtUser } from '../common/config';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { MailService } from './mail.service';
import { LoginDto, RegisterDto, VerifyOtpDto } from './auth.dto';

export const OTP_TTL_MINUTES = 15;
export const MAX_OTP_ATTEMPTS = 5;
/** Minimum gap between OTP sends for the same account (limits WhatsApp/email spam to a victim). */
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

const generateOtp = () => randomInt(100000, 1000000).toString(); // CSPRNG, not Math.random

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  /**
   * Registration sends two codes: one by email and one by WhatsApp to the given number.
   * The account is only activated when both are entered, which proves the registrant
   * controls both the email address and the phone number.
   *
   * Re-registering with an *unverified* email or phone acts as "resend codes"; it is also how
   * the bot owner claims the bare user the bot created for their "Note to Self" messages.
   * Taking over an unverified record is safe because it cannot be activated without the
   * WhatsApp code sent to that number.
   */
  async register({ email, password, phoneNumber }: RegisterDto) {
    const [byEmail, byPhone] = await Promise.all([
      this.prisma.user.findUnique({ where: { email } }),
      this.prisma.user.findUnique({ where: { phoneNumber } }),
    ]);

    if (byEmail?.isVerified || byPhone?.isVerified) {
      return { success: false, message: 'Email or phone number already registered' };
    }
    if (byEmail && byPhone && byEmail.id !== byPhone.id) {
      return {
        success: false,
        message: 'Email ini sedang dipakai pendaftaran lain dengan nomor berbeda. Gunakan nomor yang sama atau email lain.',
      };
    }

    const existing = byEmail ?? byPhone;
    if (existing?.otpExpiresAt) {
      const lastSentAt = existing.otpExpiresAt.getTime() - OTP_TTL_MINUTES * 60 * 1000;
      if (Date.now() - lastSentAt < OTP_RESEND_COOLDOWN_MS) {
        return { success: false, message: 'Tunggu 1 menit sebelum meminta kode baru.' };
      }
    }

    if (!this.whatsapp.isConnected()) {
      throw new ServiceUnavailableException('Bot WhatsApp sedang offline. Coba lagi beberapa saat lagi.');
    }

    const otpCode = generateOtp();
    const phoneOtpCode = generateOtp();
    const fields = {
      email,
      phoneNumber,
      password: await bcrypt.hash(password, 10),
      otpCode,
      phoneOtpCode,
      otpExpiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000),
      otpAttempts: 0,
    };

    // Send the WhatsApp code first: it also tells us whether the number exists on WhatsApp.
    try {
      const delivered = await this.whatsapp.sendToPhone(
        phoneNumber,
        `Kode verifikasi WhatsMonTrack Anda: *${phoneOtpCode}*\nBerlaku ${OTP_TTL_MINUTES} menit. Jangan berikan kode ini kepada siapa pun.\n\nAbaikan pesan ini jika Anda tidak mendaftar.`,
      );
      if (!delivered) {
        return { success: false, message: 'Nomor ini tidak terdaftar di WhatsApp.' };
      }
    } catch (err) {
      this.logger.error(`Failed to send WhatsApp OTP to ${phoneNumber}`, err);
      throw new ServiceUnavailableException('Gagal mengirim kode WhatsApp. Coba lagi beberapa saat lagi.');
    }

    if (existing) {
      await this.prisma.user.update({ where: { id: existing.id }, data: fields });
    } else {
      await this.prisma.user.create({ data: fields });
    }

    try {
      await this.mail.sendOtp(email, otpCode, OTP_TTL_MINUTES);
    } catch (err) {
      this.logger.error(`Failed to send OTP email to ${email}`, err);
      return { success: false, message: 'Gagal mengirim email OTP. Silakan coba daftar lagi.' };
    }

    return { success: true, message: 'Kode verifikasi telah dikirim ke email dan WhatsApp Anda.' };
  }

  async verifyOtp({ email, otpCode, phoneCode }: VerifyOtpDto) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user || user.isVerified || !user.otpCode || !user.phoneOtpCode || !user.otpExpiresAt) {
      return { success: false, message: 'Kode verifikasi salah.' };
    }
    if (user.otpAttempts >= MAX_OTP_ATTEMPTS) {
      return { success: false, message: 'Terlalu banyak percobaan. Silakan daftar ulang untuk mendapatkan kode baru.' };
    }
    if (user.otpExpiresAt < new Date()) {
      return { success: false, message: 'Kode sudah kedaluwarsa. Silakan daftar ulang untuk mendapatkan kode baru.' };
    }

    // Evaluate both comparisons (no short-circuit) so timing doesn't reveal which code was wrong
    const emailOk = safeEqual(user.otpCode, otpCode);
    const phoneOk = safeEqual(user.phoneOtpCode, phoneCode);
    if (!emailOk || !phoneOk) {
      await this.prisma.user.update({ where: { id: user.id }, data: { otpAttempts: { increment: 1 } } });
      return { success: false, message: 'Kode verifikasi salah.' };
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { isVerified: true, otpCode: null, phoneOtpCode: null, otpExpiresAt: null, otpAttempts: 0 },
    });

    return this.loginResult(user);
  }

  async login({ email, password }: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return { success: false, message: 'Invalid credentials' };

    // Check the password before revealing verification status
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return { success: false, message: 'Invalid credentials' };
    if (!user.isVerified) return { success: false, message: 'Email not verified' };

    return this.loginResult(user);
  }

  private async loginResult(user: { id: string; email: string; phoneNumber: string }) {
    const payload: JwtUser = { id: user.id, phoneNumber: user.phoneNumber, email: user.email };
    const token = await this.jwt.signAsync(payload);
    return { success: true, token, user: { id: user.id, email: user.email, phoneNumber: user.phoneNumber } };
  }
}

function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
