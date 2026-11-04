import { Module } from '@nestjs/common';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [WhatsAppModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
