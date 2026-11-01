import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } from '@whiskeysockets/baileys';
import * as qrcode from 'qrcode-terminal';
import { BotService } from './bot.service';
import { phoneFromJid } from '../common/phone';
import { Boom } from '@hapi/boom';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class WhatsAppService implements OnModuleInit {
  private readonly logger = new Logger(WhatsAppService.name);
  private sock: any;
  private connectionStatus = { connected: false, qr: '' };

  /** Appended to every bot message so the "Note to Self" handler never processes its own replies. */
  static readonly BOT_MARKER = '\u200B';

  constructor(private readonly bot: BotService) {}

  async onModuleInit() {
    this.logger.log('Initializing WhatsApp Service...');
    await this.connectToWhatsApp();
  }

  async connectToWhatsApp() {
    const authPath = path.join(process.cwd(), 'auth_info_baileys');
    const { state, saveCreds } = await useMultiFileAuthState(authPath);

    this.sock = makeWASocket({
      auth: state,
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

    this.sock.ev.on('messages.upsert', async (m) => {
      const msg = m.messages[0];
      if (!msg.message) return; // Ignore empty messages

      const senderJid = msg.key.remoteJid;
      
      // DEBUG LOG
      this.logger.log(`[DEBUG] Received upsert. remoteJid: ${senderJid}, fromMe: ${msg.key.fromMe}`);

      if (senderJid?.endsWith('@g.us')) return; // Ignore group chats!

      const myJidRaw = this.sock.user?.id;
      const myJid = myJidRaw ? myJidRaw.split(':')[0] + '@s.whatsapp.net' : '';
      const myLidRaw = this.sock.user?.lid;
      const myLid = myLidRaw ? myLidRaw.split(':')[0] + '@lid' : '';

      // WhatsApp now uses @lid for "Message Yourself" chats, but we strictly match our own ID
      const isNoteToSelf = senderJid === myJid || senderJid === myLid;

      this.logger.log(`[DEBUG] myJid: ${myJid}, myLid: ${myLid}, isNoteToSelf: ${isNoteToSelf}`);

      if (msg.key.fromMe && !isNoteToSelf) {
        this.logger.log(`[DEBUG] Ignored because fromMe is true and isNoteToSelf is false.`);
        return;
      }

      // Sender phone in canonical 62xxxx form. Chats addressed by LID carry the phone JID in remoteJidAlt.
      const phoneNumber = msg.key.fromMe
        ? phoneFromJid(myJid)
        : (phoneFromJid(senderJid) ?? phoneFromJid(msg.key.remoteJidAlt));
      if (!phoneNumber) {
        this.logger.warn(`[DEBUG] Could not resolve a phone number for ${senderJid}; ignoring.`);
        return;
      }

      const messageType = Object.keys(msg.message)[0];
      let text = '';

      if (messageType === 'conversation') {
        text = msg.message.conversation;
      } else if (messageType === 'extendedTextMessage') {
        text = msg.message.extendedTextMessage?.text;
      }

      this.logger.log(`[DEBUG] messageType: ${messageType}, text: ${text}`);

      if (!text) return; // We only process text

      // IMPORTANT: Prevent infinite loop when using "Note to Self"
      // because our own replies are sent as fromMe=true
      const ignoredPrefixes = ['Berhasil!', 'Gagal:', 'Maaf,', 'Tercatat', 'Tolong'];
      if (ignoredPrefixes.some(prefix => text.startsWith(prefix)) || text.includes(WhatsAppService.BOT_MARKER)) {
        this.logger.log(`[DEBUG] Ignored own bot reply to prevent loop.`);
        return;
      }

      this.logger.log(`Processing message from ${phoneNumber}: ${text}`);

      try {
        const replyText = await this.bot.reply(phoneNumber, text);
        if (!replyText) return;

        // Add a Zero-Width Space (ZWS) at the end to uniquely identify our own replies
        await this.sock.sendMessage(senderJid, { text: replyText + WhatsAppService.BOT_MARKER });
        this.logger.log(`Replied to ${phoneNumber}`);
      } catch (err) {
        this.logger.error('Error processing message:', err);
        await this.sock.sendMessage(senderJid, { text: 'Maaf, sistem sedang mengalami gangguan.' + WhatsAppService.BOT_MARKER });
      }
    });
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
    
    const authPath = path.join(process.cwd(), 'auth_info_baileys');
    if (fs.existsSync(authPath)) {
      try {
        fs.rmSync(authPath, { recursive: true, force: true });
        this.logger.log('Deleted auth_info_baileys folder.');
      } catch (err) {
        this.logger.error('Failed to delete auth_info_baileys:', err);
      }
    }

    // Delay briefly to ensure files are released
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    // Restart connection
    await this.connectToWhatsApp();
    return { success: true, message: 'Session reset initiated.' };
  }
}
