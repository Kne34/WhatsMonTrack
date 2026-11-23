import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { FX_KEY, type AssetType } from './portfolio';

/** A price as served to the dashboard. `stale`: the live source failed, this is the last known price. */
export interface Quote {
  price: number;
  /** Currency of `price`: IDR (IDX stocks, the exchange rate) or USD (US stocks, crypto) */
  currency: string;
  /** Crypto only: the IDR price from CoinGecko, so IDR holdings need no conversion */
  priceIdr?: number | null;
  name?: string | null;
  updatedAt: string;
  stale: boolean;
}

/** What the API needs to fetch one price. */
export type PriceSource = { key: string; yahoo: string } | { key: string; coingecko: string };

export class SymbolNotFoundError extends Error {}

const YAHOO_CHART = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const COINGECKO = 'https://api.coingecko.com/api/v3';
/** Yahoo answers browsers only */
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; WhatsMonTrack)', Accept: 'application/json' };

/** Prices are fetched at most once per TTL, whoever asks (they are the same for every user). */
export const PRICE_TTL_MS = 3 * 60_000;
/** "Refresh prices" still never fetches the same price twice within this time. */
export const MIN_REFRESH_MS = 30_000;
/** After a failed fetch the source is left alone this long (the last known price is served meanwhile). */
const RETRY_AFTER_FAIL_MS = 60_000;
const TIMEOUT_MS = 8_000;
/** Parallel requests to Yahoo (one request per symbol) */
const YAHOO_CONCURRENCY = 4;

/** Where an asset's price comes from: IDX gets the ".JK" suffix on Yahoo, crypto uses CoinGecko. */
export function sourceFor(type: string, symbol: string, coingeckoId?: string | null): PriceSource {
  if (type === 'CRYPTO') return { key: `CRYPTO:${coingeckoId || symbol.toLowerCase()}`, coingecko: coingeckoId || symbol.toLowerCase() };
  if (type === 'IDX_STOCK') return { key: `IDX:${symbol}`, yahoo: `${symbol}.JK` };
  return { key: `US:${symbol}`, yahoo: symbol };
}

export const FX_SOURCE: PriceSource = { key: FX_KEY, yahoo: 'USDIDR=X' };

type Fetched = Omit<Quote, 'stale' | 'updatedAt'>;

/** The parts of the external responses that are used */
interface YahooChart {
  chart?: { result?: { meta?: { regularMarketPrice?: number; currency?: string; longName?: string; shortName?: string } }[] };
}
interface CoinGeckoSearch {
  coins?: { id: string; symbol: string; name: string; market_cap_rank: number | null }[];
}
type CoinGeckoPrices = Record<string, { usd?: number; idr?: number } | undefined>;

/**
 * Live prices from Yahoo Finance (IDX and US stocks, USD/IDR) and CoinGecko (crypto), through
 * the API so the browser has no CORS problem and the sources see one cached client.
 * Cache: memory (TTL 3 min) backed by the MarketPrice table. When a source fails or times out,
 * the last known price is served with `stale: true` instead of an error.
 */
@Injectable()
export class MarketService {
  private readonly log = new Logger(MarketService.name);
  private readonly cache = new Map<string, { quote: Quote; at: number }>();
  private readonly failedAt = new Map<string, number>();
  /** Concurrent requests for the same prices share one fetch */
  private readonly inflight = new Map<string, Promise<Fetched | null>>();

  constructor(private readonly prisma: PrismaService) {}

  /** Prices for these sources plus the USD/IDR rate. Never throws: unknown prices are null. */
  async quotes(sources: PriceSource[], force = false): Promise<{ prices: Record<string, Quote | null>; fx: Quote | null }> {
    const all = dedupe([...sources, FX_SOURCE]);
    const now = Date.now();
    const maxAge = force ? MIN_REFRESH_MS : PRICE_TTL_MS;
    const due = all.filter((s) => {
      const hit = this.cache.get(s.key);
      if (hit && now - hit.at < maxAge) return false;
      const failed = this.failedAt.get(s.key);
      return !(failed && now - failed < RETRY_AFTER_FAIL_MS);
    });

    const yahoo = due.filter((s): s is { key: string; yahoo: string } => 'yahoo' in s);
    const gecko = due.filter((s): s is { key: string; coingecko: string } => 'coingecko' in s);
    const fetched = new Map<string, Fetched | null>();
    await Promise.all([
      mapLimit(yahoo, YAHOO_CONCURRENCY, async (s) => fetched.set(s.key, await this.once(s.key, () => this.fetchYahoo(s.yahoo)))),
      gecko.length ? this.fetchCoinGecko(gecko).then((m) => gecko.forEach((s) => fetched.set(s.key, m.get(s.key) ?? null))) : null,
    ]);

    const saved = new Date().toISOString();
    for (const [key, f] of fetched) {
      if (f) {
        this.cache.set(key, { quote: { ...f, updatedAt: saved, stale: false }, at: Date.now() });
        this.failedAt.delete(key);
        this.persist(key, f).catch((e) => this.log.warn(`saving ${key} failed: ${e}`));
      } else {
        this.failedAt.set(key, Date.now());
      }
    }

    // Anything not fresh in memory: the last price in the database, marked stale
    const missing = all.filter((s) => !this.cache.has(s.key)).map((s) => s.key);
    const stored = missing.length ? await this.prisma.marketPrice.findMany({ where: { key: { in: missing } } }).catch(() => []) : [];
    const fromDb = new Map(stored.map((r) => [r.key, r]));

    const prices: Record<string, Quote | null> = {};
    for (const s of all) {
      const hit = this.cache.get(s.key);
      const failedRecently = fetched.has(s.key) && !fetched.get(s.key);
      if (hit) {
        prices[s.key] = failedRecently || Date.now() - hit.at > PRICE_TTL_MS * 2 ? { ...hit.quote, stale: true } : hit.quote;
        continue;
      }
      const row = fromDb.get(s.key);
      prices[s.key] = row
        ? {
            price: Number(row.price),
            currency: row.currency,
            priceIdr: row.priceIdr == null ? null : Number(row.priceIdr),
            name: row.name,
            updatedAt: row.updatedAt.toISOString(),
            stale: true,
          }
        : null;
    }
    const fx = prices[FX_KEY];
    delete prices[FX_KEY];
    return { prices, fx };
  }

