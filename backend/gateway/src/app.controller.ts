import { Controller, Post, Body, Get, Put, Query, Param } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) { }

  // Keep this endpoint for manual testing via Postman/cURL
  @Post('parse')
  async parseMessage(@Body() body: { text: string; phoneNumber?: string }) {
    // Legacy HTTP endpoint (used before WhatsApp Baileys integration)
    const phoneNumber = (body.phoneNumber || process.env.DEFAULT_PHONE_NUMBER || '') as string;
    return this.appService.processMessage(body.text, phoneNumber);
  }

  // REST APIs for Frontend Dashboard

  @Get('api/accounts')
  async getAccounts(@Query('phoneNumber') phoneNumber: string) {
    // If no phone provided, use a default for testing
    const pn = (phoneNumber || process.env.DEFAULT_PHONE_NUMBER || '') as string;
    return this.appService.getAccounts(pn);
  }

  @Get('api/transactions')
  async getTransactions(@Query('phoneNumber') phoneNumber: string) {
    const pn = (phoneNumber || process.env.DEFAULT_PHONE_NUMBER || '') as string;
    return this.appService.getTransactions(pn);
  }

  @Put('api/transactions/:id/confirm')
  async confirmTransaction(@Param('id') id: string) {
    return this.appService.confirmTransaction(id);
  }
}
