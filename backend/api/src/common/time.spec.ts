import { dayRange, isValidTimeZone, monthRange, zonedMidnight, zonedParts } from './time';

describe('time zone helpers', () => {
  it('local midnight in Jakarta is 17:00 UTC the previous day', () => {
    expect(zonedMidnight(2026, 11, 1, 'Asia/Jakarta').toISOString()).toBe('2026-10-31T17:00:00.000Z');
  });

  it('month range covers the whole local month, including year rollover', () => {
    const { start, end } = monthRange(2026, 12, 'Asia/Jakarta');
    expect(start.toISOString()).toBe('2026-11-30T17:00:00.000Z');
    expect(end.toISOString()).toBe('2026-12-31T17:00:00.000Z');
  });

  it('a transaction at 06:30 WIB on Nov 1 falls in November, not October (the old UTC bug)', () => {
    const at = new Date('2026-10-31T23:30:00Z'); // 06:30 WIB on Nov 1
    const nov = monthRange(2026, 11, 'Asia/Jakarta');
    expect(at >= nov.start && at < nov.end).toBe(true);
    expect(zonedParts(at, 'Asia/Jakarta')).toMatchObject({ year: 2026, month: 11, day: 1, hour: 6 });
  });

  it('works for other Indonesian zones', () => {
    expect(zonedMidnight(2026, 11, 1, 'Asia/Makassar').toISOString()).toBe('2026-10-31T16:00:00.000Z'); // WITA
    expect(zonedMidnight(2026, 11, 1, 'Asia/Jayapura').toISOString()).toBe('2026-10-31T15:00:00.000Z'); // WIT
  });

  it('handles daylight-saving transitions', () => {
    const { start, end } = dayRange(2026, 3, 8, 'America/New_York'); // DST starts: a 23-hour day
    expect(start.toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-09T04:00:00.000Z');
  });

  it('validates IANA zone names', () => {
    expect(isValidTimeZone('Asia/Jakarta')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone(123)).toBe(false);
  });
});
