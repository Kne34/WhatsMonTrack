/**
 * Technical analysis for the chart page, computed in the browser from the candles: indicator
 * lines for the chart, a TradingView-style rating (oscillators and moving averages), pivot
 * points, and performance/statistics. Not investment advice: plain arithmetic on past prices.
 */
import type { Candle } from "./portfolio";

export type Series = (number | null)[];

// ---------------------------------------------------------------- indicator lines

export function sma(values: Series, n: number): Series {
  const out: Series = new Array(values.length).fill(null);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) { sum = 0; count = 0; continue; }
    sum += v;
    count++;
    if (count > n) { sum -= values[i - n]!; count = n; }
    if (count === n) out[i] = sum / n;
  }
  return out;
}

export function ema(values: Series, n: number): Series {
  const out: Series = new Array(values.length).fill(null);
  const k = 2 / (n + 1);
  let prev: number | null = null;
  let seed: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    if (prev == null) {
      seed.push(v);
      if (seed.length === n) { prev = seed.reduce((a, b) => a + b, 0) / n; out[i] = prev; seed = []; }
      continue;
    }
    prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder's smoothing (RSI, ADX) */
function rma(values: Series, n: number): Series {
  const out: Series = new Array(values.length).fill(null);
  let prev: number | null = null;
  const seed: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) continue;
    if (prev == null) {
      seed.push(v);
      if (seed.length === n) { prev = seed.reduce((a, b) => a + b, 0) / n; out[i] = prev; }
      continue;
    }
    prev = (prev * (n - 1) + v) / n;
    out[i] = prev;
  }
  return out;
}

/** Weighted moving average (for the Hull MA) */
function wma(values: Series, n: number): Series {
  const out: Series = new Array(values.length).fill(null);
  const denom = (n * (n + 1)) / 2;
  for (let i = n - 1; i < values.length; i++) {
    let sum = 0;
    let ok = true;
    for (let j = 0; j < n; j++) {
      const v = values[i - j];
      if (v == null) { ok = false; break; }
      sum += v * (n - j);
    }
    if (ok) out[i] = sum / denom;
  }
  return out;
}

export function hma(values: Series, n: number): Series {
  const half = wma(values, Math.round(n / 2));
  const full = wma(values, n);
  const diff = half.map((h, i) => (h == null || full[i] == null ? null : 2 * h - full[i]!));
  return wma(diff, Math.round(Math.sqrt(n)));
}

/** Volume-weighted moving average */
export function vwma(candles: Candle[], n: number): Series {
  return candles.map((_, i) => {
    if (i < n - 1) return null;
    let pv = 0;
    let v = 0;
    for (let j = i - n + 1; j <= i; j++) { pv += candles[j].close * candles[j].volume; v += candles[j].volume; }
    return v > 0 ? pv / v : null;
  });
}

export function rsi(closes: number[], n = 14): Series {
  const gains: Series = [null];
  const losses: Series = [null];
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gains.push(Math.max(d, 0));
    losses.push(Math.max(-d, 0));
  }
  const g = rma(gains, n);
  const l = rma(losses, n);
  return g.map((gv, i) => (gv == null || l[i] == null ? null : l[i] === 0 ? 100 : 100 - 100 / (1 + gv / l[i]!)));
}

export function bollinger(closes: number[], n = 20, mult = 2) {
  const mid = sma(closes, n);
  const upper: Series = [];
  const lower: Series = [];
  mid.forEach((m, i) => {
    if (m == null) { upper.push(null); lower.push(null); return; }
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += (closes[j] - m) ** 2;
    const sd = Math.sqrt(s / n);
    upper.push(m + mult * sd);
    lower.push(m - mult * sd);
  });
  return { upper, mid, lower };
}

export function macd(closes: number[], fast = 12, slow = 26, signal = 9) {
  const f = ema(closes, fast);
  const s = ema(closes, slow);
  const line = f.map((v, i) => (v == null || s[i] == null ? null : v - s[i]!));
  const sig = ema(line, signal);
  const hist = line.map((v, i) => (v == null || sig[i] == null ? null : v - sig[i]!));
  return { line, signal: sig, hist };
}

function highest(candles: Candle[], i: number, n: number) {
  let h = -Infinity;
  for (let j = Math.max(0, i - n + 1); j <= i; j++) h = Math.max(h, candles[j].high);
  return h;
}
function lowest(candles: Candle[], i: number, n: number) {
  let l = Infinity;
  for (let j = Math.max(0, i - n + 1); j <= i; j++) l = Math.min(l, candles[j].low);
  return l;
}

