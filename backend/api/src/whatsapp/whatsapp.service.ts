import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { makeWASocket, makeCacheableSignalKeyStore, DisconnectReason, Browsers } from '@whiskeysockets/baileys';
import * as qrcode from 'qrcode-terminal';
import { BotService } from './bot.service';
import { phoneFromJid } from '../common/phone';
import { Boom } from '@hapi/boom';
import { PrismaService } from '../database/prisma.service';
import { clearDatabaseAuthState, useDatabaseAuthState } from './db-auth-state';
import { appendMaxAgeMs } from './offline-queue';

const APPEND_MAX_AGE_MS = appendMaxAgeMs();
const MAX_REMEMBERED_IDS = 2000;

function remember(set: Set<string>, id: string) {
  set.add(id);
  if (set.size > MAX_REMEMBERED_IDS) set.delete(set.values().next().value as string);
}

/** messageTimestamp is seconds, as a number or a protobuf Long. */
function toMillis(ts: unknown): number {
  if (ts == null) return 0;
  const seconds = typeof ts === 'object' && 'toNumber' in (ts as object) ? (ts as { toNumber(): number }).toNumber() : Number(ts);
  return Number.isFinite(seconds) ? seconds * 1000 : 0;
}

@Injectable()
export class WhatsAppService implements OnModuleInit {
  private readonly logger = new Logger(WhatsAppService.name);
  private sock: any;
  private connectionStatus = { connected: false, qr: '' };

  /** Appended to every bot message: fallback to recognise our own replies (e.g. after a restart). */
  static readonly BOT_MARKER = '\u200B';

  /** Ids of messages the bot sent, and of messages already handled (bounded, most recent kept). */
  private readonly sentIds = new Set<string>();
  private readonly seenIds = new Set<string>();

  constructor(
    private readonly bot: BotService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing WhatsApp Service...');
    await this.connectToWhatsApp();
  }

