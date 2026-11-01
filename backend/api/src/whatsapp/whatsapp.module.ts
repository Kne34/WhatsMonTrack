import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { BudgetsModule } from '../budgets/budgets.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { ParserModule } from '../parser/parser.module';
import { BotService } from './bot.service';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';

// Note: AuthModule depends on this module (to send phone OTPs), so this module must not import AuthModule.
@Module({
  imports: [AccountsModule, BudgetsModule, TransactionsModule, ParserModule],
  controllers: [WhatsAppController],
  providers: [WhatsAppService, BotService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
