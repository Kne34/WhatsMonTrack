import { Module } from '@nestjs/common';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MailService } from './mail.service';

@Module({
  imports: [WhatsAppModule],
  controllers: [AuthController],
  providers: [AuthService, MailService],
})
export class AuthModule {}
