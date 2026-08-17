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
    const phone = phoneNumber || (process.env.DEFAULT_PHONE_NUMBER as string);
    return this.appService.getAccounts(phone);
  }

  @Post('api/accounts')
  async createAccount(@Body() body: { phoneNumber: string; name: string; type: string; initialBalance: number }) {
    const phone = body.phoneNumber || (process.env.DEFAULT_PHONE_NUMBER as string);
    return this.appService.createAccount(phone, body.name, body.type, body.initialBalance);
  }

  @Get('api/transactions')
  async getTransactions(
    @Query('phoneNumber') phoneNumber: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('day') day?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const phone = phoneNumber || (process.env.DEFAULT_PHONE_NUMBER as string);
    return this.appService.getTransactions(phone, {
      month: month ? parseInt(month) : undefined,
      year: year ? parseInt(year) : undefined,
      day: day ? parseInt(day) : undefined,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Put('api/transactions/:id/confirm')
  async confirmTransaction(@Param('id') id: string) {
    return this.appService.confirmTransaction(id);
  }

  @Put('api/transactions/:id')
  async updateTransaction(@Param('id') id: string, @Body() data: any) {
    return this.appService.updateTransaction(id, data);
  }
}
