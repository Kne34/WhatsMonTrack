import { Controller, Post, Body, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';

@Controller()
export class AppController {
  constructor(@Inject('PARSER_SERVICE') private client: ClientProxy) {}

  @Post('parse')
  async parseMessage(@Body('text') text: string) {
    // Send the raw text to the parser microservice via TCP
    const result = this.client.send({ cmd: 'parse_transaction' }, text);
    
    // Await the response from the microservice
    return await lastValueFrom(result);
  }
}