  async connectToWhatsApp() {
    // Session lives in the database, so it survives restarts on hosts without a persistent disk
    const { state, saveCreds } = await useDatabaseAuthState(this.prisma);

    this.sock = makeWASocket({
      // In-memory cache in front of the database for the many signal-key reads per message
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys) },
      printQRInTerminal: false, // We will print it manually to ensure it looks good
      browser: Browsers.macOS('Desktop'),
      syncFullHistory: false,
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        this.connectionStatus.qr = qr;
        this.logger.log('Scan this QR code with your WhatsApp app:');
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'close') {
        this.connectionStatus.connected = false;
        const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        this.logger.error('WhatsApp connection closed due to ', lastDisconnect?.error, ', reconnecting ', shouldReconnect);
        if (shouldReconnect) {
          this.connectToWhatsApp();
        } else {
          // The linked device was removed (or expired after inactivity). The stored credentials are
          // useless now, so wipe them and start a fresh session, which prints a new QR code to scan.
          this.logger.warn('WhatsApp session was logged out; clearing credentials and generating a new QR code.');
          this.resetSession().catch((err) => this.logger.error('Failed to restart WhatsApp session', err));
        }
      } else if (connection === 'open') {
        this.connectionStatus.connected = true;
        this.connectionStatus.qr = '';
        this.logger.log('WhatsApp connection opened successfully!');
      }
    });

    // A batch can hold several messages: handle every one, not just the first.
    this.sock.ev.on('messages.upsert', async ({ messages, type }: { messages: any[]; type: 'notify' | 'append' }) => {
      for (const msg of messages) {
        try {
          await this.handleIncoming(msg, type);
        } catch (err) {
          this.logger.error('Error handling incoming message', err);
        }
      }
    });
  }

  /**
   * - 'notify' = live messages. 'append' = history sync or messages queued while the bot was
   *   offline: those are only handled if recent, so a reconnect doesn't replay old chats.
   * - Each message id is handled once (in-memory), and transactions are unique per message id
   *   in the database, so a re-delivered message can never be recorded twice.
   * - The bot's own replies are recognised by the ids returned when sending them, with the
   *   zero-width marker as a fallback (e.g. after a restart). User text is never filtered by content.
   */
  private async handleIncoming(msg: any, type: 'notify' | 'append') {
    const messageId: string | undefined = msg?.key?.id;
    if (!msg?.message || !messageId) return;

    if (type !== 'notify') {
      const sentAt = toMillis(msg.messageTimestamp);
      if (!sentAt || Date.now() - sentAt > APPEND_MAX_AGE_MS) return;
    }
    if (this.sentIds.has(messageId) || this.seenIds.has(messageId)) return;
    remember(this.seenIds, messageId);

    const senderJid: string | undefined = msg.key.remoteJid;
    if (!senderJid || senderJid.endsWith('@g.us') || senderJid === 'status@broadcast') return; // groups, statuses

    const myJidRaw = this.sock.user?.id;
    const myJid = myJidRaw ? myJidRaw.split(':')[0] + '@s.whatsapp.net' : '';
    const myLidRaw = this.sock.user?.lid;
    const myLid = myLidRaw ? myLidRaw.split(':')[0] + '@lid' : '';
    // "Message yourself" chat (addressed by phone JID or, in newer WhatsApp, by LID)
    const isNoteToSelf = senderJid === myJid || senderJid === myLid;
    if (msg.key.fromMe && !isNoteToSelf) return; // the bot's own messages in other chats

    // Sender phone in canonical 62xxxx form. Chats addressed by LID carry the phone JID in remoteJidAlt.
    const phoneNumber = msg.key.fromMe
      ? phoneFromJid(myJid)
      : (phoneFromJid(senderJid) ?? phoneFromJid(msg.key.remoteJidAlt));
    if (!phoneNumber) {
      this.logger.warn(`Could not resolve a phone number for ${senderJid}; ignoring.`);
      return;
    }

    const text: string | undefined = msg.message.conversation ?? msg.message.extendedTextMessage?.text;
    if (!text || text.includes(WhatsAppService.BOT_MARKER)) return; // only text; never our own replies

    this.logger.log(`Processing message ${messageId} from ${phoneNumber}`);
    try {
      const replyText = await this.bot.reply(phoneNumber, text, messageId);
      if (replyText) await this.send(senderJid, replyText);
    } catch (err) {
      this.logger.error('Error processing message:', err);
      await this.send(senderJid, 'Maaf, sistem sedang mengalami gangguan.');
    }
  }

  /** Sends a bot reply and remembers its id so the echo in "Message yourself" is ignored. */
  private async send(jid: string, text: string) {
    const sent = await this.sock.sendMessage(jid, { text: text + WhatsAppService.BOT_MARKER });
    if (sent?.key?.id) remember(this.sentIds, sent.key.id);
  }

  public isConnected() {
    return this.connectionStatus.connected;
  }

  /** The bot's own number (62xxxx) while connected, used to build wa.me links. */
  public botPhoneNumber(): string | null {
    if (!this.connectionStatus.connected) return null;
    return phoneFromJid(this.sock?.user?.id);
  }

  public getConnectionStatus() {
    return this.connectionStatus;
  }

  public async resetSession() {
    this.logger.warn('Resetting WhatsApp session...');
    this.connectionStatus = { connected: false, qr: '' };
    
    if (this.sock) {
      this.sock.ev.removeAllListeners();
      try {
        this.sock.end(undefined);
      } catch (err) {
        this.logger.error('Error ending socket:', err);
      }
    }
    
    try {
      await clearDatabaseAuthState(this.prisma);
      this.logger.log('Deleted the stored WhatsApp session.');
    } catch (err) {
      this.logger.error('Failed to delete the stored WhatsApp session:', err);
    }

    // Give the old socket a moment to close before reconnecting
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    // Restart connection
    await this.connectToWhatsApp();
    return { success: true, message: 'Session reset initiated.' };
  }
}
