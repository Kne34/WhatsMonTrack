import { IsBoolean, IsIn, IsInt, IsOptional, IsPositive, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { MAX_AMOUNT } from '../transactions/transactions.dto';

export const DEBT_DIRECTIONS = ['THEY_OWE', 'I_OWE'] as const;
export type DebtDirection = (typeof DEBT_DIRECTIONS)[number];

const RUPIAH = { message: '$property must be a whole number of rupiah' };

export class CreateDebtNoteDto {
  @IsString() @MinLength(1) @MaxLength(60)
  person: string;

  /** THEY_OWE: the person owes the user. I_OWE: the user owes the person. */
  @IsIn(DEBT_DIRECTIONS)
  direction: DebtDirection;

  @IsInt(RUPIAH) @IsPositive() @Max(MAX_AMOUNT)
  amount: number;

  @IsOptional() @IsInt(RUPIAH) @Min(0) @Max(MAX_AMOUNT)
  paid?: number;

  @IsOptional() @IsString() @MaxLength(200)
  note?: string;
}

export class UpdateDebtNoteDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60)
  person?: string;

  @IsOptional() @IsIn(DEBT_DIRECTIONS)
  direction?: DebtDirection;

  @IsOptional() @IsInt(RUPIAH) @IsPositive() @Max(MAX_AMOUNT)
  amount?: number;

  @IsOptional() @IsInt(RUPIAH) @Min(0) @Max(MAX_AMOUNT)
  paid?: number;

  @IsOptional() @IsString() @MaxLength(200)
  note?: string;

  /** The checkbox: true = paid in full, false = nothing paid yet */
  @IsOptional() @IsBoolean()
  settled?: boolean;
}
