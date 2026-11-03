import { allowedOrigins, trustProxyHops } from './app.setup';
import { appendMaxAgeMs } from './whatsapp/offline-queue';

describe('deployment settings from the environment', () => {
  it('FRONTEND_ORIGIN: comma-separated, trailing slashes removed, empty means no CORS', () => {
    expect(allowedOrigins({ FRONTEND_ORIGIN: 'https://a.vercel.app/, https://b.example.com' })).toEqual([
      'https://a.vercel.app',
      'https://b.example.com',
    ]);
    expect(allowedOrigins({})).toEqual([]);
  });

  it('TRUST_PROXY_HOPS defaults to one proxy and rejects nonsense', () => {
    expect(trustProxyHops({})).toBe(1);
    expect(trustProxyHops({ TRUST_PROXY_HOPS: '2' })).toBe(2);
    expect(trustProxyHops({ TRUST_PROXY_HOPS: 'abc' })).toBe(1);
  });

  it('WA_OFFLINE_MAX_AGE_HOURS sets how old a queued WhatsApp message may be (default 72 hours)', () => {
    expect(appendMaxAgeMs({})).toBe(72 * 3600_000);
    expect(appendMaxAgeMs({ WA_OFFLINE_MAX_AGE_HOURS: '168' })).toBe(168 * 3600_000);
    expect(appendMaxAgeMs({ WA_OFFLINE_MAX_AGE_HOURS: '-1' })).toBe(72 * 3600_000);
  });
});
