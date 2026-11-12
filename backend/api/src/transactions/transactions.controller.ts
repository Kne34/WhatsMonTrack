import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import type { JwtUser } from '../common/config';
import { CurrentUser } from '../common/current-user.decorator';
import { CreateTransactionDto, TransactionsQueryDto, UpdateTransactionDto } from './transactions.dto';
import { TransactionsService } from './transactions.service';

@UseGuards(AuthGuard)
@Controller('api/transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  list(@CurrentUser() user: JwtUser, @Query() query: TransactionsQueryDto) {
    return this.transactions.list(user.id, query);
  }

  /** Lending and debt per person (Utang page). Declared before ':id' routes. */
  @Get('debts')
  debts(@CurrentUser() user: JwtUser) {
    return this.transactions.debts(user.id);
  }

  @Post('manual')
  createManual(@CurrentUser() user: JwtUser, @Body() body: CreateTransactionDto) {
    return this.transactions.createManual(user.id, body.data);
  }

  @Put(':id/confirm')
  confirm(@CurrentUser() user: JwtUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.transactions.confirm(user.id, id);
  }

  @Put(':id')
  update(@CurrentUser() user: JwtUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateTransactionDto) {
    return this.transactions.update(user.id, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.transactions.remove(user.id, id);
  }
}
