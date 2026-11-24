import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '../common/auth.guard';
import type { JwtUser } from '../common/config';
import { CurrentUser } from '../common/current-user.decorator';
import { ChartQueryDto, CreateInvestmentDto, CreateTradeDto, UpdateInvestmentDto } from './investments.dto';
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

  // Fetches from Yahoo/Binance on a cache miss
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Get(':id/chart')
  chart(@CurrentUser() user: JwtUser, @Param('id', ParseUUIDPipe) id: string, @Query() query: ChartQueryDto) {
    return this.investments.chart(user.id, id, query.interval ?? '1D');
  }

  // Day range, 52-week range, market cap: fetched on a cache miss
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Get(':id/profile')
  profile(@CurrentUser() user: JwtUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.investments.profile(user.id, id);
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

  // The page asks every 10 seconds (plus the dashboard); the shared cache keeps the sources calm
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Get('prices')
  prices(@CurrentUser() user: JwtUser) {
    return this.investments.prices(user.id);
  }
}
