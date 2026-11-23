import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsPositive, IsString, IsUUID, Max, MaxLength,
  Min, MinLength, ValidateIf, ValidateNested,
} from 'class-validator';
import { SPENDING_CATEGORIES } from '../common/categories';
import { MAX_AMOUNT } from '../transactions/transactions.dto';

export const DEBT_TYPES = ['RECEIVABLE', 'PAYABLE'] as const;
export type DebtType = (typeof DEBT_TYPES)[number];
export const DEBT_STATUSES = ['OPEN', 'SETTLED'] as const;
export type DebtStatus = (typeof DEBT_STATUSES)[number];

const RUPIAH = { message: '$property must be a whole number of rupiah' };
const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

export class ParticipantInputDto {
  /** Existing participant (when editing); omitted for a new one */
  @IsOptional() @IsUUID()
  id?: string;

  @IsString() @MinLength(1) @MaxLength(60)
  personName: string;

  /** Their expected share; 0 when not fixed */
  @IsOptional() @IsInt(RUPIAH) @Min(0) @Max(MAX_AMOUNT)
  expectedAmount?: number;
}

export class CreateDebtDto {
  @IsString() @MinLength(1) @MaxLength(100)
  title: string;

  @IsIn(DEBT_TYPES)
  type: DebtType;

  @IsInt(RUPIAH) @IsPositive() @Max(MAX_AMOUNT)
  totalAmount: number;

  /** Regular spending category for the expense recorded when settling */
  @Transform(upper) @IsIn(SPENDING_CATEGORIES)
  category: string;

  /** Required for a talangan (RECEIVABLE) and for a PAYABLE with addToBalance */
  @ValidateIf((o: CreateDebtDto) => o.accountId != null) @IsUUID()
  accountId?: string | null;

  /** PAYABLE: the borrowed money came into accountId */
  @IsOptional() @IsBoolean()
  addToBalance?: boolean;

  /** PAYABLE: record what I paid as an expense when settling (default: yes, unless it was a cash loan) */
  @IsOptional() @IsBoolean()
  recordExpense?: boolean;

  @IsOptional() @IsDateString()
  date?: string;

  @IsOptional() @IsString() @MaxLength(300)
  notes?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => ParticipantInputDto)
  participants?: ParticipantInputDto[];
}

/** Editing an OPEN record. The type cannot change. `participants` replaces the whole list. */
export class UpdateDebtDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100)
  title?: string;

  @IsOptional() @IsInt(RUPIAH) @IsPositive() @Max(MAX_AMOUNT)
  totalAmount?: number;

  @IsOptional() @Transform(upper) @IsIn(SPENDING_CATEGORIES)
  category?: string;

  @ValidateIf((o: UpdateDebtDto) => o.accountId != null) @IsUUID()
  accountId?: string | null;

  @IsOptional() @IsBoolean()
  addToBalance?: boolean;

  @IsOptional() @IsBoolean()
  recordExpense?: boolean;

  @IsOptional() @IsDateString()
  date?: string;

  @IsOptional() @IsString() @MaxLength(300)
  notes?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => ParticipantInputDto)
  participants?: ParticipantInputDto[];
}

/** Ticking a person: what they actually paid, into/from which account, and when */
export class PayDto {
  @IsInt(RUPIAH) @IsPositive() @Max(MAX_AMOUNT)
  amount: number;

  @IsUUID()
  accountId: string;

  @IsOptional() @IsDateString()
  paidAt?: string;
}

export class SettleDto {
  /** RECEIVABLE paid more than the total: record the excess as income (report only) */
  @IsOptional() @IsBoolean()
  recordExcessAsIncome?: boolean;

  /** PAYABLE: overrides the record's recordExpense */
  @IsOptional() @IsBoolean()
  recordExpense?: boolean;
}

export class DebtsQueryDto {
  @IsOptional() @IsIn(DEBT_STATUSES)
  status?: DebtStatus;

  @IsOptional() @IsIn(DEBT_TYPES)
  type?: DebtType;

  /** Title or a person's name */
  @IsOptional() @IsString() @MaxLength(100)
  q?: string;
}
