import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { normalizePhone } from '../common/phone';

export class RegisterDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  // Accepts 0812..., +62 812..., 62812... and stores the canonical 62xxxxxxxxxx form
  @Transform(({ value }) => (typeof value === 'string' ? normalizePhone(value) : value))
  @Matches(/^62\d{8,13}$/, { message: 'phoneNumber must be a valid Indonesian number, e.g. 0812xxxxxxxx' })
  phoneNumber: string;
}

export class VerifyOtpDto {
  @IsEmail()
  email: string;

  /** Code sent by email (proves the email address). */
  @Matches(/^\d{6}$/, { message: 'otpCode must be 6 digits' })
  otpCode: string;

  /** Code sent by the WhatsApp bot (proves ownership of the phone number). */
  @Matches(/^\d{6}$/, { message: 'phoneCode must be 6 digits' })
  phoneCode: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MaxLength(128)
  password: string;
}
