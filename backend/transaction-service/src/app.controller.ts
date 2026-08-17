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
  getTransactions(data: { phoneNumber: string }) {
    return this.appService.getTransactions(data.phoneNumber);
  }

  @MessagePattern({ cmd: 'confirm_transaction' })
  confirmTransaction(data: { id: string }) {
    return this.appService.confirmTransaction(data.id);
  }
}
