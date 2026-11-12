import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import type { JwtUser } from '../common/config';
import { CurrentUser } from '../common/current-user.decorator';
import { CreateDebtNoteDto, UpdateDebtNoteDto } from './debts.dto';
import { DebtsService } from './debts.service';

@UseGuards(AuthGuard)
@Controller('api/debts')
export class DebtsController {
  constructor(private readonly debts: DebtsService) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.debts.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() body: CreateDebtNoteDto) {
    return this.debts.create(user.id, body);
  }

  @Put(':id')
  update(@CurrentUser() user: JwtUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateDebtNoteDto) {
    return this.debts.update(user.id, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.debts.remove(user.id, id);
  }
}
