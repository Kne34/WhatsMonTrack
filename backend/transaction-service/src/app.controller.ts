import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) { }

  @MessagePattern({ cmd: 'process_transaction' })
  handleTransaction(data: { phoneNumber: string; rawText: string; parsedData: any }) {
    return this.appService.handleParsedMessage(data.phoneNumber, data.rawText, data.parsedData);
  }

  @MessagePattern({ cmd: 'get_accounts' })
  getAccounts(data: { phoneNumber: string }) {
    return this.appService.getAccounts(data.phoneNumber);
  }

  @MessagePattern({ cmd: 'get_transactions' })
  getTransactions(data: { phoneNumber: string; month?: number; year?: number; page?: number; limit?: number }) {
    return this.appService.getTransactions(data.phoneNumber, data);
  }

  @MessagePattern({ cmd: 'confirm_transaction' })
  confirmTransaction(data: { id: string }) {
    return this.appService.confirmTransaction(data.id);
  }

  @MessagePattern({ cmd: 'create_account' })
  createAccount(data: { phoneNumber: string; name: string; type: string; initialBalance: number }) {
    return this.appService.createAccount(data.phoneNumber, data.name, data.type, data.initialBalance);
  }

  @MessagePattern({ cmd: 'get_budgets' })
  getBudgets(data: { phoneNumber: string }) {
    return this.appService.getBudgets(data.phoneNumber);
  }

  @MessagePattern({ cmd: 'upsert_budget' })
  upsertBudget(data: { phoneNumber: string; categoryName: string; limit: number }) {
    return this.appService.upsertBudget(data.phoneNumber, data.categoryName, data.limit);
  }

  @MessagePattern({ cmd: 'update_transaction' })
  updateTransaction(data: { id: string; data: any }) {
    return this.appService.updateTransaction(data.id, data.data);
  }

  @MessagePattern({ cmd: 'delete_transaction' })
  deleteTransaction(data: { id: string }) {
    return this.appService.deleteTransaction(data.id);
  }

  @MessagePattern({ cmd: 'create_transaction' })
  createTransaction(data: { phoneNumber: string; data: any }) {
    return this.appService.createTransactionManual(data.phoneNumber, data.data);
  }
}
