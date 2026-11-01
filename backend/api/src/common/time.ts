/**
 * Time zone helpers. Timestamps are stored in UTC; calendar boundaries (a day, a month) and
 * times shown to the user are computed in the user's IANA zone with Intl, never with the
 * server's local time, so the result is the same whatever TZ the container runs in.
 */

export const DEFAULT_TIMEZONE = 'Asia/Jakarta';

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(tz, f);
  }
  return f;
}

/** Wall-clock fields of `instant` in `tz`. */
export function zonedParts(instant: Date, tz: string) {
  const get = (type: string) => Number(partsFormatter(tz).formatToParts(instant).find((p) => p.type === type)!.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

/** Offset of `tz` from UTC at `instant`, in ms (Asia/Jakarta: +7h). */
function offsetMs(instant: Date, tz: string) {
  const p = zonedParts(instant, tz);
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wallAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * UTC instant of local midnight on year-month-day in `tz`. Month is 1-12; day/month may
 * overflow (e.g. month 13 = January next year), like Date.UTC. Handles DST changes.
 */
export function zonedMidnight(year: number, month: number, day: number, tz: string): Date {
  const wall = Date.UTC(year, month - 1, day);
  let ts = wall - offsetMs(new Date(wall), tz);
  const corrected = wall - offsetMs(new Date(ts), tz); // offset may differ on the target date (DST)
  if (corrected !== ts) ts = corrected;
  return new Date(ts);
}

/** [start, end) of a calendar month in `tz`. */
export function monthRange(year: number, month: number, tz: string) {
  return { start: zonedMidnight(year, month, 1, tz), end: zonedMidnight(year, month + 1, 1, tz) };
}

/** [start, end) of a calendar day in `tz`. */
export function dayRange(year: number, month: number, day: number, tz: string) {
  return { start: zonedMidnight(year, month, day, tz), end: zonedMidnight(year, month, day + 1, tz) };
}