export function stochastic(candles: Candle[], n = 14, smoothK = 3, smoothD = 3) {
  const raw: Series = candles.map((c, i) => {
    if (i < n - 1) return null;
    const h = highest(candles, i, n);
    const l = lowest(candles, i, n);
    return h === l ? 50 : ((c.close - l) / (h - l)) * 100;
  });
  const k = sma(raw, smoothK);
  return { k, d: sma(k, smoothD) };
}

export function cci(candles: Candle[], n = 20): Series {
  const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
  const mean = sma(tp, n);
  return tp.map((t, i) => {
    if (mean[i] == null) return null;
    let dev = 0;
    for (let j = i - n + 1; j <= i; j++) dev += Math.abs(tp[j] - mean[i]!);
    dev /= n;
    return dev === 0 ? 0 : (t - mean[i]!) / (0.015 * dev);
  });
}

export function adx(candles: Candle[], n = 14) {
  const plusDm: Series = [null];
  const minusDm: Series = [null];
  const tr: Series = [null];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const p = candles[i - 1];
    const up = c.high - p.high;
    const down = p.low - c.low;
    plusDm.push(up > down && up > 0 ? up : 0);
    minusDm.push(down > up && down > 0 ? down : 0);
    tr.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  const atr = rma(tr, n);
  const pdi = rma(plusDm, n).map((v, i) => (v == null || !atr[i] ? null : (100 * v) / atr[i]!));
  const mdi = rma(minusDm, n).map((v, i) => (v == null || !atr[i] ? null : (100 * v) / atr[i]!));
  const dx = pdi.map((p, i) => (p == null || mdi[i] == null || p + mdi[i]! === 0 ? null : (100 * Math.abs(p - mdi[i]!)) / (p + mdi[i]!)));
  return { adx: rma(dx, n), plus: pdi, minus: mdi };
}

export function awesome(candles: Candle[]): Series {
  const mid = candles.map((c) => (c.high + c.low) / 2);
  const a = sma(mid, 5);
  const b = sma(mid, 34);
  return a.map((v, i) => (v == null || b[i] == null ? null : v - b[i]!));
}

export function momentum(closes: number[], n = 10): Series {
  return closes.map((c, i) => (i < n ? null : c - closes[i - n]));
}

export function williams(candles: Candle[], n = 14): Series {
  return candles.map((c, i) => {
    if (i < n - 1) return null;
    const h = highest(candles, i, n);
    const l = lowest(candles, i, n);
    return h === l ? -50 : ((h - c.close) / (h - l)) * -100;
  });
}

/** Bull power + bear power (Elder), against EMA 13 */
export function bullBearPower(candles: Candle[], n = 13): Series {
  const e = ema(candles.map((c) => c.close), n);
  return candles.map((c, i) => (e[i] == null ? null : c.high - e[i]! + (c.low - e[i]!)));
}

export function ultimate(candles: Candle[], a = 7, b = 14, c = 28): Series {
  const bp: number[] = [];
  const tr: number[] = [];
  candles.forEach((k, i) => {
    const prev = i ? candles[i - 1].close : k.close;
    bp.push(k.close - Math.min(k.low, prev));
    tr.push(Math.max(k.high, prev) - Math.min(k.low, prev));
  });
  const avg = (i: number, n: number) => {
    let s = 0;
    let t = 0;
    for (let j = i - n + 1; j <= i; j++) { s += bp[j]; t += tr[j]; }
    return t === 0 ? 0 : s / t;
  };
  return candles.map((_, i) => (i < c ? null : (100 * (4 * avg(i, a) + 2 * avg(i, b) + avg(i, c))) / 7));
}

/** Heikin Ashi bars: smoother candles that show the trend */
export function heikinAshi(candles: Candle[]): Candle[] {
  const out: Candle[] = [];
  candles.forEach((c, i) => {
    const close = (c.open + c.high + c.low + c.close) / 4;
    const open = i === 0 ? (c.open + c.close) / 2 : (out[i - 1].open + out[i - 1].close) / 2;
    out.push({ time: c.time, open, close, high: Math.max(c.high, open, close), low: Math.min(c.low, open, close), volume: c.volume });
  });
  return out;
}

// ---------------------------------------------------------------- rating

export type Signal = "BUY" | "SELL" | "NEUTRAL";
export type RatingLabel = "STRONG_SELL" | "SELL" | "NEUTRAL" | "BUY" | "STRONG_BUY";
export const RATING_TEXT: Record<RatingLabel, string> = {
  STRONG_SELL: "Jual kuat",
  SELL: "Jual",
  NEUTRAL: "Netral",
  BUY: "Beli",
  STRONG_BUY: "Beli kuat",
};
export const SIGNAL_TEXT: Record<Signal, string> = { BUY: "Beli", SELL: "Jual", NEUTRAL: "Netral" };

