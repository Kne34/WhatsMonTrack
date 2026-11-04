import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../common/auth.guard';
import type { JwtUser } from '../common/config';
import { CurrentUser } from '../common/current-user.decorator';
import { CreateAccountDto, UpdateAccountDto } from './accounts.dto';
import { AccountsService } from './accounts.service';

@UseGuards(AuthGuard)
@Controller('api/accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  /** Accounts with `transactionCount`: how many transactions use each one. */
  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.accounts.listWithUsage(user.id);
  }

  @Post()
  create(@CurrentUser() user: JwtUser, @Body() body: CreateAccountDto) {
    return this.accounts.create(user.id, body);
  }

  @Put(':id')
  update(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateAccountDto,
  ) {
    return this.accounts.update(user.id, id, body);
  }

  /** 409 while transactions use the account, unless `?withTransactions=true` deletes them too. */
  @Delete(':id')
  remove(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('withTransactions') withTransactions?: string,
  ) {
    return this.accounts.remove(user.id, id, withTransactions === 'true');
  }
}
