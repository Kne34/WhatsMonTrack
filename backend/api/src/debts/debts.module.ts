import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { DebtsController } from './debts.controller';
import { DebtsService } from './debts.service';

/** Utang-piutang: talangan and debts with real-time cash flow, settled into the reports. */
@Module({
  imports: [AccountsModule],
  controllers: [DebtsController],
  providers: [DebtsService],
  exports: [DebtsService],
})
export class DebtsModule {}
