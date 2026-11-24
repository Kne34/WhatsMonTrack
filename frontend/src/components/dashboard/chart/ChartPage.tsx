"use client";

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Camera, ChartArea, ChartCandlestick, ChartLine, ChartNoAxesColumn, Check, ChevronDown, CircleAlert, Crosshair,
  Magnet, Maximize, Minimize, Minus, PanelRightClose, PanelRightOpen, Pencil, RotateCcw, Ruler, Trash2, TrendingUp, X, ZoomIn, ZoomOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCompact } from "@/lib/format";
import { ASSET_TYPE_LABEL, formatPercent, type Candle, type ChartInterval, type Holding, type MarketPrices, type TradeSide } from "@/lib/portfolio";
import {
  RATING_TEXT, bollinger, dailyStats, ema, macd, pivots as classicPivots, rsi, sma, technicals, type DailyStats, type Technicals,
} from "@/lib/technicals";
import { Skeleton } from "../../common/ui";
import { TradingChart, TV, type ChartStyle, type HistSpec, type LineSpec, type ScaleMode, type Tool, type TradingChartHandle } from "./TradingChart";
import { Avatar, Details, Watchlist, plain, signedPlain, techIntervalLabel } from "./SidePanel";
import { useHistory, useProfile } from "./useMarketData";

// ---------------------------------------------------------------- options

const INTERVALS: { value: ChartInterval; label: string; title: string; seconds: number | null }[] = [
  { value: "5m", label: "5m", title: "5 menit", seconds: 300 },
  { value: "15m", label: "15m", title: "15 menit", seconds: 900 },
  { value: "1h", label: "1j", title: "1 jam", seconds: 3600 },
  { value: "4h", label: "4j", title: "4 jam", seconds: 14_400 },
  { value: "1D", label: "D", title: "Harian", seconds: 86_400 },
  { value: "1W", label: "W", title: "Mingguan", seconds: null },
  { value: "1M", label: "M", title: "Bulanan", seconds: null },
];

/** The range buttons under the chart pick an interval and show that span, as on TradingView */
const RANGES: { key: string; label: string; title: string; interval: ChartInterval; days: number | "ytd" | "all" }[] = [
  { key: "1D", label: "1H", title: "1 hari", interval: "5m", days: 1 },
  { key: "5D", label: "5H", title: "5 hari", interval: "15m", days: 5 },
  { key: "1M", label: "1B", title: "1 bulan", interval: "1h", days: 30 },
  { key: "3M", label: "3B", title: "3 bulan", interval: "4h", days: 91 },
  { key: "6M", label: "6B", title: "6 bulan", interval: "1D", days: 182 },
  { key: "YTD", label: "YTD", title: "Sejak awal tahun", interval: "1D", days: "ytd" },
  { key: "1Y", label: "1T", title: "1 tahun", interval: "1D", days: 365 },
  { key: "5Y", label: "5T", title: "5 tahun", interval: "1W", days: 1826 },
  { key: "ALL", label: "Semua", title: "Semua data", interval: "1M", days: "all" },
];

const STYLES: { value: ChartStyle; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "candle", label: "Candle", icon: ChartCandlestick },
  { value: "hollow", label: "Candle kosong", icon: ChartCandlestick },
  { value: "heikin", label: "Heikin Ashi", icon: ChartCandlestick },
  { value: "bar", label: "Bar", icon: ChartNoAxesColumn },
  { value: "line", label: "Garis", icon: ChartLine },
  { value: "area", label: "Area", icon: ChartArea },
];

type IndicatorId = "vol" | "ma20" | "ma50" | "ma200" | "ema20" | "bb" | "rsi" | "macd";
const INDICATORS: { id: IndicatorId; label: string; short: string; color: string; description: string }[] = [
  { id: "vol", label: "Volume", short: "Vol", color: TV.up, description: "Jumlah yang diperdagangkan per bar" },
  { id: "ma20", label: "Moving Average 20", short: "MA 20", color: "#2962FF", description: "Rata-rata harga 20 bar" },
  { id: "ma50", label: "Moving Average 50", short: "MA 50", color: "#FF6D00", description: "Tren menengah" },
  { id: "ma200", label: "Moving Average 200", short: "MA 200", color: "#E91E63", description: "Tren jangka panjang" },
  { id: "ema20", label: "EMA 20", short: "EMA 20", color: "#00BCD4", description: "Rata-rata yang lebih cepat bereaksi" },
  { id: "bb", label: "Bollinger Bands (20, 2)", short: "BB 20 2", color: "#2196F3", description: "Pita volatilitas di sekitar MA 20" },
  { id: "rsi", label: "RSI (14)", short: "RSI 14", color: "#7E57C2", description: "Jenuh beli di atas 70, jenuh jual di bawah 30" },
  { id: "macd", label: "MACD (12, 26, 9)", short: "MACD 12 26 9", color: "#2962FF", description: "Momentum: garis MACD melawan sinyal" },
];

const DAY = 86_400;

/** Small preferences remembered in this browser; never needed for the page to work */
function usePref<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage is read after hydration
      if (saved != null) setValue(JSON.parse(saved));
    } catch {
      // storage blocked: keep the default
    }
  }, [key]);
  const set = useCallback((v: T) => {
    setValue(v);
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      // not remembered
    }
  }, [key]);
  return [value, set];
}

