import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class UpsertBudgetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  categoryName: string;

  @IsInt({ message: "$property must be a whole number of rupiah" })
  @Min(0)
  @Max(1e12)
  limit: number;
}