export interface IndicatorRow { name: string; value: number | null; signal: Signal | null }
export interface Rating { score: number; label: RatingLabel; buy: number; sell: number; neutral: number }
export interface Technicals {
  oscillators: IndicatorRow[];
  movingAverages: IndicatorRow[];
  osc: Rating | null;
  ma: Rating | null;
  summary: Rating | null;
}

const last = (s: Series, back = 0) => s[s.length - 1 - back] ?? null;

function rate(rows: IndicatorRow[]): Rating | null {
  const counted = rows.filter((r) => r.signal);
  if (!counted.length) return null;
  const buy = counted.filter((r) => r.signal === "BUY").length;
  const sell = counted.filter((r) => r.signal === "SELL").length;
  const score = (buy - sell) / counted.length;
  return { score, label: labelOf(score), buy, sell, neutral: counted.length - buy - sell };
}

export function labelOf(score: number): RatingLabel {
  if (score > 0.5) return "STRONG_BUY";
  if (score > 0.1) return "BUY";
  if (score >= -0.1) return "NEUTRAL";
  if (score >= -0.5) return "SELL";
  return "STRONG_SELL";
}

/** Rules as TradingView documents them for its "Technical Ratings" */
export function technicals(candles: Candle[]): Technicals {
  const closes = candles.map((c) => c.close);
  const price = closes.at(-1) ?? 0;
  const row = (name: string, value: number | null, signal: Signal | null): IndicatorRow => ({ name, value, signal: value == null ? null : signal });
  const rising = (s: Series) => last(s) != null && last(s, 1) != null && last(s)! > last(s, 1)!;
  const falling = (s: Series) => last(s) != null && last(s, 1) != null && last(s)! < last(s, 1)!;

  const r = rsi(closes);
  const st = stochastic(candles);
  const cc = cci(candles);
  const ad = adx(candles);
  const ao = awesome(candles);
  const mom = momentum(closes);
  const m = macd(closes);
  const wr = williams(candles);
  const bbp = bullBearPower(candles);
  const uo = ultimate(candles);

  const rsiV = last(r);
  const k = last(st.k);
  const d = last(st.d);
  const cciV = last(cc);
  const adxV = last(ad.adx);
  const pdi = last(ad.plus);
  const mdi = last(ad.minus);
  const aoV = last(ao);
  const macdV = last(m.line);
  const sigV = last(m.signal);
  const wrV = last(wr);
  const bbpV = last(bbp);
  const uoV = last(uo);

  const oscillators: IndicatorRow[] = [
    row("RSI (14)", rsiV, rsiV != null && rsiV < 30 && rising(r) ? "BUY" : rsiV != null && rsiV > 70 && falling(r) ? "SELL" : "NEUTRAL"),
    row("Stochastic %K (14, 3, 3)", k, k != null && d != null && k < 20 && d < 20 && k > d ? "BUY" : k != null && d != null && k > 80 && d > 80 && k < d ? "SELL" : "NEUTRAL"),
    row("CCI (20)", cciV, cciV != null && cciV < -100 && rising(cc) ? "BUY" : cciV != null && cciV > 100 && falling(cc) ? "SELL" : "NEUTRAL"),
    row("ADX (14)", adxV, adxV != null && pdi != null && mdi != null && adxV > 20 ? (pdi > mdi ? "BUY" : "SELL") : "NEUTRAL"),
    row("Awesome Oscillator", aoV, aoV != null && aoV > 0 && rising(ao) ? "BUY" : aoV != null && aoV < 0 && falling(ao) ? "SELL" : "NEUTRAL"),
    row("Momentum (10)", last(mom), rising(mom) ? "BUY" : falling(mom) ? "SELL" : "NEUTRAL"),
    row("MACD (12, 26)", macdV, macdV != null && sigV != null ? (macdV > sigV ? "BUY" : macdV < sigV ? "SELL" : "NEUTRAL") : null),
    row("Williams %R (14)", wrV, wrV != null && wrV < -80 && rising(wr) ? "BUY" : wrV != null && wrV > -20 && falling(wr) ? "SELL" : "NEUTRAL"),
    row("Bull Bear Power", bbpV, bbpV != null && bbpV > 0 && rising(bbp) ? "BUY" : bbpV != null && bbpV < 0 && falling(bbp) ? "SELL" : "NEUTRAL"),
    row("Ultimate Oscillator (7, 14, 28)", uoV, uoV != null && uoV > 70 ? "BUY" : uoV != null && uoV < 30 ? "SELL" : "NEUTRAL"),
  ];

  const vsPrice = (v: number | null): Signal => (v == null ? "NEUTRAL" : price > v ? "BUY" : price < v ? "SELL" : "NEUTRAL");
  const movingAverages: IndicatorRow[] = [];
  for (const n of [10, 20, 30, 50, 100, 200]) {
    const e = last(ema(closes, n));
    const s = last(sma(closes, n));
    movingAverages.push(row(`EMA (${n})`, e, vsPrice(e)), row(`SMA (${n})`, s, vsPrice(s)));
  }
  const vw = last(vwma(candles, 20));
  const hull = last(hma(closes, 9));
  movingAverages.push(row("VWMA (20)", vw, vsPrice(vw)), row("Hull MA (9)", hull, vsPrice(hull)));

  const osc = rate(oscillators);
  const ma = rate(movingAverages);
  const summary = osc && ma ? (() => {
    const score = (osc.score + ma.score) / 2;
    return { score, label: labelOf(score), buy: osc.buy + ma.buy, sell: osc.sell + ma.sell, neutral: osc.neutral + ma.neutral };
  })() : osc ?? ma;
  return { oscillators, movingAverages, osc, ma, summary };
}

