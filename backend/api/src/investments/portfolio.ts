/** Rules shared by the Investasi page: asset types, units, and buy/sell math. */

export const ASSET_TYPES = ['IDX_STOCK', 'US_STOCK', 'CRYPTO'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const CURRENCIES = ['IDR', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const TRADE_SIDES = ['BUY', 'SELL'] as const;
export type TradeSide = (typeof TRADE_SIDES)[number];

/** IDX stocks are bought in lots: 1 lot = 100 shares. */
export const LOT_SIZE = 100;

/** Shares/units per unit of `quantity`: 100 for IDX stocks (lots), 1 otherwise. */
export const unitsPerQuantity = (type: string) => (type === 'IDX_STOCK' ? LOT_SIZE : 1);

/** Up to 10 decimals, the precision of the database columns. Removes float noise like 0.30000000000000004. */
export const round10 = (n: number) => Math.round(n * 1e10) / 1e10;

/** Treats amounts this small as zero, so selling "everything" leaves exactly 0. */
const EPSILON = 1e-9;

/** User input -> the symbol stored: upper case, no spaces, no ".JK" suffix for IDX stocks. */
export function normalizeSymbol(type: AssetType, symbol: string) {
  const s = symbol.trim().toUpperCase().replace(/\s+/g, '');
  return type === 'IDX_STOCK' ? s.replace(/\.JK$/, '') : s;
}

/** A buy: the new average price is weighted by quantity. */
export function applyBuy(quantity: number, avgPrice: number, buyQuantity: number, buyPrice: number) {
  const total = quantity + buyQuantity;
  return {
    quantity: round10(total),
    avgPrice: round10(total > 0 ? (quantity * avgPrice + buyQuantity * buyPrice) / total : buyPrice),
  };
}

export class SellTooLargeError extends Error {}

/** A sell keeps the average price and realizes (price - average) for the shares sold. */
export function applySell(type: string, quantity: number, avgPrice: number, sellQuantity: number, sellPrice: number) {
  if (sellQuantity > quantity + EPSILON) throw new SellTooLargeError();
  const left = quantity - sellQuantity;
  return {
    quantity: left < EPSILON ? 0 : round10(left),
    avgPrice,
    realizedPnl: round10((sellPrice - avgPrice) * sellQuantity * unitsPerQuantity(type)),
  };
}

/** Key of the USD/IDR rate in the price cache and the MarketPrice table */
export const FX_KEY = 'FX:USDIDR';
