import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { ParserModule } from '../parser/parser.module';
import { BotService } from './bot.service';
import { PhoneLinkService } from './phone-link.service';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';

@Module({
  imports: [AccountsModule, BudgetsModule, TransactionsModule, ParserModule],
  controllers: [WhatsAppController],
  providers: [WhatsAppService, BotService, PhoneLinkService],
})
export class WhatsAppModule {}
