jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));

import { MarketService, SymbolNotFoundError, sourceFor } from './market.service';

const yahoo = (price: number, currency: string, longName?: string) => ({
  ok: true,
  status: 200,
  json: async () => ({ chart: { result: [{ meta: { regularMarketPrice: price, currency, longName } }] } }),
});
const failure = { ok: false, status: 503, json: async () => ({}) };

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
  const btc = sourceFor('CRYPTO', 'BTC', 'bitcoin');

  test('IDX gets the .JK suffix, crypto goes to CoinGecko in one request, USD/IDR is always included', async () => {
    const { service, calls } = setup((url) => {
      if (url.includes('BBCA.JK')) return yahoo(9000, 'IDR', 'Bank Central Asia');
      if (url.includes('USDIDR')) return yahoo(16000, 'IDR');
      if (url.includes('coingecko')) return { ok: true, status: 200, json: async () => ({ bitcoin: { usd: 60000, idr: 960_000_000 } }) };
      return failure;
    });
    const { prices, fx } = await service.quotes([bbca, btc]);
    expect(prices['IDX:BBCA']).toMatchObject({ price: 9000, currency: 'IDR', name: 'Bank Central Asia', stale: false });
    expect(prices['CRYPTO:bitcoin']).toMatchObject({ price: 60000, currency: 'USD', priceIdr: 960_000_000, stale: false });
    expect(fx).toMatchObject({ price: 16000, stale: false });
    expect(calls.filter((c) => c.includes('coingecko'))).toHaveLength(1);
  });

  test('prices are cached: a second request within the TTL fetches nothing', async () => {
    const { service, calls } = setup((url) => (url.includes('USDIDR') ? yahoo(16000, 'IDR') : yahoo(9000, 'IDR')));
    await service.quotes([bbca]);
    const before = calls.length;
    await service.quotes([bbca]);
    await service.quotes([bbca], true); // "refresh" within 30 seconds reuses them too
    expect(calls.length).toBe(before);
  });

  test('a failing source serves the last price from the database, marked stale', async () => {
    const stored = [{ key: 'IDX:BBCA', price: '8800', currency: 'IDR', priceIdr: null, name: 'BCA', updatedAt: new Date('2026-11-20T09:00:00Z') }];
    const { service } = setup(() => new Error('timeout'), stored);
    const { prices, fx } = await service.quotes([bbca]);
    expect(prices['IDX:BBCA']).toEqual({ price: 8800, currency: 'IDR', priceIdr: null, name: 'BCA', updatedAt: '2026-11-20T09:00:00.000Z', stale: true });
    expect(fx).toBeNull(); // never fetched before: unknown, not an error
  });

  test('after a live price, a failed refresh keeps it but marks it stale', async () => {
    let up = true;
    const { service } = setup((url) => (up ? (url.includes('USDIDR') ? yahoo(16000, 'IDR') : yahoo(9000, 'IDR')) : failure));
    await service.quotes([bbca]);
    up = false;
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 5 * 60_000);
    const { prices } = await service.quotes([bbca]);
    expect(prices['IDX:BBCA']).toMatchObject({ price: 9000, stale: true });
    jest.restoreAllMocks();
  });

  test('lookup: unknown tickers are reported, unreachable sources are not', async () => {
    const notFound = { ok: false, status: 404, json: async () => ({}) };
    let { service } = setup(() => notFound);
    await expect(service.lookup('US_STOCK', 'NOPE')).rejects.toBeInstanceOf(SymbolNotFoundError);

    ({ service } = setup(() => new Error('offline')));
    await expect(service.lookup('IDX_STOCK', 'BBCA')).resolves.toBeNull();

    ({ service } = setup(() => ({
      ok: true,
      status: 200,
      json: async () => ({ coins: [{ id: 'wrapped-btc', symbol: 'BTC', name: 'Wrapped', market_cap_rank: 300 }, { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', market_cap_rank: 1 }] }),
    })));
    await expect(service.lookup('CRYPTO', 'BTC')).resolves.toEqual({ name: 'Bitcoin', coingeckoId: 'bitcoin' });
  });
});
