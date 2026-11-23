import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import type { JwtUser } from '../common/config';
import { CurrentUser } from '../common/current-user.decorator';
import { CreateDebtDto, DebtsQueryDto, PayDto, SettleDto, UpdateDebtDto } from './debts.dto';
import { DebtsService } from './debts.service';

@UseGuards(AuthGuard)
@Controller('api/debts')
export class DebtsController {
  constructor(private readonly debts: DebtsService) {}

  /** `{ records, summary }`; the summary always covers every open record, whatever the filters */
  @Get()
  list(@CurrentUser() user: JwtUser, @Query() query: DebtsQueryDto) {
    return this.debts.list(user.id, query);
  }

  @Get('summary')
  summary(@CurrentUser() user: JwtUser) {
    return this.debts.summary(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: JwtUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.debts.get(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() body: CreateDebtDto) {
    return this.debts.create(user.id, body);
  }

  @Put(':id')
  update(@CurrentUser() user: JwtUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateDebtDto) {
    return this.debts.update(user.id, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.debts.remove(user.id, id);
  }

  /** Tick a person as paid (again: replaces the earlier payment) */
  @HttpCode(200)
  @Post(':id/participants/:pid/pay')
  pay(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('pid', ParseUUIDPipe) pid: string,
    @Body() body: PayDto,
  ) {
    return this.debts.pay(user.id, id, pid, body);
  }

  /** Untick: the payment is undone */
  @Delete(':id/participants/:pid/pay')
  unpay(@CurrentUser() user: JwtUser, @Param('id', ParseUUIDPipe) id: string, @Param('pid', ParseUUIDPipe) pid: string) {
    return this.debts.unpay(user.id, id, pid);
  }

  @HttpCode(200)
  @Post(':id/settle')
  settle(@CurrentUser() user: JwtUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: SettleDto) {
    return this.debts.settle(user.id, id, body);
  }

  @HttpCode(200)
  @Post(':id/reopen')
  reopen(@CurrentUser() user: JwtUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.debts.reopen(user.id, id);
  }
}
