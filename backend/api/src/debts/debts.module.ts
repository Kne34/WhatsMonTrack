import { Module } from '@nestjs/common';
import { DebtsController } from './debts.controller';
import { DebtsService } from './debts.service';

/** Utang-piutang page: to-do style notes of who owes whom (not transactions). */
@Module({
  controllers: [DebtsController],
  providers: [DebtsService],
})
export class DebtsModule {}
