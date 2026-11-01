import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '../common/auth.guard';
import type { JwtUser } from '../common/config';
import { CurrentUser } from '../common/current-user.decorator';
import { ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto, VerifyOtpDto } from './auth.dto';
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

  @Throttle(STRICT)
  @Post('forgot-password')
  forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.auth.forgotPassword(body);
  }

  @Throttle(STRICT)
  @Post('reset-password')
  resetPassword(@Body() body: ResetPasswordDto) {
    return this.auth.resetPassword(body);
  }

  @UseGuards(AuthGuard)
  @Get('me')
  me(@CurrentUser() user: JwtUser) {
    return this.auth.profile(user.id);
  }
}
