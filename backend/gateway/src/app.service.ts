import { Injectable, Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(
    @Inject('PARSER_SERVICE') private parserClient: ClientProxy,
    @Inject('TRANSACTION_SERVICE') private transactionClient: ClientProxy,
  ) { }

  async processMessage(text: string, phoneNumber: string) {
    // 1. Parse text using Parser Service
    this.logger.log(`Parsing message from ${phoneNumber}: ${text}`);
    const parseResult = await lastValueFrom(this.parserClient.send({ cmd: 'parse_transaction' }, text));

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

  // REST API Forwarding to Transaction Servic

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
