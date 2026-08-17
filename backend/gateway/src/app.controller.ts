import { Controller, Post, Body, Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(
    @Inject('PARSER_SERVICE') private parserClient: ClientProxy,
    @Inject('TRANSACTION_SERVICE') private transactionClient: ClientProxy,
  ) {}

  @Post('parse')
  async parseMessage(@Body('text') text: string, @Body('phoneNumber') phoneNumber: string) {
    if (!phoneNumber) phoneNumber = '081234567890'; // Default for testing
    
    // 1. Parse text using Parser Service
    this.logger.log(`Parsing message from ${phoneNumber}: ${text}`);
    const parseResult = await lastValueFrom(this.parserClient.send({ cmd: 'parse_transaction' }, text));
    
    if (parseResult.status === 'error') {
      return parseResult.message;
    }

    // 2. Process database transaction using Transaction Service
    this.logger.log(`Sending parsed data to Transaction Service`);
    const finalResponse = await lastValueFrom(this.transactionClient.send(
      { cmd: 'process_transaction' }, 
      { phoneNumber, rawText: text, parsedData: parseResult.data }
    ));

    return finalResponse;
  }
}
