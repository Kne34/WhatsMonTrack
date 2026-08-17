import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @MessagePattern({ cmd: 'process_transaction' })
  async processTransaction(@Payload() data: { phoneNumber: string, rawText: string, parsedData: any }) {
    return await this.appService.handleParsedMessage(data.phoneNumber, data.rawText, data.parsedData);
  }
}
