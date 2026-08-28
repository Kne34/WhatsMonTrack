import { Controller, Post, Body, Get, Put, Query, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { AppService } from './app.service';
import { WhatsAppService } from './whatsapp.service';
import { AuthGuard } from './auth.guard';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly whatsappService: WhatsAppService
  ) {}

  // Keep this endpoint for manual testing via Postman/cURL
  @Post('parse')
  async parseMessage(@Body() body: { text: string; phoneNumber?: string }) {
    // Legacy HTTP endpoint (used before WhatsApp Baileys integration)
    const phoneNumber = (body.phoneNumber || process.env.DEFAULT_PHONE_NUMBER || '') as string;
    return this.appService.processMessage(body.text, phoneNumber);
  }

  // REST APIs for Frontend Dashboard

  @Post('api/auth/register')
  async register(@Body() body: any) {
    return this.appService.authRegister(body);
  }

  @Post('api/auth/verify-otp')
  async verifyOtp(@Body() body: any) {
    return this.appService.authVerifyOtp(body);
  }

  @Post('api/auth/login')
  async login(@Body() body: any) {
    return this.appService.authLogin(body);
  }

  @UseGuards(AuthGuard)
  @Get('api/auth/me')
  getProfile(@Request() req: any) {
    return req.user;
  }

  @Get('api/whatsapp/status')
  getWhatsAppStatus() {
    return this.whatsappService.getConnectionStatus();
  }

  @Post('api/whatsapp/reset')
  resetWhatsAppSession() {
    return this.whatsappService.resetSession();
  }

  @UseGuards(AuthGuard)
  @Get('api/accounts')
  async getAccounts(@Request() req: any) {
    return this.appService.getAccounts(req.user.phoneNumber);
  }

  @UseGuards(AuthGuard)
  @Post('api/accounts')
  async createAccount(@Request() req: any, @Body() body: { name: string; type: string; initialBalance: number }) {
    return this.appService.createAccount(req.user.phoneNumber, body.name, body.type, body.initialBalance);
  }

  @UseGuards(AuthGuard)
  @Get('api/budgets')
  async getBudgets(@Request() req: any) {
    return this.appService.getBudgets(req.user.phoneNumber);
  }

  @UseGuards(AuthGuard)
  @Post('api/budgets')
  async upsertBudget(@Request() req: any, @Body() body: { categoryName: string; limit: number }) {
    return this.appService.upsertBudget(req.user.phoneNumber, body.categoryName, body.limit);
  }

  @UseGuards(AuthGuard)
  @Delete('api/budgets/:id')
  async deleteBudget(@Param('id') id: string) {
    return this.appService.deleteBudget(id);
  }

  @UseGuards(AuthGuard)
  @Put('api/accounts/:id')
  async updateAccount(@Param('id') id: string, @Body() data: any) {
    return this.appService.updateAccount(id, data);
  }

  @UseGuards(AuthGuard)
  @Delete('api/accounts/:id')
  async deleteAccount(@Param('id') id: string) {
    return this.appService.deleteAccount(id);
  }

  @UseGuards(AuthGuard)
  @Get('api/transactions')
  async getTransactions(
    @Request() req: any,
    @Query('month') month?: string,
    @Query('year') year?: string,
    @Query('day') day?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.appService.getTransactions(req.user.phoneNumber, {
      month: month ? parseInt(month) : undefined,
      year: year ? parseInt(year) : undefined,
      day: day ? parseInt(day) : undefined,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @UseGuards(AuthGuard)
  @Put('api/transactions/:id/confirm')
  async confirmTransaction(@Param('id') id: string) {
    return this.appService.confirmTransaction(id);
  }

  @UseGuards(AuthGuard)
  @Put('api/transactions/:id')
  async updateTransaction(@Param('id') id: string, @Body() data: any) {
    return this.appService.updateTransaction(id, data);
  }

  @UseGuards(AuthGuard)
  @Delete('api/transactions/:id')
  async deleteTransaction(@Param('id') id: string) {
    return this.appService.deleteTransaction(id);
  }

  @UseGuards(AuthGuard)
  @Post('api/transactions/manual')
  async createTransactionManual(@Request() req: any, @Body() body: { data: any }) {
    return this.appService.createTransactionManual(req.user.phoneNumber, body.data);
  }
}
