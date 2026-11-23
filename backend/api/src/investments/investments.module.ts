import { Module } from '@nestjs/common';
import { InvestmentsController, MarketController } from './investments.controller';
import { InvestmentsService } from './investments.service';
import { MarketService } from './market.service';

/** Investasi page: holdings on Stockbit/Pluang/..., buy/sell history, and live prices. */
@Module({
  controllers: [InvestmentsController, MarketController],
  providers: [InvestmentsService, MarketService],
})
export class InvestmentsModule {}
