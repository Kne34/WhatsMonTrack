import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export const TX_TYPES = ['EXPENSE', 'INCOME', 'TRANSFER'] as const;
export type TxType = (typeof TX_TYPES)[number];
const MAX_AMOUNT = 1e12;

export class TransactionsQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(31)
  day?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12)
  month?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100)
  year?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  // Dashboard's monthly summary fetches up to 1000
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000)
  limit?: number;
}

export class CreateTransactionDataDto {
  @IsIn(TX_TYPES)
  type: TxType;

  @IsNumber()
  @IsPositive()
  @Max(MAX_AMOUNT)
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  subcategory?: string;

  @ValidateIf((o) => o.fromAccountId !== null && o.fromAccountId !== undefined)
  @IsUUID()
  fromAccountId?: string | null;

  @ValidateIf((o) => o.toAccountId !== null && o.toAccountId !== undefined)
  @IsUUID()
  toAccountId?: string | null;

  @IsOptional()
  @IsDateString()
  createdAt?: string;
}

/** POST /api/transactions/manual wraps the payload in { data } */
export class CreateTransactionDto {
  @ValidateNested()
  @Type(() => CreateTransactionDataDto)
  data: CreateTransactionDataDto;
}

export class UpdateTransactionDto {
  @IsOptional()
  @IsIn(TX_TYPES)
  type?: TxType;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(MAX_AMOUNT)
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  subcategory?: string;

  @ValidateIf((o) => o.fromAccountId !== null && o.fromAccountId !== undefined)
  @IsUUID()
  fromAccountId?: string | null;

  @ValidateIf((o) => o.toAccountId !== null && o.toAccountId !== undefined)
  @IsUUID()
  toAccountId?: string | null;

  // Frontend may send '' when the date is untouched
  @ValidateIf((o) => !!o.createdAt)
  @IsDateString()
  createdAt?: string;
}
