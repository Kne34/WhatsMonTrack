import { Body, Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { AdminGuard, AuthGuard } from '../common/auth.guard';
import { isAdmin } from '../common/config';
import type { JwtUser } from '../common/config';
import { CurrentUser } from '../common/current-user.decorator';
import { normalizePhone } from '../common/phone';
import { BotService } from './bot.service';
import { PhoneLinkService } from './phone-link.service';
import { WhatsAppService } from './whatsapp.service';

class ParseMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  text: string;
}

class LinkPhoneDto {
  // Optional: if given, only this number can complete the link. Accepts 0812…, +62 812…, 62812…
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' && value.trim() ? normalizePhone(value) : undefined))
  @Matches(/^62\d{8,13}$/, { message: 'Nomor WhatsApp tidak valid, contoh: 0812xxxxxxxx' })
  phoneNumber?: string;
}

@UseGuards(AuthGuard)
@Controller()
export class WhatsAppController {
  constructor(
    private readonly whatsapp: WhatsAppService,
    private readonly bot: BotService,
    private readonly phoneLink: PhoneLinkService,
  ) {}

  /** Bot connection status. Only admins get the QR code needed to (re)connect the shared bot. */
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

  /** The user's linked WhatsApp number and any pending link code. */
  @Get('api/phone')
  phoneStatus(@CurrentUser() user: JwtUser) {
    return this.phoneLink.status(user.id, this.whatsapp.botPhoneNumber());
  }

  /** Creates a code; the user then sends "VERIFIKASI <code>" to the bot (via the returned wa.me link/QR). */
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('api/phone/link')
  startLink(@CurrentUser() user: JwtUser, @Body() body: LinkPhoneDto) {
    return this.phoneLink.start(user.id, body.phoneNumber, this.whatsapp.botPhoneNumber());
  }

  @Delete('api/phone')
  unlink(@CurrentUser() user: JwtUser) {
    return this.phoneLink.unlink(user.id);
  }

  /** Manual testing (Postman/cURL): runs a message through the bot as the logged-in user. */
  @Post('parse')
  async parse(@CurrentUser() user: JwtUser, @Body() body: ParseMessageDto) {
    return { reply: await this.bot.handleMessage(user.id, body.text) };
  }
}
