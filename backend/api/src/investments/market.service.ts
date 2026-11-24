import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { FX_KEY, type AssetType } from './portfolio';

/** A price as served to the dashboard. `stale`: the live source failed, this is the last known price. */
export interface Quote {
  price: number;
  /** Currency of `price`: IDR (IDX stocks, the exchange rate) or USD (US stocks, crypto) */
  currency: string;
  /** Crypto from CoinGecko only: the IDR price, so IDR holdings need no conversion */
  priceIdr?: number | null;
  /** Change since the previous close (stocks) or over 24 hours (crypto), in percent */
  changePct?: number | null;
  name?: string | null;
  updatedAt: string;
  stale: boolean;
}

/** What the API needs to fetch one price. */
export type PriceSource =
  | { key: string; yahoo: string }
  | { key: string; crypto: { symbol: string; coingecko: string | null } };

export class SymbolNotFoundError extends Error {}

/** Bar intervals of the chart, as on TradingView: minutes, hours, day, week, month */
export const CHART_INTERVALS = ['5m', '15m', '1h', '4h', '1D', '1W', '1M'] as const;
export type ChartInterval = (typeof CHART_INTERVALS)[number];

export interface Candle {
  /** Unix seconds (UTC) */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
export interface Chart {
  currency: string;
  candles: Candle[];
  source: string;
}

/** Facts about an asset for the chart page's side panel. Every field may be null when the source doesn't give it. */
export interface AssetProfile {
  name: string | null;
  /** e.g. "Jakarta", "NasdaqGS", "Binance" */
  exchange: string | null;
  currency: string;
  /** OPEN or CLOSED for stocks (regular session), ALWAYS for crypto; null when unknown */
  market: 'OPEN' | 'CLOSED' | 'ALWAYS' | null;
  /** Today's (or the next) regular session, Unix seconds */
  session: { start: number; end: number; timezone: string } | null;
  previousClose: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  /** In shares/coins */
  volume: number | null;
  /** 24-hour turnover in USD (crypto) */
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

const YAHOO = 'https://query1.finance.yahoo.com/v8/finance';
const COINGECKO = 'https://api.coingecko.com/api/v3';
const BINANCE = 'https://api.binance.com/api/v3';
/** Yahoo answers browsers only */
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; WhatsMonTrack)', Accept: 'application/json' };

export const PROVIDERS = { yahoo: 'Yahoo Finance', binance: 'Binance', coingecko: 'CoinGecko' } as const;
type Provider = keyof typeof PROVIDERS;

/** The page asks every few seconds; whoever asks, a price is fetched at most once per TTL (prices are the same for every user). */
export const PRICE_TTL_MS = 10_000;
/** After a failed fetch the source is left alone this long (the last known price is served meanwhile). */
const RETRY_AFTER_FAIL_MS = 30_000;
/** A provider that failed this recently is reported as unreachable */
const DOWN_FOR_MS = 2 * 60_000;
const TIMEOUT_MS = 8_000;
/** Yahoo's spark endpoint takes at most 20 symbols per request */
const SPARK_BATCH = 20;
/** Binance's list of trading pairs changes rarely */
const PAIRS_TTL_MS = 6 * 60 * 60_000;

/**
 * How much history each interval loads (the chart scrolls back through all of it). Yahoo keeps
 * 5/15-minute bars for 60 days and hourly bars for 2 years; it has no 4-hour bars, so those are
 * built from hourly ones.
 */
const CHART_YAHOO: Record<ChartInterval, { range: string; interval: string; group?: number }> = {
  '5m': { range: '1mo', interval: '5m' },
  '15m': { range: '1mo', interval: '15m' },
  '1h': { range: '6mo', interval: '60m' },
  '4h': { range: '1y', interval: '60m', group: 4 * 3600 },
  '1D': { range: '10y', interval: '1d' },
  // range=max turns weekly bars into monthly ones
  '1W': { range: '20y', interval: '1wk' },
  '1M': { range: 'max', interval: '1mo' },
};
/** Binance gives at most 1000 bars per request */
const CHART_BINANCE: Record<ChartInterval, string> = { '5m': '5m', '15m': '15m', '1h': '1h', '4h': '4h', '1D': '1d', '1W': '1w', '1M': '1M' };
const BINANCE_LIMIT = 1000;
/** Intraday charts move; daily and longer barely do */
const chartTtl = (interval: ChartInterval) => (interval.endsWith('m') || interval.endsWith('h') ? 30_000 : 5 * 60_000);
const PROFILE_TTL_MS = 60_000;
/** CoinGecko's free tier is rate limited; market cap and supply change slowly */
const COIN_INFO_TTL_MS = 60 * 60_000;

/** Where an asset's price comes from: IDX gets the ".JK" suffix on Yahoo; crypto tries Binance, then CoinGecko, then Yahoo. */
export function sourceFor(type: string, symbol: string, coingeckoId?: string | null): PriceSource {
  if (type === 'CRYPTO') return { key: `CRYPTO:${coingeckoId || symbol.toLowerCase()}`, crypto: { symbol: symbol.toUpperCase(), coingecko: coingeckoId || null } };
  if (type === 'IDX_STOCK') return { key: `IDX:${symbol}`, yahoo: `${symbol}.JK` };
  return { key: `US:${symbol}`, yahoo: symbol };
}

export const FX_SOURCE: PriceSource = { key: FX_KEY, yahoo: 'USDIDR=X' };

type Fetched = Omit<Quote, 'stale' | 'updatedAt'>;
type YahooSource = { key: string; yahoo: string };
type CryptoSource = { key: string; crypto: { symbol: string; coingecko: string | null } };

/** The parts of the external responses that are used */
interface YahooChart {
  chart?: {
    result?: {
      meta?: YahooMeta;
      timestamp?: number[];
      indicators?: { quote?: { open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }[] };
    }[];
  };
}
interface YahooMeta {
  regularMarketPrice?: number;
  currency?: string;
  longName?: string;
  shortName?: string;
  fullExchangeName?: string;
  exchangeName?: string;
  chartPreviousClose?: number;
  previousClose?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  timezone?: string;
  currentTradingPeriod?: { regular?: { start?: number; end?: number; timezone?: string } };
}
type YahooSpark = Record<string, { close?: (number | null)[]; fulldayPrice?: number; previousClose?: number | null; chartPreviousClose?: number } | undefined>;
interface CoinGeckoSearch {
  coins?: { id: string; symbol: string; name: string; market_cap_rank: number | null }[];
}
type CoinGeckoPrices = Record<string, { usd?: number; idr?: number; usd_24h_change?: number } | undefined>;
type BinanceMini = { symbol: string; lastPrice: string; openPrice: string }[];
type BinanceTicker = { lastPrice: string; prevClosePrice: string; highPrice: string; lowPrice: string; volume: string; quoteVolume: string };
interface CoinGeckoCoin {
  name?: string;
  market_cap_rank?: number | null;
  categories?: (string | null)[];
  description?: { en?: string };
  links?: { homepage?: string[] };
  market_data?: {
    market_cap?: { usd?: number };
    circulating_supply?: number | null;
    max_supply?: number | null;
    ath?: { usd?: number };
    ath_date?: { usd?: string };
  };
}
type CoinInfo = Pick<AssetProfile, 'name' | 'marketCap' | 'rank' | 'circulatingSupply' | 'maxSupply' | 'allTimeHigh' | 'allTimeHighDate' | 'description' | 'homepage' | 'categories'>;
type BinanceKline = [number, string, string, string, string, string, ...unknown[]];

/**
 * Live prices for the Investasi page, fetched by the API (the browser has no CORS problem and
 * the sources see one cached client):
 * - IDX and US stocks and USD/IDR: Yahoo Finance, many symbols per request
 * - crypto: Binance (USDT pairs), then CoinGecko, then Yahoo ("BTC-USD") for coins Binance doesn't list
 * Cache: memory (TTL 10 s) backed by the MarketPrice table. When a source fails or times out,
 * the last known price is served with `stale: true` instead of an error.
 */
@Injectable()
export class MarketService {
  private readonly log = new Logger(MarketService.name);
  private readonly cache = new Map<string, { quote: Quote; at: number }>();
  private readonly failedAt = new Map<string, number>();
  private readonly downAt = new Map<Provider, number>();
  /** Concurrent requests for the same prices share one fetch */
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly charts = new Map<string, { chart: Chart; at: number }>();
  private readonly profiles = new Map<string, { profile: AssetProfile; at: number }>();
  private readonly coins = new Map<string, { info: CoinInfo | null; at: number }>();
  private binancePairs: { pairs: Set<string>; at: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Prices for these sources plus the USD/IDR rate. Never throws: unknown prices are null. */
  async quotes(sources: PriceSource[]): Promise<{ prices: Record<string, Quote | null>; fx: Quote | null; unreachable: string[] }> {
    const all = dedupe([...sources, FX_SOURCE]);
    const now = Date.now();
    const due = all.filter((s) => {
      const hit = this.cache.get(s.key);
      if (hit && now - hit.at < PRICE_TTL_MS) return false;
      const failed = this.failedAt.get(s.key);
      return !(failed && now - failed < RETRY_AFTER_FAIL_MS);
    });

    if (due.length) {
      const id = due.map((s) => s.key).sort().join(',');
      await this.once(id, () => this.refresh(due));
    }

    // Anything not in memory: the last price in the database, marked stale
    const missing = all.filter((s) => !this.cache.has(s.key)).map((s) => s.key);
    const stored = missing.length ? await this.prisma.marketPrice.findMany({ where: { key: { in: missing } } }).catch(() => []) : [];
    const fromDb = new Map(stored.map((r) => [r.key, r]));

    const prices: Record<string, Quote | null> = {};
    for (const s of all) {
      const hit = this.cache.get(s.key);
      if (hit) {
        const failed = this.failedAt.get(s.key);
        prices[s.key] = (failed && failed > hit.at) || Date.now() - hit.at > PRICE_TTL_MS * 6 ? { ...hit.quote, stale: true } : hit.quote;
        continue;
      }
      const row = fromDb.get(s.key);
      prices[s.key] = row
        ? {
            price: Number(row.price),
            currency: row.currency,
            priceIdr: row.priceIdr == null ? null : Number(row.priceIdr),
            changePct: null,
            name: row.name,
            updatedAt: row.updatedAt.toISOString(),
            stale: true,
          }
        : null;
    }
    const fx = prices[FX_KEY];
    delete prices[FX_KEY];
    return { prices, fx, unreachable: this.unreachable() };
  }

  /** Price history for the chart. null when no source has it. */
  async chart(source: PriceSource, interval: ChartInterval): Promise<Chart | null> {
    const id = `${source.key}:${interval}`;
    const hit = this.charts.get(id);
    if (hit && Date.now() - hit.at < chartTtl(interval)) return hit.chart;
    const chart = (await this.once(`chart:${id}`, () => this.fetchChart(source, interval))) as Chart | null;
    if (chart) this.charts.set(id, { chart, at: Date.now() });
    // A failed fetch keeps showing the previous chart
    return chart ?? hit?.chart ?? null;
  }

  /** Day range, 52-week range, volume, session; for crypto also market cap and supply (CoinGecko). Never throws. */
  async profile(source: PriceSource): Promise<AssetProfile> {
    const hit = this.profiles.get(source.key);
    if (hit && Date.now() - hit.at < PROFILE_TTL_MS) return hit.profile;
    const profile = (await this.once(`profile:${source.key}`, () => this.fetchProfile(source))) as AssetProfile;
    if (profile.sources.length) this.profiles.set(source.key, { profile, at: Date.now() });
    return profile.sources.length || !hit ? profile : hit.profile;
  }

  /**
   * Checks that a ticker exists and finds its name (and the CoinGecko id for crypto).
   * Throws SymbolNotFoundError when the source says it doesn't exist; returns null when the
   * source can't be reached (the holding is saved anyway, the price shows up later).
   */
  async lookup(type: AssetType, symbol: string): Promise<{ name: string | null; coingeckoId?: string } | null> {
    if (type === 'CRYPTO') {
      const res = await this.get<CoinGeckoSearch>('coingecko', `${COINGECKO}/search?query=${encodeURIComponent(symbol)}`);
      if (!res) return null;
      const coins = res.coins ?? [];
      const match = coins
        .filter((c) => c.symbol?.toUpperCase() === symbol)
        .sort((a, b) => (a.market_cap_rank ?? Infinity) - (b.market_cap_rank ?? Infinity))[0];
      if (!match) throw new SymbolNotFoundError();
      return { name: match.name, coingeckoId: match.id };
    }
    const source = sourceFor(type, symbol) as YahooSource;
    const meta = await this.fetchYahooMeta(source.yahoo);
    return meta ? { name: meta.name } : null;
  }

  // ---------------------------------------------------------------- prices

  private async refresh(due: PriceSource[]) {
    const yahoo = due.filter((s): s is YahooSource => 'yahoo' in s);
    const crypto = due.filter((s): s is CryptoSource => 'crypto' in s);
    const fetched = new Map<string, Fetched>();
    await Promise.all([this.fetchYahooQuotes(yahoo, fetched), this.fetchCrypto(crypto, fetched)]);

    const saved = new Date().toISOString();
    for (const s of due) {
      const f = fetched.get(s.key);
      if (f) {
        this.cache.set(s.key, { quote: { ...f, updatedAt: saved, stale: false }, at: Date.now() });
        this.failedAt.delete(s.key);
        this.persist(s.key, f).catch((e) => this.log.warn(`saving ${s.key} failed: ${e}`));
      } else {
        this.failedAt.set(s.key, Date.now());
      }
    }
  }

  /** Yahoo's spark endpoint: up to 20 symbols per request, with the previous close for the day change */
  private async fetchYahooQuotes(sources: YahooSource[], out: Map<string, Fetched>) {
    const batches: YahooSource[][] = [];
    for (let i = 0; i < sources.length; i += SPARK_BATCH) batches.push(sources.slice(i, i + SPARK_BATCH));
    await Promise.all(
      batches.map(async (batch) => {
        const symbols = batch.map((s) => s.yahoo).join(',');
        const data = await this.get<YahooSpark>('yahoo', `${YAHOO}/spark?symbols=${encodeURIComponent(symbols)}&range=1d&interval=5m`);
        if (!data) return;
        for (const s of batch) {
          const row = data[s.yahoo];
          const price = Number(row?.fulldayPrice ?? lastNumber(row?.close));
          if (!Number.isFinite(price) || price <= 0) continue;
          const prev = Number(row?.previousClose ?? row?.chartPreviousClose);
          out.set(s.key, {
            price,
            currency: s.key.startsWith('US:') ? 'USD' : 'IDR',
            changePct: prev > 0 ? ((price - prev) / prev) * 100 : null,
          });
        }
      }),
    );
  }

  /** Binance for coins it lists (USDT ≈ USD), CoinGecko for the rest, Yahoo "XYZ-USD" as the last try */
  private async fetchCrypto(sources: CryptoSource[], out: Map<string, Fetched>) {
    if (!sources.length) return;
    const pairs = await this.binanceListed();
    const onBinance = pairs ? sources.filter((s) => pairs.has(`${s.crypto.symbol}USDT`)) : [];
    if (onBinance.length) {
      // Binance rejects the whole request when a symbol is listed twice (BTC held on two platforms)
      const symbols = JSON.stringify([...new Set(onBinance.map((s) => `${s.crypto.symbol}USDT`))]);
      const data = await this.get<BinanceMini>('binance', `${BINANCE}/ticker/24hr?type=MINI&symbols=${encodeURIComponent(symbols)}`);
      const bySymbol = new Map((data ?? []).map((t) => [t.symbol, t]));
      for (const s of onBinance) {
        const t = bySymbol.get(`${s.crypto.symbol}USDT`);
        const price = Number(t?.lastPrice);
        const open = Number(t?.openPrice);
        if (Number.isFinite(price) && price > 0) {
          out.set(s.key, { price, currency: 'USD', priceIdr: null, changePct: open > 0 ? ((price - open) / open) * 100 : null });
        }
      }
    }

    const gecko = sources.filter((s) => !out.has(s.key) && s.crypto.coingecko);
    if (gecko.length) {
      const ids = [...new Set(gecko.map((s) => s.crypto.coingecko!))];
      const data = await this.get<CoinGeckoPrices>(
        'coingecko',
        `${COINGECKO}/simple/price?ids=${ids.map(encodeURIComponent).join(',')}&vs_currencies=usd,idr&include_24hr_change=true`,
      );
      for (const s of gecko) {
        const row = data?.[s.crypto.coingecko!];
        const usd = Number(row?.usd);
        if (!Number.isFinite(usd) || usd <= 0) continue;
        const idr = Number(row?.idr);
        const change = Number(row?.usd_24h_change);
        out.set(s.key, { price: usd, currency: 'USD', priceIdr: Number.isFinite(idr) && idr > 0 ? idr : null, changePct: Number.isFinite(change) ? change : null });
      }
    }

    const rest = sources.filter((s) => !out.has(s.key));
    if (rest.length) {
      const viaYahoo = new Map<string, Fetched>();
      await this.fetchYahooQuotes(rest.map((s) => ({ key: s.key, yahoo: `${s.crypto.symbol}-USD` })), viaYahoo);
      for (const [key, f] of viaYahoo) out.set(key, { ...f, currency: 'USD', priceIdr: null });
    }
  }

  /** Binance's USDT pairs (the full price list is one cheap request), refreshed every few hours */
  private async binanceListed(): Promise<Set<string> | null> {
    if (this.binancePairs && Date.now() - this.binancePairs.at < PAIRS_TTL_MS) return this.binancePairs.pairs;
    const list = (await this.once('binance:pairs', () => this.get<{ symbol: string }[]>('binance', `${BINANCE}/ticker/price`))) as { symbol: string }[] | null;
    if (!Array.isArray(list)) return this.binancePairs?.pairs ?? null;
    this.binancePairs = { pairs: new Set(list.map((t) => t.symbol).filter((s) => s.endsWith('USDT'))), at: Date.now() };
    return this.binancePairs.pairs;
  }

  // ---------------------------------------------------------------- charts

  private async fetchChart(source: PriceSource, interval: ChartInterval): Promise<Chart | null> {
    if ('crypto' in source) {
      const pair = `${source.crypto.symbol}USDT`;
      const pairs = await this.binanceListed();
      if (pairs?.has(pair)) {
        const rows = await this.get<BinanceKline[]>('binance', `${BINANCE}/klines?symbol=${pair}&interval=${CHART_BINANCE[interval]}&limit=${BINANCE_LIMIT}`);
        if (Array.isArray(rows) && rows.length) {
          const candles = rows
            .map((k) => ({ time: Math.floor(k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }))
            .filter(validCandle);
          return { currency: 'USD', candles, source: PROVIDERS.binance };
        }
      }
      return this.fetchYahooChart(`${source.crypto.symbol}-USD`, interval, 'USD');
    }
    return this.fetchYahooChart(source.yahoo, interval, source.key.startsWith('US:') ? 'USD' : 'IDR');
  }

  private async fetchYahooChart(symbol: string, chartInterval: ChartInterval, currency: string): Promise<Chart | null> {
    const { range, interval, group } = CHART_YAHOO[chartInterval];
    const data = await this.get<YahooChart>('yahoo', `${YAHOO}/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`);
    const result = data?.chart?.result?.[0];
    const q = result?.indicators?.quote?.[0];
    if (!result?.timestamp?.length || !q) return null;
    const candles: Candle[] = [];
    result.timestamp.forEach((time, i) => {
      const c = { time, open: Number(q.open?.[i]), high: Number(q.high?.[i]), low: Number(q.low?.[i]), close: Number(q.close?.[i]), volume: Number(q.volume?.[i] ?? 0) };
      // Yahoo leaves gaps (null) for minutes without trades
      if (q.close?.[i] != null && validCandle(c)) candles.push(c);
    });
    // The last bar can repeat the previous timestamp; the chart library needs strictly increasing times
    const unique = candles.filter((c, i) => i === candles.length - 1 || c.time < candles[i + 1].time);
    const bars = group ? groupCandles(unique, group) : unique;
    return bars.length ? { currency: String(result.meta?.currency ?? currency).toUpperCase(), candles: bars, source: PROVIDERS.yahoo } : null;
  }

  // ---------------------------------------------------------------- profile

  private async fetchProfile(source: PriceSource): Promise<AssetProfile> {
    const profile: AssetProfile = {
      name: null, exchange: null, currency: 'USD', market: null, session: null, previousClose: null, dayHigh: null, dayLow: null,
      volume: null, turnover: null, yearHigh: null, yearLow: null, marketCap: null, rank: null, circulatingSupply: null,
      maxSupply: null, allTimeHigh: null, allTimeHighDate: null, description: null, homepage: null, categories: [], sources: [],
    };
    if ('yahoo' in source) {
      profile.currency = source.key.startsWith('US:') ? 'USD' : 'IDR';
      const meta = await this.yahooMetaOf(source.yahoo);
      if (meta) applyYahooMeta(profile, meta);
      return profile;
    }

    profile.market = 'ALWAYS';
    const pair = `${source.crypto.symbol}USDT`;
    const [pairs, coin] = await Promise.all([this.binanceListed(), source.crypto.coingecko ? this.coinInfo(source.crypto.coingecko) : null]);
    const ticker = pairs?.has(pair) ? await this.get<BinanceTicker>('binance', `${BINANCE}/ticker/24hr?symbol=${pair}`) : null;
    if (ticker) {
      Object.assign(profile, {
        exchange: PROVIDERS.binance,
        previousClose: positive(ticker.prevClosePrice),
        dayHigh: positive(ticker.highPrice),
        dayLow: positive(ticker.lowPrice),
        volume: positive(ticker.volume),
        turnover: positive(ticker.quoteVolume),
      });
      profile.sources.push(PROVIDERS.binance);
    } else {
      const meta = await this.yahooMetaOf(`${source.crypto.symbol}-USD`);
      if (meta) {
        applyYahooMeta(profile, meta);
        profile.market = 'ALWAYS';
        profile.session = null;
      }
    }
    if (coin) {
      Object.assign(profile, coin, { name: coin.name ?? profile.name });
      profile.sources.push(PROVIDERS.coingecko);
    }
    return profile;
  }

  private async yahooMetaOf(symbol: string): Promise<YahooMeta | null> {
    const data = await this.get<YahooChart>('yahoo', `${YAHOO}/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`);
    return data?.chart?.result?.[0]?.meta ?? null;
  }

  /** Market cap, supply, all-time high and a short description; cached for an hour */
  private async coinInfo(id: string): Promise<CoinInfo | null> {
    const hit = this.coins.get(id);
    if (hit && Date.now() - hit.at < COIN_INFO_TTL_MS) return hit.info;
    const c = await this.get<CoinGeckoCoin>(
      'coingecko',
      `${COINGECKO}/coins/${encodeURIComponent(id)}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`,
    );
    if (!c) return hit?.info ?? null;
    const m = c.market_data ?? {};
    const info: CoinInfo = {
      name: c.name ?? null,
      marketCap: positive(m.market_cap?.usd),
      rank: c.market_cap_rank ?? null,
      circulatingSupply: positive(m.circulating_supply),
      maxSupply: positive(m.max_supply),
      allTimeHigh: positive(m.ath?.usd),
      allTimeHighDate: m.ath_date?.usd ?? null,
      description: shortDescription(c.description?.en),
      homepage: c.links?.homepage?.find((u) => /^https?:\/\//.test(u ?? '')) ?? null,
      categories: (c.categories ?? []).filter((x): x is string => !!x).slice(0, 4),
    };
    this.coins.set(id, { info, at: Date.now() });
    return info;
  }

  /** Name and existence of a Yahoo ticker. Throws SymbolNotFoundError when Yahoo doesn't know it, null when unreachable. */
  private async fetchYahooMeta(symbol: string): Promise<{ name: string | null } | null> {
    try {
      const res = await fetch(`${YAHOO}/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.status === 404) throw new SymbolNotFoundError();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.downAt.delete('yahoo');
      const meta = ((await res.json()) as YahooChart).chart?.result?.[0]?.meta;
      const price = Number(meta?.regularMarketPrice);
      if (!meta || !Number.isFinite(price) || price <= 0) throw new SymbolNotFoundError();
      return { name: meta.longName ?? meta.shortName ?? null };
    } catch (e) {
      if (e instanceof SymbolNotFoundError) throw e;
      this.markDown('yahoo', e);
      return null;
    }
  }

  // ---------------------------------------------------------------- plumbing

  private once<T>(key: string, run: () => Promise<T>): Promise<T> {
    const running = this.inflight.get(key);
    if (running) return running as Promise<T>;
    const p = run().finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  /** JSON or null (network error, timeout, rate limit); remembers which provider is down */
  private async get<T>(provider: Provider, url: string): Promise<T | null> {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as T;
      this.downAt.delete(provider);
      return json;
    } catch (e) {
      this.markDown(provider, e);
      return null;
    }
  }

  private markDown(provider: Provider, e: unknown) {
    this.downAt.set(provider, Date.now());
    this.log.warn(`${PROVIDERS[provider]}: ${e instanceof Error ? e.message : e}`);
  }

  /** Providers that failed in the last two minutes, by name (shown on the page) */
  private unreachable() {
    const now = Date.now();
    return [...this.downAt].filter(([, at]) => now - at < DOWN_FOR_MS).map(([p]) => PROVIDERS[p]);
  }

  private async persist(key: string, f: Fetched) {
    const data = { price: f.price, currency: f.currency, priceIdr: f.priceIdr ?? null, name: f.name ?? null };
    await this.prisma.marketPrice.upsert({ where: { key }, create: { key, ...data }, update: data });
  }
}

function dedupe(sources: PriceSource[]) {
  return [...new Map(sources.map((s) => [s.key, s])).values()];
}

function lastNumber(values?: (number | null)[]) {
  for (let i = (values?.length ?? 0) - 1; i >= 0; i--) if (values![i] != null) return values![i]!;
  return NaN;
}

/** Merges bars into buckets of `seconds` (e.g. hourly into 4-hour bars) */
export function groupCandles(candles: Candle[], seconds: number): Candle[] {
  const out: Candle[] = [];
  for (const c of candles) {
    const time = Math.floor(c.time / seconds) * seconds;
    const last = out.at(-1);
    if (last && last.time === time) {
      last.high = Math.max(last.high, c.high);
      last.low = Math.min(last.low, c.low);
      last.close = c.close;
      last.volume += c.volume;
    } else {
      out.push({ ...c, time });
    }
  }
  return out;
}

function positive(v: unknown): number | null {
  const n = Number(v);
  return v != null && Number.isFinite(n) && n > 0 ? n : null;
}

function applyYahooMeta(p: AssetProfile, m: YahooMeta) {
  const regular = m.currentTradingPeriod?.regular;
  const now = Date.now() / 1000;
  Object.assign(p, {
    name: m.longName ?? m.shortName ?? null,
    exchange: m.fullExchangeName ?? m.exchangeName ?? null,
    currency: String(m.currency ?? p.currency).toUpperCase(),
    previousClose: positive(m.chartPreviousClose ?? m.previousClose),
    dayHigh: positive(m.regularMarketDayHigh),
    dayLow: positive(m.regularMarketDayLow),
    volume: positive(m.regularMarketVolume),
    yearHigh: positive(m.fiftyTwoWeekHigh),
    yearLow: positive(m.fiftyTwoWeekLow),
  });
  if (regular?.start && regular.end) {
    p.session = { start: regular.start, end: regular.end, timezone: regular.timezone ?? m.timezone ?? '' };
    p.market = now >= regular.start && now < regular.end ? 'OPEN' : 'CLOSED';
  }
  p.sources.push(PROVIDERS.yahoo);
}

/** CoinGecko's description is long HTML: plain text, the first sentences only */
function shortDescription(html?: string): string | null {
  const text = (html ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [text];
  let out = '';
  for (const s of sentences) {
    if (out && (out + s).length > 420) break;
    out += s;
  }
  return out.trim().slice(0, 600);
}

function validCandle(c: Candle) {
  return [c.open, c.high, c.low, c.close].every((n) => Number.isFinite(n) && n > 0) && Number.isFinite(c.time);
}
