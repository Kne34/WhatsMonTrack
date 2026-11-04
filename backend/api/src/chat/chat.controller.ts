import { Body, Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { AuthGuard } from '../common/auth.guard';
import type { JwtUser } from '../common/config';
import { CurrentUser } from '../common/current-user.decorator';
import { ChatService } from './chat.service';

class ChatMessageDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1, { message: 'Pesan tidak boleh kosong' })
  @MaxLength(500, { message: 'Pesan maksimal 500 karakter' })
  text: string;
}

@UseGuards(AuthGuard)
@Controller('api/chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  /** The latest messages, oldest first. */
  @Get()
  history(@CurrentUser() user: JwtUser) {
    return this.chat.history(user.id);
  }

  /** Send a message to the bot; returns the saved message and the bot's reply. */
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post()
  send(@CurrentUser() user: JwtUser, @Body() body: ChatMessageDto) {
    return this.chat.send(user.id, body.text);
  }

  /** Clears the chat history (recorded transactions stay). */
  @Delete()
  clear(@CurrentUser() user: JwtUser) {
    return this.chat.clear(user.id);
  }
}
