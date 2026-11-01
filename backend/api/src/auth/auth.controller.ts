import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '../common/auth.guard';
import { isAdmin } from '../common/config';
import type { JwtUser } from '../common/config';
import { CurrentUser } from '../common/current-user.decorator';
import { LoginDto, RegisterDto, VerifyOtpDto } from './auth.dto';
import { AuthService } from './auth.service';

const STRICT = { default: { ttl: 60_000, limit: 5 } };

@Controller('api/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Throttle(STRICT)
  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.auth.register(body);
  }

  @Throttle(STRICT)
  @Post('verify-otp')
  verifyOtp(@Body() body: VerifyOtpDto) {
    return this.auth.verifyOtp(body);
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('login')
  login(@Body() body: LoginDto) {
    return this.auth.login(body);
  }

  @UseGuards(AuthGuard)
  @Get('me')
  me(@CurrentUser() user: JwtUser) {
    return { ...user, isAdmin: isAdmin(user.email) };
  }
}
