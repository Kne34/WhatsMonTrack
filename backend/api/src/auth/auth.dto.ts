import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}

export class VerifyOtpDto {
  @IsEmail()
  email: string;

  @Matches(/^\d{6}$/, { message: 'otpCode must be 6 digits' })
  otpCode: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MaxLength(128)
  password: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsEmail()
  email: string;

  @Matches(/^\d{6}$/, { message: 'otpCode must be 6 digits' })
  otpCode: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
