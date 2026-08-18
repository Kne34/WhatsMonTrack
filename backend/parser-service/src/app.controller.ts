import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @MessagePattern({ cmd: 'parse_transaction' })
  async parseTransaction(payload: { text: string; context?: any } | string) {
    const text = typeof payload === 'string' ? payload : payload.text;
    const context = typeof payload === 'string' ? {} : payload.context;
    return this.appService.parseMessage(text, context);
  }
}