  /**
   * Checks that a ticker exists and finds its name (and the CoinGecko id for crypto).
   * Throws SymbolNotFoundError when the source says it doesn't exist; returns null when the
   * source can't be reached (the holding is saved anyway, the price shows up later).
   */
  async lookup(type: AssetType, symbol: string): Promise<{ name: string | null; coingeckoId?: string } | null> {
    if (type === 'CRYPTO') {
      const res = await this.get<CoinGeckoSearch>(`${COINGECKO}/search?query=${encodeURIComponent(symbol)}`);
      if (!res) return null;
      const coins = res.coins ?? [];
      const match = coins
        .filter((c) => c.symbol?.toUpperCase() === symbol)
        .sort((a, b) => (a.market_cap_rank ?? Infinity) - (b.market_cap_rank ?? Infinity))[0];
      if (!match) throw new SymbolNotFoundError();
      return { name: match.name, coingeckoId: match.id };
    }
    const source = sourceFor(type, symbol) as { key: string; yahoo: string };
    const quote = await this.fetchYahoo(source.yahoo, true);
    return quote ? { name: quote.name ?? null } : null;
  }

  private once(key: string, run: () => Promise<Fetched | null>) {
    const running = this.inflight.get(key);
    if (running) return running;
    const p = run().finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  /** null on any failure; with `strict`, throws SymbolNotFoundError when Yahoo doesn't know the symbol. */
  private async fetchYahoo(symbol: string, strict = false): Promise<Fetched | null> {
    try {
      const res = await fetch(`${YAHOO_CHART}${encodeURIComponent(symbol)}?range=1d&interval=1d`, {
        headers: HEADERS,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 404) {
        if (strict) throw new SymbolNotFoundError();
        return null;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const meta = ((await res.json()) as YahooChart).chart?.result?.[0]?.meta;
      const price = Number(meta?.regularMarketPrice);
      if (!meta || !Number.isFinite(price) || price <= 0) {
        if (strict) throw new SymbolNotFoundError();
        return null;
      }
      return { price, currency: String(meta.currency ?? 'USD').toUpperCase(), name: meta.longName ?? meta.shortName ?? null };
    } catch (e) {
      if (e instanceof SymbolNotFoundError) throw e;
      this.log.warn(`Yahoo ${symbol}: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }

  /** One request for all coins: /simple/price?ids=a,b&vs_currencies=usd,idr */
  private async fetchCoinGecko(sources: { key: string; coingecko: string }[]) {
    const out = new Map<string, Fetched>();
    const ids = [...new Set(sources.map((s) => s.coingecko))];
    const data = await this.get<CoinGeckoPrices>(`${COINGECKO}/simple/price?ids=${ids.map(encodeURIComponent).join(',')}&vs_currencies=usd,idr`);
    if (!data) return out;
    for (const s of sources) {
      const row = data[s.coingecko];
      const usd = Number(row?.usd);
      if (Number.isFinite(usd) && usd > 0) {
        const idr = Number(row?.idr);
        out.set(s.key, { price: usd, currency: 'USD', priceIdr: Number.isFinite(idr) && idr > 0 ? idr : null });
      }
    }
    return out;
  }

  /** JSON or null (network error, timeout, rate limit) */
  private async get<T>(url: string): Promise<T | null> {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (e) {
      this.log.warn(`${new URL(url).host}: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  }

  private async persist(key: string, f: Fetched) {
    const data = { price: f.price, currency: f.currency, priceIdr: f.priceIdr ?? null, name: f.name ?? null };
    await this.prisma.marketPrice.upsert({ where: { key }, create: { key, ...data }, update: data });
  }
}

function dedupe(sources: PriceSource[]) {
  return [...new Map(sources.map((s) => [s.key, s])).values()];
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<unknown>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
