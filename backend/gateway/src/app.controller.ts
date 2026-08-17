import { Controller, Post, Body } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // Keep this endpoint for manual testing via Postman/cURL
  @Post('parse')
  async parseMessage(@Body('text') text: string, @Body('phoneNumber') phoneNumber: string) {
    if (!phoneNumber) phoneNumber = '081234567890'; // Default for testing
    return this.appService.processMessage(text, phoneNumber);
  }
}
