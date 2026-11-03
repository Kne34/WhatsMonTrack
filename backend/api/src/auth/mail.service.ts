import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { renderOtpEmail, type OtpPurpose } from './otp-email';

const DEFAULT_FROM = '"WhatsMonTrack" <noreply@whatsmontrack.com>';
const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

/** '"WhatsMonTrack" <me@gmail.com>' or 'me@gmail.com' -> { name, email } */
export function parseAddress(raw: string): { name?: string; email: string } {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(raw);
  if (match) return { ...(match[1].trim() && { name: match[1].trim() }), email: match[2].trim() };
  return { email: raw.trim() };
}

/**
 * Sends the OTP emails.
 * - BREVO_API_KEY set: Brevo's HTTPS API. Needed on hosts that block outbound SMTP ports
 *   (e.g. Render's free tier blocks 25, 465 and 587).
 * - Otherwise: SMTP (SMTP_HOST/PORT/USER/PASS), as used with Docker Compose.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly from = process.env.MAIL_FROM || process.env.SMTP_FROM || DEFAULT_FROM;
  private readonly brevoKey = process.env.BREVO_API_KEY || '';
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
    const message = renderOtpEmail({ code: otpCode, ttlMinutes, purpose });
    if (this.brevoKey) return this.sendWithBrevo(to, message);

    const info = await this.transporter.sendMail({
      from: this.from,
      to,
      subject: message.subject,
      html: message.html,
      text: message.text, // plain-text alternative for clients that don't render HTML
    });

    // Ethereal (test SMTP) never delivers to real inboxes; it gives a URL where the email can be read.
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      this.logger.log(`Test email to ${to} (not delivered to a real inbox). Preview: ${previewUrl}`);
    }
  }

  private async sendWithBrevo(to: string, message: { subject: string; html: string; text: string }) {
    const res = await fetch(BREVO_URL, {
      method: 'POST',
      headers: { 'api-key': this.brevoKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: parseAddress(this.from),
        to: [{ email: to }],
        subject: message.subject,
        htmlContent: message.html,
        textContent: message.text,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      // Brevo's error body explains the cause (e.g. unverified sender) and contains no secrets
      const detail = await res.text().catch(() => '');
      throw new Error(`Brevo rejected the email (${res.status}): ${detail.slice(0, 300)}`);
    }
  }
}
