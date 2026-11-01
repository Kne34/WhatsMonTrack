import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  });

  async sendOtp(to: string, otpCode: string, ttlMinutes: number) {
    await this.transporter.sendMail({
      from: '"WhatsMonTrack" <noreply@whatsmontrack.com>',
      to,
      subject: 'Verifikasi Akun WhatsMonTrack',
      text: `Kode OTP Anda adalah: ${otpCode}. Kode ini berlaku selama ${ttlMinutes} menit.`,
    });
  }
}
