import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '../common/auth.guard';
import type { JwtUser } from '../common/config';
import { CurrentUser } from '../common/current-user.decorator';
import { CreateInvestmentDto, CreateTradeDto, PricesQueryDto, UpdateInvestmentDto } from './investments.dto';
import { InvestmentsService } from './investments.service';

@UseGuards(AuthGuard)
@Controller('api/investments')
export class InvestmentsController {
  constructor(private readonly investments: InvestmentsService) {}

  @Get()
  list(@CurrentUser() user: JwtUser) {
    return this.investments.list(user.id);
  }

  // Looks up tickers on Yahoo/CoinGecko, so it is rate limited
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Post()
  create(@CurrentUser() user: JwtUser, @Body() body: CreateInvestmentDto) {
    return this.investments.create(user.id, body);
  }

  @Put(':id')
  update(@CurrentUser() user: JwtUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateInvestmentDto) {
    return this.investments.update(user.id, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.investments.remove(user.id, id);
  }

  @Get(':id/trades')
  trades(@CurrentUser() user: JwtUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.investments.trades(user.id, id);
  }

  @Post(':id/trades')
  addTrade(@CurrentUser() user: JwtUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: CreateTradeDto) {
    return this.investments.addTrade(user.id, id, body);
  }
}

/** Live prices of the user's holdings, fetched by the API (no CORS issues, one shared cache). */
@UseGuards(AuthGuard)
@Controller('api/market')
export class MarketController {
  constructor(private readonly investments: InvestmentsService) {}

  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Get('prices')
  prices(@CurrentUser() user: JwtUser, @Query() query: PricesQueryDto) {
    return this.investments.prices(user.id, query.refresh);
  }
}
