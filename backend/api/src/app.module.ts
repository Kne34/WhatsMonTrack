import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { getJwtSecret } from './common/config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { AccountsModule } from './accounts/accounts.module';
import { BudgetsModule } from './budgets/budgets.module';
import { DebtsModule } from './debts/debts.module';
import { TransactionsModule } from './transactions/transactions.module';
import { ParserModule } from './parser/parser.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { ChatModule } from './chat/chat.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.registerAsync({
      global: true,
      useFactory: () => ({
        secret: getJwtSecret(),
        signOptions: { expiresIn: '7d' },
      }),
    }),
    // Generous default (dashboard polls); auth routes override with stricter limits
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    DatabaseModule,
    AuthModule,
    AccountsModule,
    BudgetsModule,
    DebtsModule,
    TransactionsModule,
    ParserModule,
    WhatsAppModule,
    ChatModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
