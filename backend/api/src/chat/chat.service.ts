import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { BotService } from '../whatsapp/bot.service';

/** Messages kept on screen; older ones stay in the database until the user clears the chat. */
export const CHAT_HISTORY_LIMIT = 100;

const FAILED_REPLY =
  'Maaf, pesan gagal diproses. Coba kirim lagi sebentar lagi.';

/**
 * Chat with the bot from the web. Uses the same conversation logic as WhatsApp (BotService), so it
 * works without a bot number or a linked phone: the logged-in user is the sender.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bot: BotService,
  ) {}

  async history(userId: string) {
    const latest = await this.prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: CHAT_HISTORY_LIMIT,
    });
    return latest.reverse();
  }

  /** Saves the user's message, runs it through the bot and saves the reply. */
  async send(userId: string, text: string) {
    const message = await this.prisma.chatMessage.create({
      data: { userId, text },
    });
    let replyText: string;
    try {
      // The chat message id makes recording idempotent, like a WhatsApp message id
      replyText =
        (await this.bot.handleMessage(userId, text, `web:${message.id}`)) ??
        'Pesan ini sudah diproses.';
    } catch (err) {
      this.logger.error(
        `Chat message ${message.id} failed: ${(err as Error).message}`,
      );
      replyText = FAILED_REPLY;
    }
    const reply = await this.prisma.chatMessage.create({
      data: { userId, text: replyText, fromBot: true },
    });
    return { message, reply };
  }

  async clear(userId: string) {
    const { count } = await this.prisma.chatMessage.deleteMany({
      where: { userId },
    });
    return { success: true, deleted: count };
  }
}
