import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly port = parseInt(process.env.SMTP_PORT || '587');
  private readonly transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: this.port,
    // Port 465 is implicit TLS and only works with secure=true (otherwise: "Unexpected socket close").
    // 587 uses STARTTLS with secure=false.
    secure: process.env.SMTP_SECURE === 'true' || this.port === 465,
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
  });

  async sendOtp(to: string, otpCode: string, ttlMinutes: number, purpose: 'verify' | 'reset' = 'verify') {
    const subject = purpose === 'reset' ? 'Reset password WhatsMonTrack' : 'Verifikasi akun WhatsMonTrack';
    const intro =
      purpose === 'reset'
        ? 'Gunakan kode berikut untuk membuat password baru'
        : 'Gunakan kode berikut untuk memverifikasi email Anda';
    const info = await this.transporter.sendMail({
      from: process.env.SMTP_FROM || '"WhatsMonTrack" <noreply@whatsmontrack.com>',
      to,
      subject: `${otpCode} adalah kode ${purpose === 'reset' ? 'reset password' : 'verifikasi'} Anda`,
      text: `${intro}:

${otpCode}

Kode berlaku ${ttlMinutes} menit. Abaikan email ini jika Anda tidak memintanya.

${subject}`,
    });

    // Ethereal (test SMTP) never delivers to real inboxes; it gives a URL where the email can be read.
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      this.logger.log(`Test email to ${to} (not delivered to a real inbox). Preview: ${previewUrl}`);
    }
  }
}
