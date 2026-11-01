import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { renderOtpEmail, type OtpPurpose } from './otp-email';

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

  async sendOtp(to: string, otpCode: string, ttlMinutes: number, purpose: OtpPurpose = 'verify') {
    const { subject, html, text } = renderOtpEmail({ code: otpCode, ttlMinutes, purpose });
    const info = await this.transporter.sendMail({
      from: process.env.SMTP_FROM || '"WhatsMonTrack" <noreply@whatsmontrack.com>',
      to,
      subject,
      html,
      text, // plain-text alternative for clients that don't render HTML
    });

    // Ethereal (test SMTP) never delivers to real inboxes; it gives a URL where the email can be read.
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      this.logger.log(`Test email to ${to} (not delivered to a real inbox). Preview: ${previewUrl}`);
    }
  }
}
