import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { isValidTimeZone } from '../common/time';

@ValidatorConstraint({ name: 'ianaTimeZone' })
class IanaTimeZone implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return isValidTimeZone(value);
  }
  defaultMessage() {
    return 'timeZone must be an IANA time zone, e.g. Asia/Jakarta';
  }
}

export class RegisterDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  /** Browser's IANA zone (Intl.DateTimeFormat().resolvedOptions().timeZone) */
  @IsOptional()
  @Validate(IanaTimeZone)
  timeZone?: string;
}

export class VerifyOtpDto {
  @IsEmail()
  email: string;

  @Matches(/^\d{6}$/, { message: 'otpCode must be 6 digits' })
  otpCode: string;
}

/** Re-entering the password of the signed-in user (e.g. to show hidden amounts on the dashboard). */
export class VerifyPasswordDto {
  @IsString()
  @MaxLength(128)
  password: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MaxLength(128)
  password: string;

  /** Browser's IANA zone; kept up to date so day/month boundaries follow the user */
  @IsOptional()
  @Validate(IanaTimeZone)
  timeZone?: string;
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
