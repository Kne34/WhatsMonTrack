/** Investasi page: types, units and valuation. Mirrors backend/api/src/investments/portfolio.ts. */

export type AssetType = "IDX_STOCK" | "US_STOCK" | "CRYPTO";
export type Currency = "IDR" | "USD";
export type TradeSide = "BUY" | "SELL";

export const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  IDX_STOCK: "Saham Indonesia",
  US_STOCK: "Saham US",
  CRYPTO: "Crypto",
};
/** Filter buttons: they must fit a 320px phone side by side */
export const ASSET_TYPE_BUTTON: Record<AssetType, string> = { IDX_STOCK: "IDX", US_STOCK: "US", CRYPTO: "Crypto" };
export const ASSET_TYPES = Object.keys(ASSET_TYPE_LABEL) as AssetType[];

/** Suggestions for the platform field; any name can be typed */
export const PLATFORM_SUGGESTIONS = ["Stockbit", "Pluang", "Bibit", "Ajaib", "IPOT", "Indodax", "Pintu", "Tokocrypto", "Gotrade"];

/** IDX stocks are counted in lots: 1 lot = 100 shares */
export const LOT_SIZE = 100;
export const unitsPerQuantity = (type: AssetType) => (type === "IDX_STOCK" ? LOT_SIZE : 1);
export const quantityUnit = (type: AssetType) => (type === "IDX_STOCK" ? "lot" : type === "CRYPTO" ? "koin" : "lembar");

