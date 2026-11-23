import { applyBuy, applySell, normalizeSymbol, SellTooLargeError, unitsPerQuantity } from './portfolio';

describe('portfolio math', () => {
  test('a buy averages the price by quantity', () => {
    // 10 lot @ 9.000 + 10 lot @ 8.000 -> 20 lot @ 8.500
    expect(applyBuy(10, 9000, 10, 8000)).toEqual({ quantity: 20, avgPrice: 8500 });
    // Fractions (crypto/US stocks), without float noise
    expect(applyBuy(0.1, 60000, 0.2, 30000)).toEqual({ quantity: 0.3, avgPrice: 40000 });
    // Buying into an empty position takes the buy price
    expect(applyBuy(0, 123, 2, 50)).toEqual({ quantity: 2, avgPrice: 50 });
  });

  test('a sell keeps the average and realizes the P&L per share (100 shares per IDX lot)', () => {
    expect(applySell('IDX_STOCK', 10, 8500, 4, 9000)).toEqual({ quantity: 6, avgPrice: 8500, realizedPnl: 200_000 });
    expect(applySell('CRYPTO', 0.3, 40000, 0.1, 35000)).toEqual({ quantity: 0.2, avgPrice: 40000, realizedPnl: -500 });
  });

  test('selling everything leaves exactly 0; selling more than held is refused', () => {
    expect(applySell('US_STOCK', 0.3, 10, 0.1 + 0.2, 12).quantity).toBe(0);
    expect(() => applySell('US_STOCK', 1, 10, 1.5, 12)).toThrow(SellTooLargeError);
  });

  test('IDX tickers are stored without .JK; only IDX counts lots', () => {
    expect(normalizeSymbol('IDX_STOCK', ' bbca.jk ')).toBe('BBCA');
    expect(normalizeSymbol('US_STOCK', 'brk.b')).toBe('BRK.B');
    expect(unitsPerQuantity('IDX_STOCK')).toBe(100);
    expect(unitsPerQuantity('US_STOCK')).toBe(1);
  });
});
