import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
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
/** Largest amount accepted anywhere (Rp 1 triliun); also keeps values within BIGINT and safe JS integers. */
export const MAX_AMOUNT = 1e12;
/**
 * Lending and debt: paying for a friend ("talangin"), the friend paying it back, borrowing or
 * repaying a loan. It moves real money, so balances change, but it is not real income or spending,
 * so it is left out of the income/expense totals, the category charts and the budgets.
 */
export const DEBT_CATEGORY = 'DEBT';

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

  @IsInt({ message: "$property must be a whole number of rupiah" })
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
  @IsInt({ message: "$property must be a whole number of rupiah" })
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
