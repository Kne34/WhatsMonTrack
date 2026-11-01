import { IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

const MAX_AMOUNT = 1e12;

export class CreateAccountDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  type?: string;

  @IsOptional()
  @IsNumber()
  @Min(-MAX_AMOUNT)
  @Max(MAX_AMOUNT)
  initialBalance?: number;
}

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(-MAX_AMOUNT)
  @Max(MAX_AMOUNT)
  balance?: number;
}
