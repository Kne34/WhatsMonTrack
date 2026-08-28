import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WhatsAppService } from './whatsapp.service';

@Module({
  imports: [
    ConfigModule.forRoot(),
    ClientsModule.register([
      {
        name: 'PARSER_SERVICE',
        transport: Transport.TCP,
        options: {
          host: 'parser-service', // Name of the docker container
          port: 3001,
        },
      },
      {
        name: 'TRANSACTION_SERVICE',
        transport: Transport.TCP,
        options: {
          host: 'transaction-service',
          port: 3002,
        },
      },
    ]),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'supersecretkey123',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AppController],
  providers: [AppService, WhatsAppService],
})
export class AppModule {}