// ---------------------------------------------------------------- analysis text

function analysisFacts({ holding, live, pct, stats, daily, tech, techLabel, profileVolume, currency, avgInDisplay }: {
  holding: Holding;
  live: number | null;
  pct: number | null;
  stats: DailyStats | null;
  daily: Candle[];
  tech: Technicals | null;
  techLabel: string;
  profileVolume: number | null;
  currency: string;
  avgInDisplay: number | null;
}): string[] {
  const facts: string[] = [];
  const crypto = holding.assetType === "CRYPTO";
  const pctText = (v: number) => formatPercent(Math.abs(v)).replace(/^[+−]/, "");
  if (live != null && pct != null) {
    facts.push(`${holding.symbol} ${pct >= 0 ? "naik" : "turun"} ${pctText(pct)} ${crypto ? "dalam 24 jam" : "hari ini"} ke ${plain(live, currency)} ${currency}.`);
  }
  if (live != null && stats?.yearHigh && stats.yearLow) {
    const fromHigh = ((stats.yearHigh - live) / stats.yearHigh) * 100;
    const fromLow = ((live - stats.yearLow) / stats.yearLow) * 100;
    facts.push(fromHigh < 3
      ? `Harga dekat tertinggi 52 minggu (${plain(stats.yearHigh, currency)}).`
      : `Harga ${pctText(fromHigh)} di bawah tertinggi 52 minggu dan ${pctText(fromLow)} di atas terendahnya.`);
  }
  if (live != null && daily.length >= 200) {
    const closes = daily.map((c) => c.close);
    const ma50 = sma(closes, 50).at(-1);
    const ma200 = sma(closes, 200).at(-1);
    if (ma50 != null && ma200 != null) {
      const above50 = live > ma50;
      const above200 = live > ma200;
      facts.push(
        above50 && above200 ? "Di atas MA 50 dan MA 200 harian: tren naik."
          : !above50 && !above200 ? "Di bawah MA 50 dan MA 200 harian: tren turun."
            : above50 ? "Di atas MA 50 tetapi masih di bawah MA 200 harian: mulai pulih dalam tren turun."
              : "Di bawah MA 50 tetapi masih di atas MA 200 harian: koreksi dalam tren naik.",
      );
    }
  }
  if (daily.length > 20) {
    const r = rsi(daily.map((c) => c.close)).at(-1);
    if (r != null) {
      const v = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(r);
      facts.push(r >= 70 ? `RSI harian ${v}: jenuh beli, rawan koreksi.` : r <= 30 ? `RSI harian ${v}: jenuh jual, bisa memantul.` : `RSI harian ${v}: netral.`);
    }
  }
  if (profileVolume && stats?.avgVolume30) {
    const ratio = profileVolume / stats.avgVolume30;
    if (ratio >= 1.5 || ratio <= 0.5) {
      facts.push(`Volume ${crypto ? "24 jam" : "hari ini"} ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(ratio)} kali rata-rata 30 hari${ratio >= 1.5 ? ": minat sedang tinggi" : ": pasar sepi"}.`);
    }
  }
  if (tech?.summary) facts.push(`Ringkasan teknikal ${techLabel}: ${RATING_TEXT[tech.summary.label]} (${tech.summary.buy} beli, ${tech.summary.sell} jual).`);
  if (live != null && avgInDisplay) {
    const p = ((live - avgInDisplay) / avgInDisplay) * 100;
    facts.push(`Posisi Anda ${p >= 0 ? "untung" : "rugi"} ${pctText(p)} dari harga rata-rata beli.`);
  }
  return facts;
}

// ---------------------------------------------------------------- the page

/**
 * The chart page of one holding, laid out like TradingView: toolbar on top, drawing tools on the
 * left, the chart with its legend, ranges and clock at the bottom, and on the right the watchlist
 * (all holdings) and the details and analysis of this asset.
 */
export function ChartPage({ holdings, prices, holdingId, onBack, onSelect, onTrade, onEdit }: {
  holdings: Holding[] | null;
  prices: MarketPrices | null;
  holdingId: string;
  onBack: () => void;
  onSelect: (h: Holding) => void;
  onTrade: (h: Holding, side: TradeSide) => void;
  onEdit: (h: Holding) => void;
}) {
  const holding = holdings?.find((h) => h.id === holdingId);
  if (!holdings) {
    return (
      <div className="flex h-dvh flex-col gap-1 bg-background p-1">
        <Skeleton className="h-11 w-full" />
        <div className="flex min-h-0 flex-1 gap-1"><Skeleton className="flex-1" /><Skeleton className="hidden w-80 lg:block" /></div>
      </div>
    );
  }
  if (!holding) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <CircleAlert className="size-6 text-warning" aria-hidden />
        <p className="text-sm text-muted-foreground">Aset ini tidak ada (mungkin sudah dihapus).</p>
        <button type="button" onClick={onBack} className="text-sm font-medium underline">Kembali ke Investasi</button>
      </div>
    );
  }
  return <Terminal holding={holding} holdings={holdings} prices={prices} onBack={onBack} onSelect={onSelect} onTrade={onTrade} onEdit={onEdit} />;
}

