jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));

import { MarketService, SymbolNotFoundError, sourceFor } from './market.service';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const failure = { ok: false, status: 503, json: async () => ({}) };
/** Yahoo's spark response for these symbols: { "BBCA.JK": { close: [...], previousClose } } */
const spark = (rows: Record<string, [number, number]>) =>
  ok(Object.fromEntries(Object.entries(rows).map(([s, [price, prev]]) => [s, { close: [prev, null, price], previousClose: prev }])));
const sparkFor = (url: string, rows: Record<string, [number, number]>) =>
  spark(Object.fromEntries(Object.entries(rows).filter(([s]) => decodeURIComponent(url).includes(s))));

function setup(routes: (url: string) => unknown, stored: Record<string, unknown>[] = []) {
  const calls: string[] = [];
  global.fetch = jest.fn(async (url: string) => {
    calls.push(String(url));
    const res = routes(String(url));
    if (res instanceof Error) throw res;
    return res;
  }) as unknown as typeof fetch;
  const prisma = {
    marketPrice: {
      upsert: jest.fn(async () => ({})),
      findMany: jest.fn(async ({ where }: { where: { key: { in: string[] } } }) => stored.filter((r) => where.key.in.includes(r.key as string))),
    },
  };
  return { service: new MarketService(prisma as any), calls, prisma };
}

