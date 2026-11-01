import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import type { JwtUser } from '../common/config';
import { CurrentUser } from '../common/current-user.decorator';
import { UpsertBudgetDto } from './budgets.dto';
import { BudgetsService } from './budgets.service';

@UseGuards(AuthGuard)
@Controller('api/budgets')
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.budgets.list(user.id);
  }

  @Post()
  upsert(@CurrentUser() user: JwtUser, @Body() body: UpsertBudgetDto) {
    return this.budgets.upsert(user.id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.budgets.remove(user.id, id);
  }
}
