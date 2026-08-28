import { Injectable, Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { JwtService } from '@nestjs/jwt';
import * as nodemailer from 'nodemailer';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);
  private transporter: nodemailer.Transporter;

  constructor(
    @Inject('PARSER_SERVICE') private parserClient: ClientProxy,
    @Inject('TRANSACTION_SERVICE') private transactionClient: ClientProxy,
    private jwtService: JwtService
  ) {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.ethereal.email',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
      },
    });
  }

  async processMessage(text: string, phoneNumber: string) {
    // 1. Fetch user context (accounts) for better AI parsing
    let accountsContext = '';
    try {
      const accounts = await lastValueFrom(this.transactionClient.send({ cmd: 'get_accounts' }, { phoneNumber }));
      if (accounts && Array.isArray(accounts) && accounts.length > 0) {
        accountsContext = accounts.map(a => a.name).join(', ');
      }
    } catch(e) {
      this.logger.warn('Failed to fetch accounts context', e);
    }

    // 2. Parse text using Parser Service
    this.logger.log(`Parsing message from ${phoneNumber}: ${text}`);
    const parseResult = await lastValueFrom(this.parserClient.send(
      { cmd: 'parse_transaction' }, 
      { text, context: { accounts: accountsContext } }
    ));

    if (parseResult.status === 'error') {
      return parseResult; // return the error object
    }

    // 2. Process database transaction using Transaction Service
    this.logger.log(`Sending parsed data to Transaction Service`);
    const finalResponse = await lastValueFrom(this.transactionClient.send(
      { cmd: 'process_transaction' },
      { phoneNumber, rawText: text, parsedData: parseResult.data }
    ));

    return finalResponse;
  }

  // AUTH & REST API
  
  async authRegister(data: any) {
    const result = await lastValueFrom(this.transactionClient.send({ cmd: 'auth_register' }, data));
    if (result.success) {
      // Send OTP via email
      await this.transporter.sendMail({
        from: '"WhatsMonTrack" <noreply@whatsmontrack.com>',
        to: data.email,
        subject: 'Verifikasi Akun WhatsMonTrack',
        text: `Kode OTP Anda adalah: ${result.otpCode}. Kode ini berlaku selama 15 menit.`,
      });
      return { success: true, message: 'OTP terkirim ke email Anda.' };
    }
    return result;
  }

  async authVerifyOtp(data: any) {
    const result = await lastValueFrom(this.transactionClient.send({ cmd: 'auth_verify_otp' }, data));
    if (result.success) {
      const token = await this.jwtService.signAsync({ id: result.user.id, phoneNumber: result.user.phoneNumber });
      return { success: true, token, user: result.user };
    }
    return result;
  }

  async authLogin(data: any) {
    const result = await lastValueFrom(this.transactionClient.send({ cmd: 'auth_login' }, data));
    if (result.success) {
      const token = await this.jwtService.signAsync({ id: result.user.id, phoneNumber: result.user.phoneNumber });
      return { success: true, token, user: result.user };
    }
    return result;
  }

  async generateRecap(phoneNumber: string) {
    return lastValueFrom(this.transactionClient.send({ cmd: 'generate_recap' }, { phoneNumber }));
  }

  async checkUser(phoneNumber: string) {
    return lastValueFrom(this.transactionClient.send({ cmd: 'check_user' }, { phoneNumber }));
  }

  async getAccounts(phoneNumber: string) {
    return lastValueFrom(this.transactionClient.send({ cmd: 'get_accounts' }, { phoneNumber }));
  }

  async createAccount(phoneNumber: string, name: string, type: string, initialBalance: number) {
    return lastValueFrom(this.transactionClient.send({ cmd: 'create_account' }, { phoneNumber, name, type, initialBalance }));
  }

  async updateAccount(id: string, data: any) {
    return lastValueFrom(this.transactionClient.send({ cmd: 'update_account' }, { id, data }));
  }

  async deleteAccount(id: string) {
    return lastValueFrom(this.transactionClient.send({ cmd: 'delete_account' }, { id }));
  }

  async getBudgets(phoneNumber: string) {
    return lastValueFrom(this.transactionClient.send({ cmd: 'get_budgets' }, { phoneNumber }));
  }

  async upsertBudget(phoneNumber: string, categoryName: string, limit: number) {
    return lastValueFrom(this.transactionClient.send({ cmd: 'upsert_budget' }, { phoneNumber, categoryName, limit }));
  }

  async deleteBudget(id: string) {
    return lastValueFrom(this.transactionClient.send({ cmd: 'delete_budget' }, { id }));
  }

  async getTransactions(phoneNumber: string, query?: any) {
    return lastValueFrom(this.transactionClient.send({ cmd: 'get_transactions' }, { phoneNumber, ...query }));
  }

  async confirmTransaction(id: string) {
    return lastValueFrom(this.transactionClient.send({ cmd: 'confirm_transaction' }, { id }));
  }

  async updateTransaction(id: string, data: any) {
    return lastValueFrom(this.transactionClient.send({ cmd: 'update_transaction' }, { id, data }));
  }

  async deleteTransaction(id: string) {
    return lastValueFrom(this.transactionClient.send({ cmd: 'delete_transaction' }, { id }));
  }

  async createTransactionManual(phoneNumber: string, data: any) {
    return lastValueFrom(this.transactionClient.send({ cmd: 'create_transaction' }, { phoneNumber, data }));
  }
}
