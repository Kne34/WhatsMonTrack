import { ConflictException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { randomInt } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { normalizePhone } from '../common/phone';

export const LINK_TTL_MINUTES = 10;
export const LINK_KEYWORD = 'VERIFIKASI';
/** Matches the message the user sends to the bot, e.g. "VERIFIKASI K7Q2MX". */
export const LINK_MESSAGE_REGEX = /^\s*VERIFIKASI\s+([A-Za-z0-9]{6})\s*$/i;

// No 0/O/1/I to avoid typos when the code is typed by hand. 32^6 ≈ 1e9 combinations.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_WRONG_CODES_PER_SENDER = 5;
const WRONG_CODE_WINDOW_MS = LINK_TTL_MINUTES * 60 * 1000;

const generateCode = () =>
  Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

export const waLink = (botPhone: string, code: string) =>
  `https://wa.me/${botPhone}?text=${encodeURIComponent(`${LINK_KEYWORD} ${code}`)}`;

/**
 * Links a WhatsApp number to an account. The user requests a code on the web, then sends
 * "VERIFIKASI <code>" to the shared bot (by scanning a wa.me QR code or typing it).
 * Because the bot sees the real sender, this proves the user controls that number.
 */
@Injectable()
export class PhoneLinkService {
  private readonly logger = new Logger(PhoneLinkService.name);
  private readonly wrongCodes = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async status(userId: string, botPhone: string | null) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const pending =
      user.phoneLinkCode && user.phoneLinkExpiresAt && user.phoneLinkExpiresAt > new Date() && botPhone
        ? this.linkInfo(user.phoneLinkCode, user.phoneLinkExpiresAt, botPhone, user.pendingPhone)
        : null;
    return { phoneNumber: user.phoneNumber, botConnected: !!botPhone, pending };
  }

  /** Starts (or restarts) linking. `rawPhone` is optional: if given, only that number may complete it. */
  async start(userId: string, rawPhone: string | undefined, botPhone: string | null) {
    if (!botPhone) {
      throw new ServiceUnavailableException('Bot WhatsApp sedang offline. Hubungi admin untuk menghubungkan bot.');
    }

    const pendingPhone = rawPhone ? normalizePhone(rawPhone) : null;
    if (pendingPhone) {
      const owner = await this.prisma.user.findUnique({ where: { phoneNumber: pendingPhone } });
      if (owner && owner.id !== userId && owner.isVerified) {
        throw new ConflictException('Nomor ini sudah terhubung ke akun lain.');
      }
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + LINK_TTL_MINUTES * 60 * 1000);
    await this.prisma.user.update({
      where: { id: userId },
      data: { phoneLinkCode: code, phoneLinkExpiresAt: expiresAt, pendingPhone },
    });
    return this.linkInfo(code, expiresAt, botPhone, pendingPhone);
  }

  async unlink(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { phoneNumber: null, phoneLinkCode: null, phoneLinkExpiresAt: null, pendingPhone: null },
    });
    return { success: true };
  }

  /**
   * Called by the bot when `senderPhone` sends "VERIFIKASI <code>". Returns the reply text.
   */
  async confirm(rawCode: string, senderPhone: string): Promise<string> {
    const sender = normalizePhone(senderPhone);
    if (this.isRateLimited(sender)) {
      return 'Terlalu banyak kode salah. Coba lagi dalam beberapa menit.';
    }

    const code = rawCode.toUpperCase();
    const user = await this.prisma.user.findUnique({ where: { phoneLinkCode: code } });
    if (!user || !user.phoneLinkExpiresAt || user.phoneLinkExpiresAt < new Date()) {
      this.recordWrongCode(sender);
      return 'Kode tidak valid atau sudah kedaluwarsa. Buat kode baru di menu "Hubungkan WhatsApp" di web.';
    }
    if (user.pendingPhone && user.pendingPhone !== sender) {
      return `Kode ini dibuat untuk nomor lain. Kirim dari nomor ${user.pendingPhone}, atau buat kode baru di web.`;
    }

    const owner = await this.prisma.user.findUnique({ where: { phoneNumber: sender } });
    if (owner && owner.id !== user.id) {
      if (owner.isVerified) {
        return 'Nomor ini sudah terhubung ke akun lain. Putuskan dulu dari akun tersebut.';
      }
      // A leftover user without a verified email (e.g. created by the old "Note to Self" flow):
      // the sender just proved they own this number, so their old data moves to this account.
      await this.absorbOrphan(owner.id, user.id);
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { phoneNumber: sender, phoneLinkCode: null, phoneLinkExpiresAt: null, pendingPhone: null },
    });
    this.wrongCodes.delete(sender);
    this.logger.log(`Linked ${sender} to user ${user.id}`);
    return `Berhasil! Nomor ini sekarang terhubung ke akun ${user.email}.\nCoba catat transaksi pertama, contoh: "Makan siang 25k pakai BCA".`;
  }

  private linkInfo(code: string, expiresAt: Date, botPhone: string, pendingPhone: string | null) {
    return { code, message: `${LINK_KEYWORD} ${code}`, botPhone, waLink: waLink(botPhone, code), expiresAt, pendingPhone };
  }

  private async absorbOrphan(orphanId: string, targetId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.account.updateMany({ where: { userId: orphanId }, data: { userId: targetId } });
      await tx.transaction.updateMany({ where: { userId: orphanId }, data: { userId: targetId } });
      const targetBudgets = await tx.budget.findMany({ where: { userId: targetId }, select: { categoryName: true } });
      // Budgets are unique per (user, category): the account's own budget wins on conflict.
      await tx.budget.deleteMany({
        where: { userId: orphanId, categoryName: { in: targetBudgets.map((b) => b.categoryName) } },
      });
      await tx.budget.updateMany({ where: { userId: orphanId }, data: { userId: targetId } });
      await tx.user.delete({ where: { id: orphanId } });
    });
    this.logger.log(`Merged orphan user ${orphanId} into ${targetId}`);
  }

  private isRateLimited(sender: string) {
    const entry = this.wrongCodes.get(sender);
    if (!entry || entry.resetAt < Date.now()) return false;
    return entry.count >= MAX_WRONG_CODES_PER_SENDER;
  }

  private recordWrongCode(sender: string) {
    const now = Date.now();
    const entry = this.wrongCodes.get(sender);
    if (!entry || entry.resetAt < now) {
      this.wrongCodes.set(sender, { count: 1, resetAt: now + WRONG_CODE_WINDOW_MS });
    } else {
      entry.count++;
    }
  }
}