// ---------------------------------------------------------------- pivots and statistics

export interface Pivots { r3: number; r2: number; r1: number; p: number; s1: number; s2: number; s3: number }

/** Classic pivot points from one finished bar (e.g. yesterday) */
export function pivots(bar: Pick<Candle, "high" | "low" | "close"> | undefined): Pivots | null {
  if (!bar) return null;
  const { high: h, low: l, close: c } = bar;
  const p = (h + l + c) / 3;
  return { r3: h + 2 * (p - l), r2: p + (h - l), r1: 2 * p - l, p, s1: 2 * p - h, s2: p - (h - l), s3: l - 2 * (h - p) };
}

const DAY = 86_400;

/** The close on or just before `time` (daily candles, oldest first) */
function closeAt(daily: Candle[], time: number): number | null {
  let found: Candle | null = null;
  for (const c of daily) {
    if (c.time > time) break;
    found = c;
  }
  return found?.close ?? null;
}

export const PERFORMANCE_PERIODS = [
  { key: "1W", label: "1 minggu", days: 7 },
  { key: "1M", label: "1 bulan", days: 30 },
  { key: "3M", label: "3 bulan", days: 91 },
  { key: "6M", label: "6 bulan", days: 182 },
  { key: "YTD", label: "Sejak awal tahun", days: null },
  { key: "1Y", label: "1 tahun", days: 365 },
] as const;

export interface DailyStats {
  /** Percent change for each PERFORMANCE_PERIODS key */
  performance: Record<string, number | null>;
  yearHigh: number | null;
  yearLow: number | null;
  /** Average volume of the last 30 bars */
  avgVolume30: number | null;
  /** Annualised volatility of daily returns over 30 bars, in percent */
  volatility30: number | null;
  /** Highest high in all the loaded history */
  highestHigh: number | null;
}

/** Statistics from daily candles and the live price; `crypto` trades every day (365 days a year) */
export function dailyStats(daily: Candle[], price: number | null, crypto: boolean): DailyStats {
  const now = daily.at(-1)?.time ?? Math.floor(Date.now() / 1000);
  const p = price ?? daily.at(-1)?.close ?? null;
  const change = (from: number | null) => (p != null && from ? ((p - from) / from) * 100 : null);
  const performance: Record<string, number | null> = {};
  const enough = (days: number) => daily.length > 0 && daily[0].time <= now - days * DAY + DAY;
  for (const period of PERFORMANCE_PERIODS) {
    if (period.days == null) {
      const year = new Date(now * 1000).getFullYear();
      const startOfYear = Date.UTC(year, 0, 1) / 1000;
      performance[period.key] = daily.length && daily[0].time < startOfYear ? change(closeAt(daily, startOfYear - 1)) : null;
    } else {
      performance[period.key] = enough(period.days) ? change(closeAt(daily, now - period.days * DAY)) : null;
    }
  }
  const year = daily.filter((c) => c.time > now - 365 * DAY);
  const recent = daily.slice(-31);
  const returns = recent.slice(1).map((c, i) => Math.log(c.close / recent[i].close)).filter(Number.isFinite);
  const mean = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(returns.length - 1, 1);
  const volumes = daily.slice(-30).map((c) => c.volume).filter((v) => v > 0);
  return {
    performance,
    yearHigh: year.length ? Math.max(...year.map((c) => c.high)) : null,
    yearLow: year.length ? Math.min(...year.map((c) => c.low)) : null,
    avgVolume30: volumes.length ? volumes.reduce((a, b) => a + b, 0) / volumes.length : null,
    volatility30: returns.length >= 10 ? Math.sqrt(variance) * Math.sqrt(crypto ? 365 : 252) * 100 : null,
    highestHigh: daily.length ? Math.max(...daily.map((c) => c.high)) : null,
  };
}
