"use client";

import React, { useState } from "react";
import { ChevronDown, ExternalLink, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCompact, formatDayMonth, formatTime } from "@/lib/format";
import {
  ASSET_TYPE_LABEL, ASSET_TYPES, currentPrice, formatMoney, formatPercent, formatQuantity, formatSigned, quantityUnit, valuate,
  type AssetProfile, type ChartInterval, type Holding, type MarketPrices,
} from "@/lib/portfolio";
import {
  PERFORMANCE_PERIODS, RATING_TEXT, SIGNAL_TEXT, type DailyStats, type Pivots, type Rating, type Technicals,
} from "@/lib/technicals";
import { LiveBadge } from "../liveBadge";
import { TV } from "./TradingChart";

const tone = (n: number | null | undefined) => (n == null || n === 0 ? "text-muted-foreground" : n > 0 ? "text-income" : "text-expense");
/** Change in money from a percentage: price - price / (1 + pct) */
const changeFromPct = (price: number, pct: number) => price - price / (1 + pct / 100);

export function Avatar({ symbol, className }: { symbol: string; className?: string }) {
  // A stable color per ticker, like the logos on TradingView
  const hues = ["#2962FF", "#F7931A", "#089981", "#9C27B0", "#E91E63", "#FF6D00", "#00897B", "#5C6BC0"];
  const color = hues[[...symbol].reduce((a, ch) => a + ch.charCodeAt(0), 0) % hues.length];
  return (
    <span aria-hidden className={cn("inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white", className)} style={{ background: color }}>
      {symbol.slice(0, 1)}
    </span>
  );
}