function Terminal({ holding, holdings, prices, onBack, onSelect, onTrade, onEdit }: {
  holding: Holding;
  holdings: Holding[];
  prices: MarketPrices | null;
  onBack: () => void;
  onSelect: (h: Holding) => void;
  onTrade: (h: Holding, side: TradeSide) => void;
  onEdit: (h: Holding) => void;
}) {
  const [interval, setIntervalPref] = usePref<ChartInterval>("wmt-chart-interval", "1D");
  const [style, setStyle] = usePref<ChartStyle>("wmt-chart-style", "candle");
  const [indicators, setIndicators] = usePref<IndicatorId[]>("wmt-chart-indicators", ["vol"]);
  const [panelOpen, setPanelOpen] = usePref("wmt-chart-panel", true);
  const [techInterval, setTechInterval] = usePref<ChartInterval>("wmt-chart-tech", "1D");
  const [range, setRange] = useState<string | null>(null);
  const [viewNonce, setViewNonce] = useState(0);
  const [tool, setTool] = useState<Tool>("cross");
  const [magnet, setMagnet] = useState(false);
  const [scaleMode, setScaleMode] = useState<ScaleMode>("normal");
  const [showAvg, setShowAvg] = useState(true);
  const [drawingCount, setDrawingCount] = useState(0);
  const [inIdr, setInIdr] = useState(holding.currency === "IDR");
  const [fullscreen, setFullscreen] = useState(false);
  const chartRef = useRef<TradingChartHandle>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const chart = useHistory(holding.id, interval);
  const daily = useHistory(holding.id, "1D");
  const techHistory = useHistory(holding.id, techInterval);
  const profile = useProfile(holding.id).data;

  // A new asset starts in its own currency (rupiah for a rupiah holding)
  const [shownFor, setShownFor] = useState(holding.id);
  if (shownFor !== holding.id) {
    setShownFor(holding.id);
    setInIdr(holding.currency === "IDR");
    setRange(null);
  }

  // ---- currency: the asset's own (USD for crypto and US stocks), or rupiah
  const fx = prices?.fx?.price ?? null;
  const native = chart.data?.currency ?? profile?.currency ?? (holding.assetType === "IDX_STOCK" ? "IDR" : "USD");
  const toIdr = native === "USD" && inIdr && fx != null;
  const currency = toIdr ? "IDR" : native;
  const k = toIdr ? fx! : 1;
  const quote = prices?.prices[holding.priceKey];
  const liveNative = quote ? (quote.currency === native ? quote.price : fx ? (quote.currency === "USD" ? quote.price * fx : quote.price / fx) : null) : null;
  const live = liveNative != null ? liveNative * k : null;
  const avgInDisplay = holding.currency === currency ? holding.avgPrice : fx ? (holding.currency === "USD" ? holding.avgPrice * fx : holding.avgPrice / fx) : null;
  const market = profile?.market ?? (holding.assetType === "CRYPTO" ? "ALWAYS" : null);

  const convert = useCallback((candles: Candle[]) => (k === 1 ? candles : candles.map((c) => ({ ...c, open: c.open * k, high: c.high * k, low: c.low * k, close: c.close * k }))), [k]);

  // ---- bars on the chart: the history, with the last bar following the live price
  const fetchedAt = prices?.fetchedAt;
  const bars = useMemo(() => {
    const base = convert(chart.data?.candles ?? []);
    if (!base.length || live == null) return base;
    const last = base[base.length - 1];
    const seconds = INTERVALS.find((i) => i.value === interval)?.seconds ?? null;
    const now = fetchedAt ? Date.parse(fetchedAt) / 1000 : last.time;
    if (seconds && seconds < DAY && market !== "CLOSED" && now >= last.time + seconds) {
      const time = Math.floor(now / seconds) * seconds;
      return [...base, { time, open: last.close, high: Math.max(last.close, live), low: Math.min(last.close, live), close: live, volume: 0 }];
    }
    return [...base.slice(0, -1), { ...last, close: live, high: Math.max(last.high, live), low: Math.min(last.low, live) }];
  }, [chart.data, convert, live, interval, market, fetchedAt]);

  // ---- indicators
  const { lines, hists } = useMemo(() => {
    const closes = bars.map((b) => b.close);
    const lines: LineSpec[] = [];
    const hists: HistSpec[] = [];
    const on = new Set(indicators);
    const def = (id: IndicatorId) => INDICATORS.find((i) => i.id === id)!;
    if (on.has("ma20")) lines.push({ id: "ma20", color: def("ma20").color, values: sma(closes, 20), pane: 0 });
    if (on.has("ma50")) lines.push({ id: "ma50", color: def("ma50").color, values: sma(closes, 50), pane: 0 });
    if (on.has("ma200")) lines.push({ id: "ma200", color: def("ma200").color, values: sma(closes, 200), pane: 0 });
    if (on.has("ema20")) lines.push({ id: "ema20", color: def("ema20").color, values: ema(closes, 20), pane: 0 });
    if (on.has("bb")) {
      const b = bollinger(closes);
      lines.push({ id: "bb-up", color: "#2196F3", values: b.upper, pane: 0 }, { id: "bb-mid", color: "#FF6D00", values: b.mid, pane: 0 }, { id: "bb-low", color: "#2196F3", values: b.lower, pane: 0 });
    }
    let pane = 1;
    if (on.has("rsi")) lines.push({ id: "rsi", color: def("rsi").color, values: rsi(closes), pane: pane++, levels: [70, 30] });
    if (on.has("macd")) {
      const m = macd(closes);
      hists.push({ id: "macd-hist", values: m.hist, pane });
      lines.push({ id: "macd", color: "#2962FF", values: m.line, pane }, { id: "macd-signal", color: "#FF6D00", values: m.signal, pane });
    }
    return { lines, hists };
  }, [bars, indicators]);

  // ---- analysis
  const dailyBars = useMemo(() => convert(daily.data?.candles ?? []), [daily.data, convert]);
  const stats = useMemo(() => (dailyBars.length ? dailyStats(dailyBars, live, holding.assetType === "CRYPTO") : null), [dailyBars, live, holding.assetType]);
  const techBars = useMemo(() => {
    const base = convert(techHistory.data?.candles ?? []);
    if (!base.length || live == null) return base;
    const last = base[base.length - 1];
    return [...base.slice(0, -1), { ...last, close: live, high: Math.max(last.high, live), low: Math.min(last.low, live) }];
  }, [techHistory.data, convert, live]);
  const tech = useMemo(() => (techBars.length > 30 ? technicals(techBars) : null), [techBars]);
  const pivots = useMemo(() => classicPivots(techBars.at(-2)), [techBars]);
  const facts = useMemo(
    () => analysisFacts({ holding, live, pct: quote?.changePct ?? null, stats, daily: dailyBars, tech, techLabel: techIntervalLabel(techInterval), profileVolume: profile?.volume ?? null, currency, avgInDisplay }),
    [holding, live, quote?.changePct, stats, dailyBars, tech, techInterval, profile?.volume, currency, avgInDisplay],
  );

  // ---- view: a range button shows its span, an interval the latest bars
  const loaded = chart.data != null && chart.key === `${holding.id}:${interval}`;
  const rangeDef = RANGES.find((r) => r.key === range) ?? null;
  const lastTime = bars.at(-1)?.time ?? 0;
  const from = !rangeDef ? null
    : rangeDef.days === "all" ? 0
      : rangeDef.days === "ytd" ? Date.UTC(new Date(lastTime * 1000).getFullYear(), 0, 1) / 1000
        : lastTime - rangeDef.days * DAY;
  const view = useMemo(() => ({ key: `${holding.id}|${interval}|${range ?? ""}|${viewNonce}|${loaded}`, from }), [holding.id, interval, range, viewNonce, loaded, from]);

  const chooseInterval = (i: ChartInterval) => { setIntervalPref(i); setRange(null); setViewNonce((n) => n + 1); };
  const chooseRange = (key: string) => {
    const r = RANGES.find((x) => x.key === key)!;
    setIntervalPref(r.interval);
    setRange(key);
    setViewNonce((n) => n + 1);
  };
  const toggleIndicator = (id: IndicatorId) => setIndicators(indicators.includes(id) ? indicators.filter((x) => x !== id) : [...indicators, id]);

  // Keyboard: Esc back to the cursor, Alt+R resets the view, + and - zoom
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [role=dialog]")) return;
      if (e.key === "Escape") setTool("cross");
      else if (e.altKey && e.key.toLowerCase() === "r") { e.preventDefault(); chartRef.current?.reset(); }
      else if (e.key === "+" || e.key === "=") chartRef.current?.zoom(0.8);
      else if (e.key === "-") chartRef.current?.zoom(1.25);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else rootRef.current?.requestFullscreen().catch(() => {});
  };
  const screenshot = () => {
    const canvas = chartRef.current?.screenshot();
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${holding.symbol}-${interval}-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
  };

  const seconds = INTERVALS.find((i) => i.value === interval)?.seconds ?? null;
  const barSeconds = seconds && (seconds < DAY || market === "ALWAYS") && market !== "CLOSED" ? seconds : null;
  const sessionEnd = !barSeconds && interval === "1D" && market === "OPEN" ? profile?.session?.end ?? null : null;
  const intervalTitle = INTERVALS.find((i) => i.value === interval)!.title;
  const styleDef = STYLES.find((s) => s.value === style)!;

  return (
    <div ref={rootRef} className="relative flex min-h-dvh flex-col bg-background text-foreground lg:h-dvh lg:min-h-0 lg:overflow-clip">
      {/* ---------------- top toolbar */}
      <header data-scroll-x className="relative flex h-12 shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-card px-2 [scrollbar-width:none]">
        <ToolbarButton label="Kembali ke Investasi" onClick={onBack}><ArrowLeft className="size-4" /></ToolbarButton>
        <SymbolMenu holding={holding} holdings={holdings} onSelect={onSelect} />
        <Divider />
        <div role="group" aria-label="Interval" className="flex items-center">
          {INTERVALS.map((i) => (
            <button key={i.value} type="button" title={i.title} aria-label={i.title} aria-pressed={interval === i.value} onClick={() => chooseInterval(i.value)}
              className={cn("h-8 min-w-8 rounded-md px-1.5 text-sm font-medium transition-colors",
                interval === i.value ? "text-[#2962FF] bg-[#2962FF]/10" : "text-foreground hover:bg-muted")}>
              {i.label}
            </button>
          ))}
        </div>
        <Divider />
        <Dropdown label={`Jenis chart: ${styleDef.label}`} trigger={<styleDef.icon className="size-4" />}>
          {(close) => STYLES.map((s) => (
            <DropdownItem key={s.value} selected={style === s.value} onClick={() => { setStyle(s.value); close(); }} icon={<s.icon className="size-4" />}>{s.label}</DropdownItem>
          ))}
        </Dropdown>
        <Dropdown label="Indikator" trigger={<span className="flex items-center gap-1.5 text-sm font-medium"><ChartLine className="size-4" /> <span className="hidden sm:inline">Indikator</span></span>} wide>
          {() => (
            <>
              <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Indikator</p>
              {INDICATORS.map((ind) => (
                <DropdownItem key={ind.id} selected={indicators.includes(ind.id)} onClick={() => toggleIndicator(ind.id)} description={ind.description}
                  icon={<span className="mt-1 block h-0.5 w-4 rounded" style={{ background: ind.color }} />}>
                  {ind.label}
                </DropdownItem>
              ))}
              <div className="my-1 border-t border-border" />
              <DropdownItem selected={showAvg} onClick={() => setShowAvg(!showAvg)} description="Garis putus-putus di harga rata-rata Anda"
                icon={<span className="mt-1 block h-0 w-4 border-t border-dashed border-foreground" />}>
                Harga rata-rata beli
              </DropdownItem>
            </>
          )}
        </Dropdown>
        {native === "USD" && fx != null && (
          <>
            <Divider />
            <div role="group" aria-label="Mata uang chart" className="flex items-center rounded-md bg-muted p-0.5">
              {(["USD", "IDR"] as const).map((c) => (
                <button key={c} type="button" aria-pressed={currency === c} onClick={() => setInIdr(c === "IDR")}
                  className={cn("rounded px-2 py-1 text-xs font-medium transition-colors", currency === c ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  {c}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="ml-auto flex items-center gap-1 pl-2">
          <ToolbarButton label="Simpan gambar chart" onClick={screenshot} className="max-sm:hidden"><Camera className="size-4" /></ToolbarButton>
          <ToolbarButton label={fullscreen ? "Keluar layar penuh" : "Layar penuh"} onClick={toggleFullscreen} className="max-sm:hidden">
            {fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
          </ToolbarButton>
          <ToolbarButton label={panelOpen ? "Tutup panel samping" : "Buka panel samping"} onClick={() => setPanelOpen(!panelOpen)} className="max-lg:hidden">
            {panelOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
          </ToolbarButton>
          <button type="button" onClick={() => onEdit(holding)} aria-label={`Ubah ${holding.symbol}`}
            className="ml-1 inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-sm font-medium hover:bg-muted">
            <Pencil className="size-3.5" aria-hidden /> <span className="max-sm:hidden">Ubah</span>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-1 p-1 lg:flex-row">
        {/* ---------------- drawing tools */}
        <nav aria-label="Alat gambar" className="hidden w-11 shrink-0 flex-col items-center gap-0.5 rounded-md bg-card py-1 lg:flex">
          {([
            ["cross", "Kursor (Esc)", Crosshair],
            ["trend", "Garis tren: klik dua titik", TrendingUp],
            ["hline", "Garis horizontal: klik satu harga", Minus],
            ["measure", "Ukur: klik awal dan akhir", Ruler],
          ] as const).map(([value, label, Icon]) => (
            <RailButton key={value} label={label} active={tool === value} onClick={() => setTool(value)}><Icon className="size-[18px]" /></RailButton>
          ))}
          <RailButton label={magnet ? "Magnet nyala: menempel ke harga buka, tertinggi, terendah, tutup" : "Magnet"} active={magnet} onClick={() => setMagnet(!magnet)}>
            <Magnet className="size-[18px]" />
          </RailButton>
          <span className="my-1 h-px w-6 bg-border" aria-hidden />
          <RailButton label="Perbesar (+)" onClick={() => chartRef.current?.zoom(0.8)}><ZoomIn className="size-[18px]" /></RailButton>
          <RailButton label="Perkecil (−)" onClick={() => chartRef.current?.zoom(1.25)}><ZoomOut className="size-[18px]" /></RailButton>
          <RailButton label="Atur ulang tampilan (Alt+R)" onClick={() => chartRef.current?.reset()}><RotateCcw className="size-[18px]" /></RailButton>
          <span className="my-1 h-px w-6 bg-border" aria-hidden />
          <RailButton label={drawingCount ? `Hapus ${drawingCount} gambar` : "Belum ada gambar"} disabled={!drawingCount} onClick={() => chartRef.current?.clearDrawings()}>
            <Trash2 className="size-[18px]" />
          </RailButton>
        </nav>

        {/* ---------------- chart */}
        <main className="flex h-[68dvh] min-h-[420px] min-w-0 flex-col overflow-clip rounded-md bg-card lg:h-auto lg:min-h-0 lg:flex-1">
          <div className="relative min-h-0 flex-1" role="region" aria-label={`Chart ${holding.symbol}, ${intervalTitle}`}>
            {loaded && bars.length > 0 && (
              <ChartView
                chartRef={chartRef} holding={holding} bars={bars} style={style} currency={currency} indicators={indicators}
                lines={lines} hists={hists} avgPrice={showAvg ? avgInDisplay : null} interval={interval} intervalTitle={intervalTitle}
                exchange={profile?.exchange ?? chart.data?.source ?? null} market={market} tool={tool} magnet={magnet} scaleMode={scaleMode}
                view={view} barSeconds={barSeconds} sessionEnd={sessionEnd} live={live}
                onToolDone={() => setTool("cross")} onDrawingsChange={setDrawingCount}
                onRemoveIndicator={(id) => setIndicators(indicators.filter((x) => x !== id))}
                onTrade={(side) => onTrade(holding, side)}
              />
            )}
            {!loaded && !chart.failed && <Skeleton className="absolute inset-2" />}
            {((loaded && bars.length === 0) || (chart.failed && !loaded)) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
                <CircleAlert className="size-5 text-warning" aria-hidden />
                {chart.failed ? "Chart gagal dimuat. Dicoba lagi otomatis." : `Belum ada data harga ${intervalTitle.toLowerCase()} untuk ${holding.symbol}.`}
              </div>
            )}
          </div>

          {/* ---------------- ranges, clock, scale */}
          <div data-scroll-x className="relative flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-t border-border px-2 text-xs [scrollbar-width:none]">
            <div role="group" aria-label="Rentang waktu" className="flex items-center">
              {RANGES.map((r) => (
                <button key={r.key} type="button" title={r.title} aria-pressed={range === r.key} onClick={() => chooseRange(r.key)}
                  className={cn("h-7 rounded px-2 font-medium transition-colors", range === r.key ? "bg-[#2962FF]/10 text-[#2962FF]" : "text-foreground hover:bg-muted")}>
                  {r.label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-1 pl-3">
              <Clock />
              <span className="mx-1 h-4 w-px bg-border" aria-hidden />
              {([["percent", "%", "Skala persen"], ["log", "log", "Skala logaritmik"]] as const).map(([mode, text, label]) => (
                <button key={mode} type="button" title={label} aria-label={label} aria-pressed={scaleMode === mode} onClick={() => setScaleMode(scaleMode === mode ? "normal" : mode)}
                  className={cn("h-7 rounded px-2 font-medium", scaleMode === mode ? "bg-[#2962FF]/10 text-[#2962FF]" : "text-foreground hover:bg-muted")}>
                  {text}
                </button>
              ))}
              <button type="button" title="Skala otomatis dan tampilan awal" onClick={() => { setScaleMode("normal"); chartRef.current?.reset(); }}
                className="h-7 rounded px-2 font-medium text-foreground hover:bg-muted">
                auto
              </button>
            </div>
          </div>
        </main>

        {/* ---------------- watchlist and details */}
        <aside aria-label="Daftar pantau dan detail aset"
            className={cn("relative flex min-h-0 shrink-0 flex-col overflow-clip rounded-md bg-card lg:w-[340px]", !panelOpen && "lg:hidden")}>
            <div className="relative max-h-64 shrink-0 overflow-clip border-b border-border lg:max-h-[38%] lg:[&>div]:h-full">
              <Watchlist holdings={holdings} prices={prices} activeId={holding.id} onSelect={onSelect} />
            </div>
            <div className="relative min-h-0 overflow-y-auto lg:flex-1">
              <Details
                holding={holding} holdings={holdings} prices={prices} profile={profile} k={k} currency={currency} live={live}
                stats={stats} tech={tech} techInterval={techInterval} onTechInterval={setTechInterval} pivots={pivots} facts={facts}
                onTrade={(side) => onTrade(holding, side)}
              />
            </div>
          </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- chart with its legend

const ChartView = memo(function ChartView({
  chartRef, holding, bars, style, currency, indicators, lines, hists, avgPrice, interval, intervalTitle, exchange, market, tool, magnet,
  scaleMode, view, barSeconds, sessionEnd, live, onToolDone, onDrawingsChange, onRemoveIndicator, onTrade,
}: {
  chartRef: React.RefObject<TradingChartHandle | null>;
  holding: Holding;
  bars: Candle[];
  style: ChartStyle;
  currency: string;
  indicators: IndicatorId[];
  lines: LineSpec[];
  hists: HistSpec[];
  avgPrice: number | null;
  interval: ChartInterval;
  intervalTitle: string;
  exchange: string | null;
  market: "OPEN" | "CLOSED" | "ALWAYS" | null;
  tool: Tool;
  magnet: boolean;
  scaleMode: ScaleMode;
  view: { key: string; from: number | null };
  barSeconds: number | null;
  sessionEnd: number | null;
  live: number | null;
  onToolDone: () => void;
  onDrawingsChange: (n: number) => void;
  onRemoveIndicator: (id: IndicatorId) => void;
  onTrade: (side: TradeSide) => void;
}) {
  // The legend follows the crosshair; kept here so the rest of the page doesn't re-render on every mouse move
  const [hover, setHover] = useState<number | null>(null);
  // Folded on phones, where the legend would cover the candles; the chevron opens it, as on TradingView
  const [legendOpen, setLegendOpen] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- screen size is known only in the browser
    if (window.matchMedia("(max-width: 639px)").matches) setLegendOpen(false);
  }, []);
  const i = hover ?? bars.length - 1;
  const bar = bars[i];
  const prev = bars[i - 1];
  const change = bar && prev ? bar.close - prev.close : null;
  const changePct = change != null && prev.close ? (change / prev.close) * 100 : null;
  const color = bar && bar.close >= bar.open ? TV.up : TV.down;
  const valueOf = (id: string) => lines.find((l) => l.id === id)?.values[i] ?? null;
  const fmt2 = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

  const legendRows: { id: IndicatorId; label: string; values: { v: number | null; color: string; price?: boolean }[] }[] = indicators
    .filter((id) => id !== "vol")
    .map((id) => {
      const def = INDICATORS.find((d) => d.id === id)!;
      if (id === "bb") return { id, label: def.short, values: [{ v: valueOf("bb-mid"), color: "#FF6D00", price: true }, { v: valueOf("bb-up"), color: "#2196F3", price: true }, { v: valueOf("bb-low"), color: "#2196F3", price: true }] };
      if (id === "macd") return { id, label: def.short, values: [{ v: hists[0]?.values[i] ?? null, color: TV.up }, { v: valueOf("macd"), color: "#2962FF" }, { v: valueOf("macd-signal"), color: "#FF6D00" }] };
      return { id, label: def.short, values: [{ v: valueOf(id), color: def.color, price: id !== "rsi" }] };
    });

  return (
    <div className="absolute inset-0">
      <TradingChart
        ref={chartRef} bars={bars} style={style} currency={currency} volume={indicators.includes("vol")} lines={lines} hists={hists}
        avgPrice={avgPrice} watermark={`${holding.symbol}, ${interval}`} tool={tool} magnet={magnet} scaleMode={scaleMode}
        storageKey={`wmt-draw:${holding.id}:${interval}`} view={view} barSeconds={barSeconds} sessionEnd={sessionEnd}
        onHover={setHover} onToolDone={onToolDone} onDrawingsChange={onDrawingsChange}
      />
      {/* Legend, top left, as on TradingView */}
      <div className="pointer-events-none absolute left-2 top-2 right-16 z-10 space-y-1 text-xs">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <Avatar symbol={holding.symbol} className="size-4 text-[9px]" />
          <span className="text-sm font-medium text-foreground sm:hidden">{holding.symbol}</span>
          <span className="text-sm font-medium text-foreground max-sm:hidden">{holding.name ?? holding.symbol}</span>
          <span className="text-muted-foreground">{intervalTitle}</span>
          {exchange && <span className="text-muted-foreground">{exchange}</span>}
          {market && (
            <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-px text-[11px] font-medium",
              market === "CLOSED" ? "bg-muted text-muted-foreground" : "bg-[#089981]/15 text-[#089981]")}>
              <span className={cn("size-1.5 rounded-full", market === "CLOSED" ? "bg-muted-foreground" : "bg-[#089981]")} aria-hidden />
              {market === "CLOSED" ? "Tutup" : market === "ALWAYS" ? "Buka 24 jam" : "Buka"}
            </span>
          )}
          {bar && (
            <span className="flex flex-wrap gap-x-2 tabular-nums">
              {([["B", bar.open], ["T", bar.high], ["R", bar.low], ["P", bar.close]] as const).map(([k, v]) => (
                <span key={k} title={{ B: "Buka", T: "Tertinggi", R: "Terendah", P: "Penutupan" }[k]}>
                  <span className="text-muted-foreground">{k}</span><span style={{ color }}>{plain(v, currency)}</span>
                </span>
              ))}
              {change != null && <span style={{ color }}>{signedPlain(change, currency)} ({formatPercent(changePct)})</span>}
            </span>
          )}
          <button type="button" onClick={() => setLegendOpen(!legendOpen)} aria-expanded={legendOpen}
            aria-label={legendOpen ? "Lipat legenda" : "Buka legenda"} title={legendOpen ? "Lipat legenda" : "Buka legenda"}
            className="pointer-events-auto rounded border border-border bg-card/80 p-0.5 text-muted-foreground hover:text-foreground">
            <ChevronDown className={cn("size-3.5 transition-transform", legendOpen && "rotate-180")} aria-hidden />
          </button>
        </div>
        {legendOpen && (<>

        {/* Sell / buy, as the buttons on TradingView's legend */}
        <div className="pointer-events-auto flex items-center gap-1">
          <button type="button" onClick={() => onTrade("SELL")}
            className="min-w-20 rounded border border-[#F23645] px-2 py-0.5 text-center leading-tight text-[#F23645] transition-colors hover:bg-[#F23645] hover:text-white">
            <span className="block text-xs font-medium tabular-nums">{live != null ? plain(live, currency) : "–"}</span>
            <span className="block text-[10px] font-semibold">JUAL</span>
          </button>
          <button type="button" onClick={() => onTrade("BUY")}
            className="min-w-20 rounded border border-[#2962FF] px-2 py-0.5 text-center leading-tight text-[#2962FF] transition-colors hover:bg-[#2962FF] hover:text-white">
            <span className="block text-xs font-medium tabular-nums">{live != null ? plain(live, currency) : "–"}</span>
            <span className="block text-[10px] font-semibold">BELI</span>
          </button>
          {holding.currency !== currency && <span className="ml-1 text-[11px] text-muted-foreground">dicatat dalam {holding.currency}</span>}
        </div>

        {indicators.includes("vol") && bar && bar.volume > 0 && (
          <p className="tabular-nums"><span className="text-muted-foreground">Vol </span><span style={{ color }}>{formatCompact(bar.volume)}</span></p>
        )}
        {legendRows.map((row) => (
          <p key={row.id} className="group pointer-events-auto flex w-fit items-center gap-1.5 tabular-nums">
            <span className="text-muted-foreground">{row.label}</span>
            {row.values.map((v, n) => (
              <span key={n} style={{ color: v.color }}>{v.v == null ? "–" : v.price ? plain(v.v, currency) : fmt2.format(v.v)}</span>
            ))}
            <button type="button" onClick={() => onRemoveIndicator(row.id)} aria-label={`Hapus ${row.label}`}
              className="rounded p-0.5 text-muted-foreground opacity-60 hover:bg-muted hover:text-foreground group-hover:opacity-100">
              <X className="size-3" aria-hidden />
            </button>
          </p>
        ))}
        </>)}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------- small pieces

/** The time on the viewer's clock, ticking, as at the bottom of TradingView */
function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the clock starts after hydration
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!now) return null;
  const offset = -now.getTimezoneOffset() / 60;
  return (
    <span className="whitespace-nowrap tabular-nums text-muted-foreground">
      {now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} UTC{offset >= 0 ? "+" : "−"}{Math.abs(offset)}
    </span>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />;
}

function ToolbarButton({ label, onClick, children, className }: { label: string; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted", className)}>
      {children}
    </button>
  );
}

function RailButton({ label, active, disabled, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} aria-pressed={active}
      className={cn("inline-flex size-9 items-center justify-center rounded-md transition-colors disabled:opacity-35",
        active ? "bg-[#2962FF]/12 text-[#2962FF]" : "text-foreground hover:bg-muted")}>
      {children}
    </button>
  );
}

/** A toolbar dropdown that stays open while choosing several items (indicators) */
function Dropdown({ label, trigger, children, wide }: { label: string; trigger: React.ReactNode; children: (close: () => void) => React.ReactNode; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div ref={ref} className="shrink-0">
      <button type="button" aria-label={label} title={label} aria-expanded={open} aria-haspopup="menu"
        onClick={(e) => {
          // The toolbar scrolls sideways on phones, so the menu is placed on the page, not inside it
          const r = e.currentTarget.getBoundingClientRect();
          setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - (wide ? 296 : 216))), top: r.bottom + 4 });
          setOpen(!open);
        }}
        className={cn("inline-flex h-8 items-center gap-0.5 rounded-md px-2 text-foreground transition-colors hover:bg-muted", open && "bg-muted")}>
        {trigger}
        <ChevronDown className="size-3 text-muted-foreground" aria-hidden />
      </button>
      {open && pos && (
        <div role="menu" style={{ left: pos.left, top: pos.top }}
          className={cn("fixed z-50 max-h-[70dvh] overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-lg", wide ? "w-72" : "w-52")}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function DropdownItem({ selected, onClick, icon, description, children }: { selected: boolean; onClick: () => void; icon?: React.ReactNode; description?: string; children: React.ReactNode }) {
  return (
    <button type="button" role="menuitemcheckbox" aria-checked={selected} onClick={onClick}
      className="flex w-full items-start gap-2.5 rounded-md px-3 py-2 text-left text-sm hover:bg-muted">
      <span className="flex w-4 shrink-0 justify-center pt-0.5 text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-foreground">{children}</span>
        {description && <span className="block text-xs text-muted-foreground">{description}</span>}
      </span>
      {selected && <Check className="mt-0.5 size-4 shrink-0 text-[#2962FF]" aria-hidden />}
    </button>
  );
}

/** The ticker button at the top left: switches to another holding */
function SymbolMenu({ holding, holdings, onSelect }: { holding: Holding; holdings: Holding[]; onSelect: (h: Holding) => void }) {
  return (
    <Dropdown label={`Ganti aset, sekarang ${holding.symbol}`} wide
      trigger={<span className="flex items-center gap-2 text-sm font-semibold"><Avatar symbol={holding.symbol} />{holding.symbol}</span>}>
      {(close) => holdings.map((h) => (
        <DropdownItem key={h.id} selected={h.id === holding.id} onClick={() => { close(); onSelect(h); }} icon={<Avatar symbol={h.symbol} className="size-4 text-[9px]" />}
          description={`${h.name ?? ASSET_TYPE_LABEL[h.assetType]}, ${h.platform}`}>
          {h.symbol}
        </DropdownItem>
      ))}
    </Dropdown>
  );
}
