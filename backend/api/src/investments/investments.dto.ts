import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsPositive, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { CHART_RANGES, type ChartRange } from './market.service';
import { ASSET_TYPES, CURRENCIES, TRADE_SIDES, type AssetType, type Currency, type TradeSide } from './portfolio';

/** Far above any real holding; keeps values inside the DECIMAL(30,10) columns */
const MAX_NUMBER = 1e15;
const DECIMALS = { maxDecimalPlaces: 10 };

export class CreateInvestmentDto {
  @IsIn(ASSET_TYPES)
  assetType: AssetType;

  /** BBCA, AAPL, BTC. IDX stocks without ".JK" (it is added when fetching prices). */
  @IsString() @MinLength(1) @MaxLength(20)
  @Matches(/^[A-Za-z0-9.\-^=\s]+$/, { message: 'Ticker hanya boleh huruf, angka, titik, dan tanda minus.' })
  symbol: string;

  @IsOptional() @IsString() @MaxLength(100)
  name?: string;

  /** Crypto: the CoinGecko id (e.g. "bitcoin"). Found automatically from the ticker when empty. */
  @IsOptional() @IsString() @MaxLength(100) @Matches(/^[a-z0-9-]+$/, { message: 'ID CoinGecko hanya huruf kecil, angka, dan tanda minus.' })
  coingeckoId?: string;

  @IsString() @MinLength(1) @MaxLength(40)
  platform: string;

  /** Currency of the buy price; IDX stocks are always IDR */
  @IsOptional() @IsIn(CURRENCIES)
  currency?: Currency;

  /** Lots for IDX stocks, units (fractions allowed) otherwise */
  @IsNumber(DECIMALS) @IsPositive() @Max(MAX_NUMBER)
  quantity: number;

  /** Average buy price per share/unit */
  @IsNumber(DECIMALS) @Min(0) @Max(MAX_NUMBER)
  avgPrice: number;

  @IsOptional() @IsString() @MaxLength(200)
  note?: string;

  /** Date of the first buy (defaults to now) */
  @IsOptional() @IsDateString()
  boughtAt?: string;
}

/** Corrections; buys and sells go through trades. The asset itself (type, ticker) can't change. */
export class UpdateInvestmentDto {
  @IsOptional() @IsString() @MaxLength(100)
  name?: string;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(40)
  platform?: string;

  @IsOptional() @IsIn(CURRENCIES)
  currency?: Currency;

  @IsOptional() @IsNumber(DECIMALS) @Min(0) @Max(MAX_NUMBER)
  quantity?: number;

  @IsOptional() @IsNumber(DECIMALS) @Min(0) @Max(MAX_NUMBER)
  avgPrice?: number;

  @IsOptional() @IsString() @MaxLength(100) @Matches(/^[a-z0-9-]+$/, { message: 'ID CoinGecko hanya huruf kecil, angka, dan tanda minus.' })
  coingeckoId?: string;

  @IsOptional() @IsString() @MaxLength(200)
  note?: string;
}

export class CreateTradeDto {
  @IsIn(TRADE_SIDES)
  side: TradeSide;

  /** Same unit as the holding: lots for IDX stocks */
  @IsNumber(DECIMALS) @IsPositive() @Max(MAX_NUMBER)
  quantity: number;

  /** Price per share/unit, in the holding's currency */
  @IsNumber(DECIMALS) @Min(0) @Max(MAX_NUMBER)
  price: number;

  @IsOptional() @IsDateString()
  tradedAt?: string;

  @IsOptional() @IsString() @MaxLength(200)
  note?: string;
}

export class ChartQueryDto {
  @IsOptional()
  @IsIn(CHART_RANGES)
  range?: ChartRange;
}