describe('MarketService', () => {
  const bbca = sourceFor('IDX_STOCK', 'BBCA');
  const aapl = sourceFor('US_STOCK', 'AAPL');
  const btc = sourceFor('CRYPTO', 'BTC', 'bitcoin');
  const pepe = sourceFor('CRYPTO', 'XYZ', 'xyz-token');

  test('stocks and USD/IDR come from Yahoo in one request, with the day change', async () => {
    const { service, calls } = setup((url) =>
      url.includes('/spark') ? sparkFor(url, { 'BBCA.JK': [9000, 8800], AAPL: [200, 250], 'USDIDR=X': [16000, 16000] }) : failure,
    );
    const { prices, fx, unreachable } = await service.quotes([bbca, aapl]);
    expect(prices['IDX:BBCA']).toMatchObject({ price: 9000, currency: 'IDR', stale: false });
    expect(prices['IDX:BBCA']!.changePct).toBeCloseTo(2.2727, 3);
    expect(prices['US:AAPL']).toMatchObject({ price: 200, currency: 'USD', changePct: -20 });
    expect(fx).toMatchObject({ price: 16000, stale: false });
    expect(calls.filter((c) => c.includes('/spark'))).toHaveLength(1);
    expect(unreachable).toEqual([]);
  });

  test('crypto: Binance for listed coins, CoinGecko for the rest', async () => {
    const { service, calls } = setup((url) => {
      if (url.endsWith('/ticker/price')) return ok([{ symbol: 'BTCUSDT' }, { symbol: 'ETHBTC' }]);
      if (url.includes('/ticker/24hr')) return ok([{ symbol: 'BTCUSDT', lastPrice: '60000', openPrice: '50000' }]);
      if (url.includes('coingecko')) return ok({ 'xyz-token': { usd: 0.5, idr: 8000, usd_24h_change: -3 } });
      if (url.includes('/spark')) return sparkFor(url, { 'USDIDR=X': [16000, 16000] });
      return failure;
    });
    const { prices } = await service.quotes([btc, pepe]);
    expect(prices['CRYPTO:bitcoin']).toMatchObject({ price: 60000, currency: 'USD', changePct: 20, stale: false });
    expect(prices['CRYPTO:xyz-token']).toMatchObject({ price: 0.5, priceIdr: 8000, changePct: -3 });
    // Only XYZ went to CoinGecko
    expect(calls.find((c) => c.includes('coingecko'))).toContain('ids=xyz-token');
  });

  test('crypto falls back to CoinGecko when Binance is unreachable, and Binance is reported', async () => {
    const { service } = setup((url) => {
      if (url.includes('binance')) return new Error('blocked');
      if (url.includes('coingecko')) return ok({ bitcoin: { usd: 61000, idr: 976_000_000 } });
      if (url.includes('/spark')) return sparkFor(url, { 'USDIDR=X': [16000, 16000] });
      return failure;
    });
    const { prices, unreachable } = await service.quotes([btc]);
    expect(prices['CRYPTO:bitcoin']).toMatchObject({ price: 61000, priceIdr: 976_000_000, stale: false });
    expect(unreachable).toEqual(['Binance']);
  });

  test('prices are cached: a second request within the TTL fetches nothing', async () => {
    const { service, calls } = setup((url) => sparkFor(url, { 'BBCA.JK': [9000, 9000], 'USDIDR=X': [16000, 16000] }));
    await service.quotes([bbca]);
    const before = calls.length;
    await Promise.all([service.quotes([bbca]), service.quotes([bbca])]);
    expect(calls.length).toBe(before);
  });

  test('a failing source serves the last price from the database, marked stale, and is reported', async () => {
    const stored = [{ key: 'IDX:BBCA', price: '8800', currency: 'IDR', priceIdr: null, name: 'BCA', updatedAt: new Date('2026-11-20T09:00:00Z') }];
    const { service } = setup(() => new Error('timeout'), stored);
    const { prices, fx, unreachable } = await service.quotes([bbca]);
    expect(prices['IDX:BBCA']).toEqual({ price: 8800, currency: 'IDR', priceIdr: null, changePct: null, name: 'BCA', updatedAt: '2026-11-20T09:00:00.000Z', stale: true });
    expect(fx).toBeNull(); // never fetched before: unknown, not an error
    expect(unreachable).toEqual(['Yahoo Finance']);
  });

  test('after a live price, a failed fetch keeps it but marks it stale', async () => {
    let up = true;
    const { service } = setup((url) => (up ? sparkFor(url, { 'BBCA.JK': [9000, 9000], 'USDIDR=X': [16000, 16000] }) : failure));
    await service.quotes([bbca]);
    up = false;
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + 60_000);
    const { prices } = await service.quotes([bbca]);
    expect(prices['IDX:BBCA']).toMatchObject({ price: 9000, stale: true });
    jest.restoreAllMocks();
  });

  test('chart: Binance candles for listed coins, Yahoo for stocks (gaps skipped)', async () => {
    const { service } = setup((url) => {
      if (url.endsWith('/ticker/price')) return ok([{ symbol: 'BTCUSDT' }]);
      if (url.includes('/klines')) return ok([[1_700_000_000_000, '1', '3', '0.5', '2', '10'], [1_700_000_300_000, '2', '4', '1', '3', '5']]);
      if (url.includes('/chart/BBCA.JK')) {
        return ok({ chart: { result: [{ meta: { currency: 'IDR' }, timestamp: [10, 20, 30], indicators: { quote: [{ open: [1, null, 3], high: [2, null, 4], low: [1, null, 2], close: [2, null, 3], volume: [5, null, 6] }] } }] } });
      }
      return failure;
    });
    const crypto = await service.chart(btc, '1D');
    expect(crypto).toMatchObject({ currency: 'USD', source: 'Binance' });
    expect(crypto!.candles[1]).toEqual({ time: 1_700_000_300, open: 2, high: 4, low: 1, close: 3, volume: 5 });
    const stock = await service.chart(bbca, '1M');
    expect(stock!.candles.map((c) => c.time)).toEqual([10, 30]);
    expect(stock!.currency).toBe('IDR');
  });

  test('lookup: unknown tickers are reported, unreachable sources are not', async () => {
    const notFound = { ok: false, status: 404, json: async () => ({}) };
    let { service } = setup(() => notFound);
    await expect(service.lookup('US_STOCK', 'NOPE')).rejects.toBeInstanceOf(SymbolNotFoundError);

    ({ service } = setup(() => new Error('offline')));
    await expect(service.lookup('IDX_STOCK', 'BBCA')).resolves.toBeNull();

    ({ service } = setup(() => ok({ chart: { result: [{ meta: { regularMarketPrice: 9000, currency: 'IDR', longName: 'Bank Central Asia' } }] } })));
    await expect(service.lookup('IDX_STOCK', 'BBCA')).resolves.toEqual({ name: 'Bank Central Asia' });

    ({ service } = setup(() =>
      ok({ coins: [{ id: 'wrapped-btc', symbol: 'BTC', name: 'Wrapped', market_cap_rank: 300 }, { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', market_cap_rank: 1 }] }),
    ));
    await expect(service.lookup('CRYPTO', 'BTC')).resolves.toEqual({ name: 'Bitcoin', coingeckoId: 'bitcoin' });
  });
});
