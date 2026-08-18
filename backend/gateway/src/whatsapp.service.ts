import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers } from '@whiskeysockets/baileys';
import * as qrcode from 'qrcode-terminal';
import { AppService } from './app.service';
import { Boom } from '@hapi/boom';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class WhatsAppService implements OnModuleInit {
  private readonly logger = new Logger(WhatsAppService.name);
  private sock: any;
  private connectionStatus = { connected: false, qr: '' };

  constructor(private readonly appService: AppService) {}

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
        // reconnect if not logged out
        if (shouldReconnect) {
          this.connectToWhatsApp();
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

      // Extract the sender phone number (If it's fromMe, it's our own number)
      const phoneNumberRaw = msg.key.fromMe ? myJid.split('@')[0] : (senderJid?.split('@')[0] || '');
      
      let phoneNumber = phoneNumberRaw;
      if (phoneNumber.startsWith('62')) {
        phoneNumber = '0' + phoneNumber.substring(2);
      }

      // STRICT SECURITY CHECK: Only allow messages from the configured default phone number!
      const authorizedNumberRaw = process.env.DEFAULT_PHONE_NUMBER || '';
      let authorizedNumber = authorizedNumberRaw;
      if (authorizedNumber.startsWith('62')) {
         authorizedNumber = '0' + authorizedNumber.substring(2);
      }
      
      // If the sender is not the authorized number, AND it's not a Note-to-Self, ignore it!
      // This prevents the bot from replying to random people (like Mami Oppo).
      if (phoneNumber !== authorizedNumber && !isNoteToSelf) {
        this.logger.log(`[DEBUG] Ignored message from unauthorized number: ${phoneNumber}`);
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
      if (ignoredPrefixes.some(prefix => text.startsWith(prefix)) || text.includes('\u200B')) {
        this.logger.log(`[DEBUG] Ignored own bot reply to prevent loop.`);
        return;
      }

      this.logger.log(`Processing message from ${phoneNumber}: ${text}`);

      try {
        const response = await this.appService.processMessage(text, phoneNumber);
        
        let replyText = 'Maaf, terjadi kesalahan saat memproses data.';
        if (typeof response === 'string') {
          replyText = response; // Transaction service returned a formatted success string
        } else if (response?.status === 'success' && response?.data) {
          replyText = `Berhasil! Transaksi sebesar Rp${response.data.amount} untuk ${response.data.subcategory} telah dicatat. Sisa saldo ${response.data.account}: Rp${response.data.balance}.`;
        } else if (response?.status === 'error') {
          replyText = `Gagal: ${response.message}`;
        } else if (response?.message) {
           replyText = response.message;
        }

        // Add a Zero-Width Space (ZWS) at the end to uniquely identify our own replies
        const finalReply = replyText + '\u200B';
        await this.sock.sendMessage(senderJid, { text: finalReply });
        this.logger.log(`Replied to ${phoneNumber}`);
      } catch (err) {
        this.logger.error('Error processing message:', err);
        await this.sock.sendMessage(senderJid, { text: 'Maaf, sistem sedang mengalami gangguan.' });
      }
    });
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
