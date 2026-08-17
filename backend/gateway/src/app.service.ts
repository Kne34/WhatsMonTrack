import { Injectable, Inject, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(
    @Inject('PARSER_SERVICE') private parserClient: ClientProxy,
    @Inject('TRANSACTION_SERVICE') private transactionClient: ClientProxy,
  ) {}

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
}
