import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { AdminGuard, AuthGuard } from '../common/auth.guard';
import { isAdmin } from '../common/config';
import type { JwtUser } from '../common/config';
import { CurrentUser } from '../common/current-user.decorator';
import { BotService } from './bot.service';
import { WhatsAppService } from './whatsapp.service';

class ParseMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  text: string;
}

@UseGuards(AuthGuard)
@Controller()
export class WhatsAppController {
  constructor(
    private readonly whatsapp: WhatsAppService,
    private readonly bot: BotService,
  ) {}

  /** Any logged-in user may see whether the bot is online; only admins get the QR code. */
  @Get('api/whatsapp/status')
  status(@CurrentUser() user: JwtUser) {
    const { connected, qr } = this.whatsapp.getConnectionStatus();
    const canManage = isAdmin(user.email);
    return { connected, qr: canManage ? qr : '', canManage };
  }

  @UseGuards(AdminGuard)
  @Post('api/whatsapp/reset')
  reset() {
    return this.whatsapp.resetSession();
  }

  /** Manual testing (Postman/cURL): runs a message through the bot as the logged-in user. */
  @Post('parse')
  async parse(@CurrentUser() user: JwtUser, @Body() body: ParseMessageDto) {
    return { reply: await this.bot.handleMessage(user.id, body.text) };
  }
}