function Section({ title, children, className, action }: { title: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <section className={cn("border-t border-border px-4 py-4", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- watchlist

export function Watchlist({ holdings, prices, activeId, onSelect }: {
  holdings: Holding[];
  prices: MarketPrices | null;
  activeId: string;
  onSelect: (h: Holding) => void;
}) {
  const fx = prices?.fx?.price ?? null;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-baseline justify-between px-4 pb-2 pt-3">
        <h2 className="text-sm font-semibold">Daftar pantau</h2>
        <span className="text-xs text-muted-foreground">{holdings.length} aset</span>
      </div>
      <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
        {ASSET_TYPES.map((type) => {
          const rows = holdings.filter((h) => h.assetType === type);
          if (!rows.length) return null;
          return (
            <section key={type} aria-label={ASSET_TYPE_LABEL[type]}>
              <h3 className="sticky top-0 z-[1] bg-card/90 px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">{ASSET_TYPE_LABEL[type]}</h3>
              {rows.map((h) => {
                const quote = prices?.prices[h.priceKey];
                const price = currentPrice(h, quote, fx);
                const pct = quote?.changePct ?? null;
                const active = h.id === activeId;
                // Two lines, nothing cut short: the ticker and its name or platform, then the price and its change
                return (
                  <button key={h.id} type="button" onClick={() => onSelect(h)} aria-current={active ? "page" : undefined}
                    className={cn("flex w-full items-center gap-3 px-4 py-2 text-left text-xs tabular-nums transition-colors hover:bg-muted",
                      active && "bg-[#2962FF]/8 shadow-[inset_2px_0_0_#2962FF]")}>
                    <Avatar symbol={h.symbol} className="size-7 text-xs" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-foreground">{h.symbol}</span>
                      <span className="block break-words text-[11px] leading-snug text-muted-foreground">{h.name ? `${h.name}, ${h.platform}` : h.platform}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-medium text-foreground">{price != null ? plain(price, h.currency) : "–"} <span className="font-normal text-muted-foreground">{h.currency}</span></span>
                      <span className={cn("block text-[11px]", tone(pct))}>
                        {price != null && pct != null ? `${signedPlain(changeFromPct(price, pct), h.currency)} (${formatPercent(pct)})` : "–"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- details

const nf = (max: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: max });
/** A price without the currency sign, as on the chart: 60.389,33 / 5.775 / 0,00000912 */
export function plain(v: number, currency: string) {
  if (Math.abs(v) > 0 && Math.abs(v) < 1) return new Intl.NumberFormat("id-ID", { maximumSignificantDigits: 4 }).format(v);
  return nf(currency === "USD" ? 2 : 0).format(v);
}
export const signedPlain = (v: number, currency: string) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${plain(Math.abs(v), currency)}`;

/** Low, high and where the price is between them */
function RangeBar({ label, low, high, value, currency }: { label: string; low: number | null; high: number | null; value: number | null; currency: string }) {
  if (low == null || high == null) return null;
  const pos = value != null && high > low ? Math.min(100, Math.max(0, ((value - low) / (high - low)) * 100)) : null;
  return (
    <div>
      <p className="mb-1.5 text-xs text-muted-foreground">{label}</p>
      <div className="relative h-1 rounded-full bg-muted">
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pos ?? 0}%`, background: TV.blue }} />
        {pos != null && <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card" style={{ left: `${pos}%`, background: TV.blue }} />}
      </div>
      <div className="mt-1.5 flex justify-between text-xs tabular-nums text-foreground">
        <span>{plain(low, currency)}</span>
        <span>{plain(high, currency)}</span>
      </div>
    </div>
  );
}

/** A label and its value; a long value wraps, and the second value goes under the first instead of squeezing beside it */
function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-xs">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right font-medium tabular-nums text-foreground [overflow-wrap:anywhere]">
        {value}
        {sub && <span className="block text-[11px] font-normal text-muted-foreground">{sub}</span>}
      </dd>
    </div>
  );
}

const RATING_COLOR = (r: Rating | null) =>
  !r ? "var(--muted-foreground)" : r.label.includes("BUY") ? TV.blue : r.label.includes("SELL") ? TV.down : "var(--muted-foreground)";

/** TradingView's speedometer: the needle points from "Jual kuat" (left) to "Beli kuat" (right) */
function Gauge({ title, rating, big }: { title: string; rating: Rating | null; big?: boolean }) {
  const size = big ? 200 : 130;
  const r = size / 2 - 12;
  const cx = size / 2;
  const cy = size / 2 + 2;
  const arc = (from: number, to: number) => {
    const a1 = Math.PI * (1 - from);
    const a2 = Math.PI * (1 - to);
    return `M ${cx + r * Math.cos(a1)} ${cy - r * Math.sin(a1)} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(a2)} ${cy - r * Math.sin(a2)}`;
  };
  const segments = [
    { from: 0, to: 0.19, color: TV.down },
    { from: 0.21, to: 0.39, color: `${TV.down}80` },
    { from: 0.41, to: 0.59, color: "var(--muted-foreground)" },
    { from: 0.61, to: 0.79, color: `${TV.blue}80` },
    { from: 0.81, to: 1, color: TV.blue },
  ];
  const t = rating ? (rating.score + 1) / 2 : 0.5;
  const angle = Math.PI * (1 - t);
  const needle = r - 10;
  return (
    <figure className="flex flex-col items-center" role="img"
      aria-label={rating ? `${title}: ${RATING_TEXT[rating.label]}, ${rating.buy} beli, ${rating.neutral} netral, ${rating.sell} jual` : `${title}: data belum cukup`}>
      <figcaption className={cn("font-medium text-foreground", big ? "text-sm" : "text-xs")}>{title}</figcaption>
      <svg width={size} height={size / 2 + 10} viewBox={`0 0 ${size} ${size / 2 + 10}`} aria-hidden>
        {segments.map((s) => (
          <path key={s.from} d={arc(s.from, s.to)} stroke={s.color} strokeWidth={big ? 8 : 6} fill="none" strokeLinecap="round" opacity={0.9} />
        ))}
        {rating && (
          <>
            <line x1={cx} y1={cy} x2={cx + needle * Math.cos(angle)} y2={cy - needle * Math.sin(angle)} stroke="var(--foreground)" strokeWidth={2} strokeLinecap="round" />
            <circle cx={cx} cy={cy} r={4} fill="var(--foreground)" />
          </>
        )}
      </svg>
      <p className={cn("-mt-1 font-semibold", big ? "text-lg" : "text-sm")} style={{ color: RATING_COLOR(rating) }}>
        {rating ? RATING_TEXT[rating.label] : "Data kurang"}
      </p>
      {rating && (
        <dl className="mt-1 grid grid-cols-3 gap-3 text-center text-[11px] tabular-nums">
          <div><dt className="text-muted-foreground">Jual</dt><dd className="font-medium text-foreground">{rating.sell}</dd></div>
          <div><dt className="text-muted-foreground">Netral</dt><dd className="font-medium text-foreground">{rating.neutral}</dd></div>
          <div><dt className="text-muted-foreground">Beli</dt><dd className="font-medium text-foreground">{rating.buy}</dd></div>
        </dl>
      )}
    </figure>
  );
}

const TECH_INTERVALS: { value: ChartInterval; label: string }[] = [
  { value: "1h", label: "1 jam" },
  { value: "4h", label: "4 jam" },
  { value: "1D", label: "1 hari" },
  { value: "1W", label: "1 minggu" },
  { value: "1M", label: "1 bulan" },
];

function IndicatorTable({ title, rows, currency }: { title: string; rows: Technicals["oscillators"]; currency?: string }) {
  return (
    <table className="w-full text-xs tabular-nums">
      <caption className="sr-only">{title}</caption>
      <thead>
        <tr className="text-left text-[11px] text-muted-foreground">
          <th className="py-1 font-normal">{title}</th><th className="py-1 text-right font-normal">Nilai</th><th className="py-1 pl-3 text-right font-normal">Aksi</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name} className="border-t border-border/60">
            <td className="py-1.5 pr-2 text-foreground">{r.name}</td>
            <td className="py-1.5 text-right text-foreground">{r.value == null ? "–" : currency ? plain(r.value, currency) : nf(2).format(r.value)}</td>
            <td className="py-1.5 pl-3 text-right font-medium" style={{ color: r.signal === "BUY" ? TV.blue : r.signal === "SELL" ? TV.down : "var(--muted-foreground)" }}>
              {r.signal ? SIGNAL_TEXT[r.signal] : "–"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export interface DetailsProps {
  holding: Holding;
  holdings: Holding[];
  prices: MarketPrices | null;
  profile: AssetProfile | null;
  /** Converts a price in the asset's own currency (profile, candles) to the shown one */
  k: number;
  currency: string;
  live: number | null;
  stats: DailyStats | null;
  tech: Technicals | null;
  techInterval: ChartInterval;
  onTechInterval: (i: ChartInterval) => void;
  pivots: Pivots | null;
  facts: string[];
  onTrade: (side: "BUY" | "SELL") => void;
}

export function Details({ holding, holdings, prices, profile, k, currency, live, stats, tech, techInterval, onTechInterval, pivots, facts, onTrade }: DetailsProps) {
  const [allIndicators, setAllIndicators] = useState(false);
  const quote = prices?.prices[holding.priceKey];
  const pct = quote?.changePct ?? null;
  const conv = (v: number | null | undefined) => (v == null ? null : v * k);
  const crypto = holding.assetType === "CRYPTO";
  const v = valuate(holding, prices);
  const total = holdings.reduce((sum, h) => sum + (valuate(h, prices).valueIdr ?? 0), 0);
  const share = v.valueIdr != null && total > 0 ? (v.valueIdr / total) * 100 : null;
  const yearHigh = conv(profile?.yearHigh) ?? stats?.yearHigh ?? null;
  const yearLow = conv(profile?.yearLow) ?? stats?.yearLow ?? null;
  const ath = conv(profile?.allTimeHigh);
  const market = profile?.market;
  const volRatio = profile?.volume && stats?.avgVolume30 ? profile.volume / stats.avgVolume30 : null;

  return (
    <div>
      {/* Symbol header, as TradingView's "symbol details" */}
      <section className="border-t border-border px-4 py-4">
        <div className="flex items-center gap-2">
          <Avatar symbol={holding.symbol} className="size-7 text-xs" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{holding.symbol}</p>
            <p className="truncate text-xs text-muted-foreground">{profile?.name ?? holding.name ?? ASSET_TYPE_LABEL[holding.assetType]}</p>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {[profile?.exchange, crypto ? "Spot crypto" : ASSET_TYPE_LABEL[holding.assetType], `di ${holding.platform}`].filter(Boolean).join(", ")}
        </p>
        <p className="mt-3 flex items-baseline gap-1.5">
          <span className={cn("text-3xl font-semibold tracking-tight tabular-nums", tone(pct === 0 ? null : pct) === "text-muted-foreground" ? "text-foreground" : tone(pct))} aria-live="polite">
            {live != null ? plain(live, currency) : "–"}
          </span>
          <span className="text-xs font-medium text-muted-foreground">{currency}</span>
        </p>
        {live != null && pct != null && (
          <p className={cn("mt-0.5 text-sm font-medium tabular-nums", tone(pct))}>
            {signedPlain(changeFromPct(live, pct), currency)} {formatPercent(pct)}
            <span className="ml-1 font-normal text-muted-foreground">{crypto ? "24 jam" : "hari ini"}</span>
          </p>
        )}
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {market && (
            <span className={cn("inline-flex items-center gap-1.5", market === "CLOSED" ? "text-muted-foreground" : "text-income")}>
              <span className={cn("size-1.5 rounded-full", market === "CLOSED" ? "bg-muted-foreground" : "bg-income")} aria-hidden />
              {market === "OPEN" ? "Pasar buka" : market === "ALWAYS" ? "Pasar buka 24 jam" : "Pasar tutup"}
            </span>
          )}
          <LiveBadge stale={!!quote?.stale} at={quote?.updatedAt} known={!!quote} className="text-muted-foreground" />
        </p>
        {profile?.session && market !== "ALWAYS" && (
          <p className="mt-1 text-xs text-muted-foreground">
            Sesi reguler {formatTime(new Date(profile.session.start * 1000))} sampai {formatTime(new Date(profile.session.end * 1000))} (jam Anda)
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => onTrade("SELL")} className="rounded-md py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90" style={{ background: TV.down }}>Jual</button>
          <button type="button" onClick={() => onTrade("BUY")} className="rounded-md py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90" style={{ background: TV.blue }}>Beli</button>
        </div>

        {profile?.volume != null && (
          <div className="mt-4">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Volume{crypto ? " 24 jam" : ""}</span>
              <span className="text-muted-foreground">Rata-rata volume (30 hari)</span>
            </div>
            <div className="flex justify-between text-xs font-medium tabular-nums text-foreground">
              <span>{formatCompact(profile.volume)}</span>
              <span>{stats?.avgVolume30 != null ? formatCompact(stats.avgVolume30) : "–"}</span>
            </div>
            {volRatio != null && (
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted" role="img" aria-label={`Volume ${nf(1).format(volRatio)} kali rata-rata`}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, volRatio * 100)}%`, background: TV.blue }} />
              </div>
            )}
          </div>
        )}
      </section>

      {/* "Key facts": what the numbers say, written out */}
      {facts.length > 0 && (
        <section className="px-4 pb-4">
          <div className="rounded-lg border border-border bg-muted/50 p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Sparkles className="size-3.5" style={{ color: TV.blue }} aria-hidden /> Ringkasan analisis
            </p>
            <ul className="space-y-1 text-xs leading-relaxed text-foreground">
              {facts.map((f) => <li key={f}>{f}</li>)}
            </ul>
            <p className="mt-2 text-[11px] text-muted-foreground">Dihitung otomatis dari harga, bukan saran investasi.</p>
          </div>
        </section>
      )}

      <Section title="Posisi Anda">
        <dl>
          <Stat label="Jumlah" value={`${formatQuantity(holding.quantity)} ${quantityUnit(holding.assetType)}`} sub={holding.assetType === "IDX_STOCK" ? `${formatQuantity(v.units)} lembar` : undefined} />
          <Stat label="Harga rata-rata" value={formatMoney(holding.avgPrice, holding.currency)} />
          <Stat label="Modal" value={formatMoney(v.cost, holding.currency)} />
          <Stat label="Nilai pasar" value={formatMoney(v.value, holding.currency)} />
          <Stat label="Untung/rugi" value={<span className={tone(v.pnl)}>{formatSigned(v.pnl, holding.currency)}</span>} sub={<span className={tone(v.pnlPct)}>{formatPercent(v.pnlPct)}</span>} />
          {share != null && <Stat label="Porsi portofolio" value={`${nf(1).format(share)}%`} />}
        </dl>
      </Section>

      <Section title="Statistik utama">
        <div className="space-y-4">
          <RangeBar label={crypto ? "Rentang 24 jam" : "Rentang hari ini"} low={conv(profile?.dayLow)} high={conv(profile?.dayHigh)} value={live} currency={currency} />
          <RangeBar label="Rentang 52 minggu" low={yearLow} high={yearHigh} value={live} currency={currency} />
        </div>
        <dl className="mt-3">
          {profile?.previousClose != null && <Stat label={crypto ? "Harga 24 jam lalu" : "Penutupan sebelumnya"} value={plain(profile.previousClose * k, currency)} />}
          {yearHigh != null && live != null && <Stat label="Dari tertinggi 52 minggu" value={<span className={tone(live - yearHigh)}>{formatPercent(((live - yearHigh) / yearHigh) * 100)}</span>} />}
          {profile?.turnover != null && <Stat label="Nilai transaksi 24 jam" value={`${currency === "IDR" ? "Rp" : "US$"} ${formatCompact(profile.turnover * (currency === "IDR" ? k : 1))}`} />}
          {profile?.marketCap != null && <Stat label="Kapitalisasi pasar" value={`${currency === "IDR" ? "Rp" : "US$"} ${formatCompact(profile.marketCap * (currency === "IDR" ? k : 1))}`} sub={profile.rank ? `peringkat #${profile.rank}` : undefined} />}
          {profile?.circulatingSupply != null && <Stat label="Suplai beredar" value={formatCompact(profile.circulatingSupply)} sub={profile.maxSupply ? `dari ${formatCompact(profile.maxSupply)}` : undefined} />}
          {ath != null && (
            <Stat label="Tertinggi sepanjang masa" value={plain(ath, currency)}
              sub={profile?.allTimeHighDate ? new Date(profile.allTimeHighDate).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : undefined} />
          )}
          {ath != null && live != null && <Stat label="Dari tertinggi sepanjang masa" value={<span className={tone(live - ath)}>{formatPercent(((live - ath) / ath) * 100)}</span>} />}
          {stats?.volatility30 != null && <Stat label="Volatilitas 30 hari (tahunan)" value={`${nf(1).format(stats.volatility30)}%`} />}
        </dl>
      </Section>

      {stats && (
        <Section title="Kinerja">
          <div className="grid grid-cols-3 gap-1.5">
            {PERFORMANCE_PERIODS.map((p) => {
              const value = stats.performance[p.key];
              const bg = value == null ? "var(--muted)" : value >= 0 ? `${TV.up}22` : `${TV.down}22`;
              return (
                <div key={p.key} className="rounded-md px-2 py-2 text-center" style={{ background: bg }}>
                  <p className={cn("text-sm font-semibold tabular-nums", tone(value))}>{formatPercent(value)}</p>
                  <p className="text-[11px] text-muted-foreground">{p.label}</p>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      <Section title="Analisis teknikal">
        <div role="group" aria-label="Interval analisis" className="mb-4 flex flex-wrap gap-1">
          {TECH_INTERVALS.map((t) => (
            <button key={t.value} type="button" aria-pressed={techInterval === t.value} onClick={() => onTechInterval(t.value)}
              className={cn("rounded-md px-2 py-1 text-xs transition-colors", techInterval === t.value ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
              {t.label}
            </button>
          ))}
        </div>
        {tech ? (
          <>
            <Gauge title="Ringkasan" rating={tech.summary} big />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Gauge title="Osilator" rating={tech.osc} />
              <Gauge title="Moving average" rating={tech.ma} />
            </div>
            <button type="button" onClick={() => setAllIndicators((o) => !o)} aria-expanded={allIndicators}
              className="mt-4 flex w-full items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
              {allIndicators ? "Sembunyikan rincian" : "Lihat semua indikator"}
              <ChevronDown className={cn("size-3.5 transition-transform", allIndicators && "rotate-180")} aria-hidden />
            </button>
            {allIndicators && (
              <div className="mt-2 space-y-4">
                <IndicatorTable title="Osilator" rows={tech.oscillators} />
                <IndicatorTable title="Moving average" rows={tech.movingAverages} currency={currency} />
                {pivots && (
                  <table className="w-full text-xs tabular-nums">
                    <caption className="mb-1 text-left text-[11px] text-muted-foreground">Pivot klasik (dari bar {techIntervalLabel(techInterval)} sebelumnya)</caption>
                    <tbody>
                      {(["r3", "r2", "r1", "p", "s1", "s2", "s3"] as const).map((key) => (
                        <tr key={key} className="border-t border-border/60">
                          <td className="py-1.5 text-muted-foreground">{key === "p" ? "Pivot" : `${key[0] === "r" ? "Resisten" : "Support"} ${key[1]}`}</td>
                          <td className="py-1.5 text-right text-foreground">{plain(pivots[key], currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">Memuat data harga...</p>
        )}
      </Section>

      {(profile?.description || profile?.categories.length || profile?.homepage) && (
        <Section title="Tentang">
          {profile.description && <p className="text-xs leading-relaxed text-foreground">{profile.description}</p>}
          {profile.categories.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {profile.categories.map((c) => <li key={c} className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{c}</li>)}
            </ul>
          )}
          {profile.homepage && (
            <a href={profile.homepage} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-medium hover:underline" style={{ color: TV.blue }}>
              {profile.homepage.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")} <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
        </Section>
      )}

      <p className="border-t border-border px-4 py-3 text-[11px] text-muted-foreground">
        {profile?.sources.length ? `Data dari ${profile.sources.join(" dan ")}` : "Data dari Yahoo Finance, Binance dan CoinGecko"}
        {prices?.fetchedAt ? `, harga terakhir ${formatDayMonth(prices.fetchedAt)} ${formatTime(prices.fetchedAt)}` : ""}.
        {" "}Chart dibuat dengan{" "}
        <a href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
          TradingView Lightweight Charts
        </a>.
      </p>
    </div>
  );
}

export const techIntervalLabel = (i: ChartInterval) => TECH_INTERVALS.find((t) => t.value === i)?.label ?? i;