export interface Holding {
  id: string;
  assetType: AssetType;
  symbol: string;
  name: string | null;
  coingeckoId: string | null;
  platform: string;
  currency: Currency;
  /** Lots for IDX stocks, units otherwise */
  quantity: number;
  /** Per share/unit, in `currency` */
  avgPrice: number;
  note: string | null;
  /** Key into MarketPrices.prices */
  priceKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface Trade {
  id: string;
  side: TradeSide;
  quantity: number;
  price: number;
  realizedPnl: number | null;
  note: string | null;
  tradedAt: string;
}

export interface Quote {
  price: number;
  currency: string;
  priceIdr?: number | null;
  /** Change since the previous close (stocks) or over 24 hours (crypto), in percent */
  changePct?: number | null;
  name?: string | null;
  updatedAt: string;
  /** The live source failed; this is the last known price */
  stale: boolean;
}

export interface MarketPrices {
  prices: Record<string, Quote | null>;
  /** USD -> IDR */
  fx: Quote | null;
  /** Price sources the server could not reach just now, by name */
  unreachable?: string[];
  fetchedAt: string;
}

/** Bar intervals of the chart page, as on TradingView */
export type ChartInterval = "5m" | "15m" | "1h" | "4h" | "1D" | "1W" | "1M";
export interface Candle { time: number; open: number; high: number; low: number; close: number; volume: number }
export interface PriceHistory {
  /** Currency of the candles: IDR or USD (crypto charts are in USD) */
  currency: string;
  candles: Candle[];
  /** Where the data came from; null when no source had it */
  source: string | null;
}

/** Facts about an asset for the chart page (GET /investments/:id/profile); prices in `currency` */
export interface AssetProfile {
  name: string | null;
  exchange: string | null;
  currency: string;
  market: "OPEN" | "CLOSED" | "ALWAYS" | null;
  session: { start: number; end: number; timezone: string } | null;
  previousClose: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  turnover: number | null;
  yearHigh: number | null;
  yearLow: number | null;
  marketCap: number | null;
  rank: number | null;
  circulatingSupply: number | null;
  maxSupply: number | null;
  allTimeHigh: number | null;
  allTimeHighDate: string | null;
  description: string | null;
  homepage: string | null;
  categories: string[];
  sources: string[];
}

/** The total market value in rupiah of everything still held (counted in "Saldo total"); null while unknown. */
export function portfolioValueIdr(holdings: Holding[] | null, prices: MarketPrices | null): number | null {
  if (!holdings) return null;
  return holdings.filter((h) => h.quantity > 0).reduce((sum, h) => sum + (valuate(h, prices).valueIdr ?? 0), 0);
}

/** The current price per share/unit in the holding's own currency, or null if unknown. */
export function currentPrice(h: Holding, quote: Quote | null | undefined, fx: number | null): number | null {
  if (!quote) return null;
  if (h.currency === "IDR" && quote.priceIdr) return quote.priceIdr;
  if (quote.currency === h.currency) return quote.price;
  if (!fx) return null;
  return quote.currency === "USD" ? quote.price * fx : quote.price / fx;
}

export interface Valuation {
  /** Shares/units held (lots x 100 for IDX) */
  units: number;
  /** Live price, or the average buy price while no price is known (see `hasPrice`) */
  price: number;
  hasPrice: boolean;
  stale: boolean;
  /** In the holding's currency */
  cost: number;
  value: number;
  pnl: number;
  /** Converted to rupiah; null when a USD holding meets an unknown exchange rate */
  costIdr: number | null;
  valueIdr: number | null;
  pnlIdr: number | null;
  /** null when nothing was paid (e.g. an airdrop) */
  pnlPct: number | null;
}

export function valuate(h: Holding, prices: MarketPrices | null): Valuation {
  const fx = prices?.fx?.price ?? null;
  const quote = prices?.prices[h.priceKey];
  const live = currentPrice(h, quote, fx);
  const price = live ?? h.avgPrice;
  const units = h.quantity * unitsPerQuantity(h.assetType);
  const cost = units * h.avgPrice;
  const value = units * price;
  const toIdr = (v: number) => (h.currency === "IDR" ? v : fx ? v * fx : null);
  const costIdr = toIdr(cost);
  const valueIdr = toIdr(value);
  return {
    units,
    price,
    hasPrice: live != null,
    stale: !!quote?.stale,
    cost,
    value,
    pnl: value - cost,
    costIdr,
    valueIdr,
    pnlIdr: costIdr != null && valueIdr != null ? valueIdr - costIdr : null,
    pnlPct: cost > 0 ? ((value - cost) / cost) * 100 : null,
  };
}

/** Average price after a buy (weighted by quantity), as the server computes it. */
export const avgAfterBuy = (quantity: number, avgPrice: number, buyQuantity: number, buyPrice: number) =>
  quantity + buyQuantity > 0 ? (quantity * avgPrice + buyQuantity * buyPrice) / (quantity + buyQuantity) : buyPrice;

/** "0,025" or "0.025" -> 0.025; NaN when not a number */
export function parseDecimal(text: string) {
  const t = text.trim().replace(/\s/g, "");
  if (!t) return NaN;
  // "1.234,5" (Indonesian) -> 1234.5; "1,234.5" (English) -> 1234.5; "0,025" -> 0.025
  const lastComma = t.lastIndexOf(",");
  const lastDot = t.lastIndexOf(".");
  let normalized = t;
  if (lastComma > -1 && lastDot > -1) {
    normalized = lastComma > lastDot ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (lastComma > -1) {
    normalized = t.replace(",", ".");
  } else if ((t.match(/\./g) ?? []).length > 1) {
    normalized = t.replace(/\./g, ""); // 1.234.567
  }
  return /^-?\d*\.?\d+$/.test(normalized) ? Number(normalized) : NaN;
}

const number = (max: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: max });
const usd = new Intl.NumberFormat("id-ID", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usdSmall = new Intl.NumberFormat("id-ID", { style: "currency", currency: "USD", maximumSignificantDigits: 4 });
const idr = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const idrSmall = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 2 });

/** Money in IDR or USD; small prices (below 1, e.g. some coins) keep their decimals. */
export function formatMoney(value: number, currency: Currency | string) {
  const small = Math.abs(value) > 0 && Math.abs(value) < 1;
  if (currency === "USD") return (small ? usdSmall : usd).format(value);
  return (small ? idrSmall : idr).format(value);
}

/** 0,025 or 1.250 */
export const formatQuantity = (value: number) => number(8).format(value);

/** +12,3% / −4,5% */
export function formatPercent(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "–";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${number(2).format(Math.abs(value))}%`;
}

/** A signed amount: +Rp 1.000 / −Rp 1.000 */
export function formatSigned(value: number, currency: Currency | string) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatMoney(Math.abs(value), currency)}`;
}
