"use client";

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Camera, ChartArea, ChartCandlestick, ChartLine, ChartNoAxesColumn, Check, ChevronDown, ChevronRight, CircleAlert,
  Eye, EyeOff, Lock, LockOpen, Magnet, Maximize, Minimize, PanelRightClose, PanelRightOpen, Pencil, PencilRuler, Plus, RotateCcw, Trash2, X, ZoomIn, ZoomOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCompact } from "@/lib/format";
import { ASSET_TYPE_LABEL, formatPercent, type Candle, type ChartInterval, type Holding, type MarketPrices, type TradeSide } from "@/lib/portfolio";
import {
  RATING_TEXT, bollinger, dailyStats, ema, macd, pivots as classicPivots, rsi, sma, technicals, type DailyStats, type Technicals,
} from "@/lib/technicals";
import { Button, Skeleton } from "../../common/ui";
import { menuSurface } from "../../common/select";
import { TradingChart, TV, type ChartStyle, type HistSpec, type LineSpec, type ScaleMode, type Tool, type TradingChartHandle } from "./TradingChart";
import { TOOLS, TOOL_GROUPS, TOOL_ICONS } from "./drawings";
import { Avatar, Details, Watchlist, plain, signedPlain, techIntervalLabel } from "./SidePanel";
import { useHistory, useProfile } from "./useMarketData";

import { locale, tr } from "@/lib/i18n";
// ---------------------------------------------------------------- options

const INTERVALS: { value: ChartInterval; title: string; seconds: number | null }[] = [
  { value: "5m", get title() { return tr("5 menit"); }, seconds: 300 },
  { value: "15m", get title() { return tr("15 menit"); }, seconds: 900 },
  { value: "1h", get title() { return tr("1 jam"); }, seconds: 3600 },
  { value: "4h", get title() { return tr("4 jam"); }, seconds: 14_400 },
  { value: "1D", get title() { return tr("Harian"); }, seconds: 86_400 },
  { value: "1W", get title() { return tr("Mingguan"); }, seconds: null },
  { value: "1M", get title() { return tr("Bulanan"); }, seconds: null },
];

/** The range buttons under the chart pick an interval and show that span, as on TradingView */
const RANGES: { key: string; title: string; interval: ChartInterval; days: number | "ytd" | "all" }[] = [
  { key: "1D", get title() { return tr("1 hari"); }, interval: "5m", days: 1 },
  { key: "5D", get title() { return tr("5 hari"); }, interval: "15m", days: 5 },
  { key: "1M", get title() { return tr("1 bulan"); }, interval: "1h", days: 30 },
  { key: "3M", get title() { return tr("3 bulan"); }, interval: "4h", days: 91 },
  { key: "6M", get title() { return tr("6 bulan"); }, interval: "1D", days: 182 },
  { key: "YTD", get title() { return tr("Tahun ini"); }, interval: "1D", days: "ytd" },
  { key: "1Y", get title() { return tr("1 tahun"); }, interval: "1D", days: 365 },
  { key: "5Y", get title() { return tr("5 tahun"); }, interval: "1W", days: 1826 },
  { key: "ALL", get title() { return tr("Semua"); }, interval: "1M", days: "all" },
];

const SCALES: { value: ScaleMode; title: string; description: string }[] = [
  { value: "normal", get title() { return tr("Biasa"); }, get description() { return tr("Jarak harga sama rata"); } },
  { value: "percent", get title() { return tr("Persen"); }, get description() { return tr("Perubahan dari bar pertama yang tampil"); } },
  { value: "log", get title() { return tr("Logaritmik"); }, get description() { return tr("Persentase yang sama, jarak yang sama"); } },
];

const STYLES: { value: ChartStyle; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "candle", get label() { return tr("Candle"); }, icon: ChartCandlestick },
  { value: "hollow", get label() { return tr("Candle kosong"); }, icon: ChartCandlestick },
  { value: "heikin", get label() { return tr("Heikin Ashi"); }, icon: ChartCandlestick },
  { value: "bar", get label() { return tr("Bar"); }, icon: ChartNoAxesColumn },
  { value: "line", get label() { return tr("Garis"); }, icon: ChartLine },
  { value: "area", get label() { return tr("Area"); }, icon: ChartArea },
];

type IndicatorId = "vol" | "ma20" | "ma50" | "ma200" | "ema20" | "bb" | "rsi" | "macd";
const INDICATORS: { id: IndicatorId; label: string; short: string; color: string; description: string }[] = [
  { id: "vol", get label() { return tr("Volume"); }, get short() { return tr("Volume"); }, color: TV.up, get description() { return tr("Jumlah yang diperdagangkan per bar"); } },
  { id: "ma20", get label() { return tr("Moving Average 20"); }, get short() { return tr("MA 20"); }, color: "#2962FF", get description() { return tr("Rata-rata harga 20 bar"); } },
  { id: "ma50", get label() { return tr("Moving Average 50"); }, get short() { return tr("MA 50"); }, color: "#FF6D00", get description() { return tr("Tren menengah"); } },
  { id: "ma200", get label() { return tr("Moving Average 200"); }, get short() { return tr("MA 200"); }, color: "#E91E63", get description() { return tr("Tren jangka panjang"); } },
  { id: "ema20", get label() { return tr("EMA 20"); }, get short() { return tr("EMA 20"); }, color: "#00BCD4", get description() { return tr("Rata-rata yang lebih cepat bereaksi"); } },
  { id: "bb", get label() { return tr("Bollinger Bands (20, 2)"); }, get short() { return tr("Bollinger 20, 2"); }, color: "#2196F3", get description() { return tr("Pita volatilitas di sekitar MA 20"); } },
  { id: "rsi", get label() { return tr("RSI (14)"); }, get short() { return tr("RSI 14"); }, color: "#7E57C2", get description() { return tr("Jenuh beli di atas 70, jenuh jual di bawah 30"); } },
  { id: "macd", get label() { return tr("MACD (12, 26, 9)"); }, get short() { return tr("MACD 12, 26, 9"); }, color: "#2962FF", get description() { return tr("Momentum: garis MACD melawan sinyal"); } },
];

const DAY = 86_400;
/** Sizes of the resizable parts (pixels) */
const RAIL = { min: 44, max: 220, labels: 150, initial: 48 };
const PANEL = { min: 260, max: 640, initial: 340 };
const WATCHLIST = { min: 88, max: 560, initial: 200 };

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
    const vars = { symbol: holding.symbol, pct: pctText(pct), price: `${plain(live, currency)} ${currency}` };
    facts.push(pct >= 0
      ? (crypto ? tr("{symbol} naik {pct} dalam 24 jam ke {price}.", vars) : tr("{symbol} naik {pct} hari ini ke {price}.", vars))
      : (crypto ? tr("{symbol} turun {pct} dalam 24 jam ke {price}.", vars) : tr("{symbol} turun {pct} hari ini ke {price}.", vars)));
  }
  if (live != null && stats?.yearHigh && stats.yearLow) {
    const fromHigh = ((stats.yearHigh - live) / stats.yearHigh) * 100;
    const fromLow = ((live - stats.yearLow) / stats.yearLow) * 100;
    facts.push(fromHigh < 3
      ? tr("Harga dekat tertinggi 52 minggu ({yearHigh}).", { yearHigh: plain(stats.yearHigh, currency) })
      : tr("Harga {fromHigh} di bawah tertinggi 52 minggu dan {fromLow} di atas terendahnya.", { fromHigh: pctText(fromHigh), fromLow: pctText(fromLow) }));
  }
  if (live != null && daily.length >= 200) {
    const closes = daily.map((c) => c.close);
    const ma50 = sma(closes, 50).at(-1);
    const ma200 = sma(closes, 200).at(-1);
    if (ma50 != null && ma200 != null) {
      const above50 = live > ma50;
      const above200 = live > ma200;
      facts.push(
        above50 && above200 ? tr("Di atas MA 50 dan MA 200 harian: tren naik.")
          : !above50 && !above200 ? tr("Di bawah MA 50 dan MA 200 harian: tren turun.")
            : above50 ? tr("Di atas MA 50 tetapi masih di bawah MA 200 harian: mulai pulih dalam tren turun.")
              : tr("Di bawah MA 50 tetapi masih di atas MA 200 harian: koreksi dalam tren naik."),
      );
    }
  }
  if (daily.length > 20) {
    const r = rsi(daily.map((c) => c.close)).at(-1);
    if (r != null) {
      const v = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(r);
      facts.push(r >= 70 ? tr("RSI harian {v}: jenuh beli, rawan koreksi.", { v: v }) : r <= 30 ? tr("RSI harian {v}: jenuh jual, bisa memantul.", { v: v }) : tr("RSI harian {v}: netral.", { v: v }));
    }
  }
  if (profileVolume && stats?.avgVolume30) {
    const ratio = profileVolume / stats.avgVolume30;
    if (ratio >= 1.5 || ratio <= 0.5) {
      facts.push(tr("Volume {v} {format} kali rata-rata 30 hari{v2}.", { v: crypto ? tr("24 jam") : tr("hari ini"), format: new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(ratio), v2: ratio >= 1.5 ? tr(": minat sedang tinggi") : tr(": pasar sepi") }));
    }
  }
  if (tech?.summary) facts.push(tr("Ringkasan teknikal {techLabel}: {RATING_TEXT} ({buy} beli, {sell} jual).", { techLabel: techLabel, RATING_TEXT: RATING_TEXT[tech.summary.label], buy: tech.summary.buy, sell: tech.summary.sell }));
  if (live != null && avgInDisplay) {
    const p = ((live - avgInDisplay) / avgInDisplay) * 100;
    facts.push(p >= 0 ? tr("Posisi Anda untung {p} dari harga rata-rata beli.", { p: pctText(p) }) : tr("Posisi Anda rugi {p} dari harga rata-rata beli.", { p: pctText(p) }));
  }
  return facts;
}

// ---------------------------------------------------------------- the page

const LAST_KEY = "wmt-chart-last";

/**
 * The Chart page (its own item in the sidebar), laid out like TradingView: toolbar on top,
 * drawing tools on the left, the chart with its legend, ranges and clock at the bottom, and on
 * the right the watchlist (all holdings) and the details and analysis of the asset. The drawing
 * toolbar, the side panel and the watchlist can be resized by dragging their edges.
 */
export function ChartPage({ holdings, prices, holdingId, onBack, onSelect, onTrade, onEdit, onAdd }: {
  holdings: Holding[] | null;
  prices: MarketPrices | null;
  /** null: the asset viewed last, or the first one */
  holdingId: string | null;
  onBack: () => void;
  onSelect: (h: Holding) => void;
  onTrade: (h: Holding, side: TradeSide) => void;
  onEdit: (h: Holding) => void;
  onAdd: () => void;
}) {
  const holding = holdingId ? holdings?.find((h) => h.id === holdingId) : undefined;

  // No asset in the address (or one that was deleted): open the one viewed last, or the first
  const missing = !!holdings?.length && !holding;
  useEffect(() => {
    if (!missing || !holdings) return;
    let last: string | null = null;
    try { last = localStorage.getItem(LAST_KEY); } catch { /* not remembered */ }
    onSelect(holdings.find((h) => h.id === last) ?? holdings[0]);
  }, [missing, holdings, onSelect]);

  if (!holdings || missing) {
    return (
      <div className="flex h-dvh flex-col gap-1 bg-background p-1">
        <Skeleton className="h-12 w-full" />
        <div className="flex min-h-0 flex-1 gap-1"><Skeleton className="flex-1" /><Skeleton className="hidden w-80 lg:block" /></div>
      </div>
    );
  }
  if (!holdings.length) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <ChartCandlestick className="size-10 text-muted-foreground" aria-hidden />
        <div>
          <h1 className="text-lg font-semibold">{tr("Belum ada aset untuk dilihat")}</h1>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">{tr("Tambahkan saham atau crypto yang kamu punya, lalu chart dan analisisnya tampil di sini.")}</p>
        </div>
        <Button onClick={onAdd}><Plus className="size-4" aria-hidden /> {tr("Tambah investasi")}</Button>
      </div>
    );
  }
  if (!holding) return null;
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
  const [panelWidth, setPanelWidth] = usePref("wmt-chart-panel-width", PANEL.initial);
  const [watchHeight, setWatchHeight] = usePref("wmt-chart-watchlist-height", WATCHLIST.initial);
  const [railWidth, setRailWidth] = usePref("wmt-chart-rail", RAIL.initial);
  const [groupTools, setGroupTools] = usePref<Record<string, Tool>>("wmt-chart-group-tools", {});
  const [techInterval, setTechInterval] = usePref<ChartInterval>("wmt-chart-tech", "1D");
  const [range, setRange] = useState<string | null>(null);
  const [viewNonce, setViewNonce] = useState(0);
  const [tool, setTool] = useState<Tool>("cross");
  const [magnet, setMagnet] = usePref("wmt-chart-magnet", false);
  const [keepTool, setKeepTool] = usePref("wmt-chart-keep-tool", false);
  const [locked, setLocked] = useState(false);
  const [hidden, setHidden] = useState(false);
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
  useEffect(() => {
    try { localStorage.setItem(LAST_KEY, holding.id); } catch { /* not remembered */ }
  }, [holding.id]);

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
  const pickTool = (t: Tool) => {
    setTool(t);
    const group = TOOL_GROUPS.find((g) => g.tools.includes(t));
    if (group && groupTools[group.id] !== t) setGroupTools({ ...groupTools, [group.id]: t });
  };

  // Keyboard: Esc back to the cursor, Alt+R resets the view, + and - zoom
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [role=dialog], [role=menu], [role=listbox]")) return;
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
  const railOpen = railWidth > 0;

  const toggles = { magnet, setMagnet, keepTool, setKeepTool, locked, setLocked, hidden, setHidden, drawingCount, clear: () => chartRef.current?.clearDrawings() };

  return (
    <div ref={rootRef} className="relative flex min-h-dvh flex-col bg-background text-foreground lg:h-dvh lg:min-h-0 lg:overflow-clip">
      {/* ---------------- top toolbar */}
      <header data-scroll-x className="@container relative flex h-12 shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-card px-2 [scrollbar-width:none]">
        {/* No backdrop blur here: it would make the header the frame of its fixed-position menus, and clip them */}
        <ToolbarButton label={tr("Kembali ke Investasi")} onClick={onBack} className="md:hidden"><ArrowLeft className="size-4" /></ToolbarButton>
        <SymbolMenu holding={holding} holdings={holdings} onSelect={onSelect} />
        <Divider />
        {/* Intervals: every one as a button when there is room, otherwise one pop-up */}
        <div role="group" aria-label={tr("Interval")} className="hidden items-center @[70rem]:flex">
          {INTERVALS.map((i) => (
            <button key={i.value} type="button" aria-pressed={interval === i.value} onClick={() => chooseInterval(i.value)}
              className={cn("h-8 whitespace-nowrap rounded-md px-2 text-sm font-medium transition-colors",
                interval === i.value ? "bg-[#2962FF]/10 text-[#2962FF]" : "text-foreground hover:bg-muted")}>
              {i.title}
            </button>
          ))}
        </div>
        <Dropdown label={`Interval: ${intervalTitle}`} className="@[70rem]:hidden"
          trigger={<span className="whitespace-nowrap text-sm font-medium">{intervalTitle}</span>}>
          {(close) => (
            <>
              <MenuHeading>{tr("Interval")}</MenuHeading>
              {INTERVALS.map((i) => <DropdownItem key={i.value} selected={interval === i.value} onClick={() => { chooseInterval(i.value); close(); }}>{i.title}</DropdownItem>)}
            </>
          )}
        </Dropdown>
        <Divider />
        <Dropdown label={tr("Jenis chart: {label}", { label: styleDef.label })} trigger={<styleDef.icon className="size-4" />}>
          {(close) => (
            <>
              <MenuHeading>{tr("Jenis chart")}</MenuHeading>
              {STYLES.map((s) => (
                <DropdownItem key={s.value} selected={style === s.value} onClick={() => { setStyle(s.value); close(); }} icon={<s.icon className="size-4" />}>{s.label}</DropdownItem>
              ))}
            </>
          )}
        </Dropdown>
        <Dropdown label={tr("Indikator")} wide trigger={<span className="flex items-center gap-1.5 text-sm font-medium"><ChartLine className="size-4" /> <span className="hidden @[36rem]:inline">{tr("Indikator")}</span></span>}>
          {() => (
            <>
              <MenuHeading>{tr("Indikator")}</MenuHeading>
              {INDICATORS.map((ind) => (
                <DropdownItem key={ind.id} selected={indicators.includes(ind.id)} onClick={() => toggleIndicator(ind.id)} description={ind.description}
                  icon={<span className="mt-1.5 block h-0.5 w-4 rounded" style={{ background: ind.color }} />}>
                  {ind.label}
                </DropdownItem>
              ))}
              <MenuSeparator />
              <DropdownItem selected={showAvg} onClick={() => setShowAvg(!showAvg)} description={tr("Garis putus-putus di harga rata-rata Anda")}
                icon={<span className="mt-1.5 block h-0 w-4 border-t border-dashed border-current" />}>
                {tr("Harga rata-rata beli")}
              </DropdownItem>
            </>
          )}
        </Dropdown>
        {/* Drawing tools on phones and tablets (the toolbar on the left needs a laptop's width) */}
        <Dropdown label={tr("Alat gambar")} wide className="lg:hidden" trigger={<span className="flex items-center gap-1.5 text-sm font-medium"><PencilRuler className="size-4" /> <span className="hidden @[36rem]:inline">{tr("Gambar")}</span></span>}>
          {(close) => <ToolsMenu tool={tool} onPick={(t) => { pickTool(t); close(); }} {...toggles} />}
        </Dropdown>
        {native === "USD" && fx != null && (
          <>
            <Divider />
            <div role="group" aria-label={tr("Mata uang chart")} className="flex shrink-0 items-center rounded-lg bg-muted p-0.5">
              {(["USD", "IDR"] as const).map((c) => (
                <button key={c} type="button" aria-pressed={currency === c} onClick={() => setInIdr(c === "IDR")}
                  className={cn("rounded-md px-2 py-1 text-xs font-medium transition-all", currency === c ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  {c}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="ml-auto flex items-center gap-1 pl-2">
          <ToolbarButton label={tr("Simpan gambar chart")} onClick={screenshot} className="max-sm:hidden"><Camera className="size-4" /></ToolbarButton>
          <ToolbarButton label={fullscreen ? tr("Keluar layar penuh") : tr("Layar penuh")} onClick={toggleFullscreen} className="max-sm:hidden">
            {fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
          </ToolbarButton>
          <ToolbarButton label={panelOpen ? tr("Tutup panel samping") : tr("Buka panel samping")} onClick={() => setPanelOpen(!panelOpen)} className="max-lg:hidden">
            {panelOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
          </ToolbarButton>
          <button type="button" onClick={() => onEdit(holding)} aria-label={tr("Ubah {symbol}", { symbol: holding.symbol })}
            className="ml-1 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 text-sm font-medium hover:bg-muted">
            <Pencil className="size-3.5" aria-hidden /> <span className="max-sm:hidden">{tr("Ubah")}</span>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-1 p-1 lg:flex-row lg:gap-0">
        {/* ---------------- drawing tools, resizable: narrow (icons), wide (names) or hidden */}
        {railOpen ? (
          <nav aria-label={tr("Alat gambar")} style={{ width: railWidth }}
            className="hidden shrink-0 flex-col gap-0.5 overflow-y-auto overflow-x-clip rounded-lg bg-card p-1 [scrollbar-width:none] lg:flex">
            <ToolRail tool={tool} groupTools={groupTools} onPick={pickTool} wide={railWidth >= RAIL.labels} {...toggles}
              onZoom={(f) => chartRef.current?.zoom(f)} onReset={() => chartRef.current?.reset()} />
          </nav>
        ) : (
          <button type="button" onClick={() => setRailWidth(RAIL.initial)} aria-label={tr("Tampilkan alat gambar")} title={tr("Tampilkan alat gambar")}
            className="hidden w-4 shrink-0 items-center justify-center rounded-lg bg-card text-muted-foreground hover:bg-muted hover:text-foreground lg:flex">
            <ChevronRight className="size-3.5" aria-hidden />
          </button>
        )}
        {railOpen && (
          <ResizeHandle label={tr("Lebar alat gambar")} value={railWidth} min={RAIL.min} max={RAIL.max} collapseBelow={30}
            onChange={setRailWidth} onReset={() => setRailWidth(railWidth === RAIL.initial ? RAIL.labels + 30 : RAIL.initial)} />
        )}

        {/* ---------------- chart */}
        <main className="@container flex h-[68dvh] min-h-[420px] min-w-0 flex-col overflow-clip rounded-lg bg-card lg:h-auto lg:min-h-0 lg:flex-1">
          <div className="relative min-h-0 flex-1" role="region" aria-label={tr("Chart {symbol}, {intervalTitle}", { symbol: holding.symbol, intervalTitle: intervalTitle })}>
            {loaded && bars.length > 0 && (
              <ChartView
                chartRef={chartRef} holding={holding} bars={bars} style={style} currency={currency} indicators={indicators}
                lines={lines} hists={hists} avgPrice={showAvg ? avgInDisplay : null} intervalTitle={intervalTitle}
                exchange={profile?.exchange ?? chart.data?.source ?? null} market={market} tool={tool} magnet={magnet} keepTool={keepTool}
                locked={locked} hidden={hidden} scaleMode={scaleMode} priceFactor={k}
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
                {chart.failed ? tr("Chart gagal dimuat. Dicoba lagi otomatis.") : tr("Belum ada data harga {intervalTitle} untuk {symbol}.", { intervalTitle: intervalTitle.toLowerCase(), symbol: holding.symbol })}
              </div>
            )}
          </div>

          {/* ---------------- ranges, clock, scale */}
          <div className="relative flex h-10 shrink-0 items-center gap-1 border-t border-border px-2 text-xs">
            <div role="group" aria-label={tr("Rentang waktu")} className="hidden items-center @[48rem]:flex">
              {RANGES.map((r) => (
                <button key={r.key} type="button" aria-pressed={range === r.key} onClick={() => chooseRange(r.key)}
                  className={cn("h-7 whitespace-nowrap rounded-md px-2 font-medium transition-colors", range === r.key ? "bg-[#2962FF]/10 text-[#2962FF]" : "text-foreground hover:bg-muted")}>
                  {r.title}
                </button>
              ))}
            </div>
            <Dropdown label={tr("Rentang waktu")} side="top" className="@[48rem]:hidden"
              trigger={<span className="whitespace-nowrap text-xs font-medium">{tr("Rentang:")} {rangeDef?.title ?? tr("terbaru")}</span>}>
              {(close) => (
                <>
                  <MenuHeading>{tr("Rentang waktu")}</MenuHeading>
                  {RANGES.map((r) => <DropdownItem key={r.key} selected={range === r.key} onClick={() => { chooseRange(r.key); close(); }}>{r.title}</DropdownItem>)}
                </>
              )}
            </Dropdown>
            <div className="ml-auto flex items-center gap-1 pl-3">
              <span className="hidden @[40rem]:inline"><Clock /></span>
              <span className="mx-1 hidden h-4 w-px bg-border @[40rem]:inline" aria-hidden />
              <div role="group" aria-label={tr("Skala harga")} className="hidden items-center @[64rem]:flex">
                {SCALES.filter((s) => s.value !== "normal").map((s) => (
                  <button key={s.value} type="button" title={s.description} aria-pressed={scaleMode === s.value} onClick={() => setScaleMode(scaleMode === s.value ? "normal" : s.value)}
                    className={cn("h-7 rounded-md px-2 font-medium", scaleMode === s.value ? "bg-[#2962FF]/10 text-[#2962FF]" : "text-foreground hover:bg-muted")}>
                    {s.title}
                  </button>
                ))}
              </div>
              <Dropdown label={tr("Skala harga")} side="top" align="end" className="@[64rem]:hidden"
                trigger={<span className="whitespace-nowrap text-xs font-medium">{tr("Skala:")} {SCALES.find((s) => s.value === scaleMode)!.title}</span>}>
                {(close) => (
                  <>
                    <MenuHeading>{tr("Skala harga")}</MenuHeading>
                    {SCALES.map((s) => <DropdownItem key={s.value} selected={scaleMode === s.value} description={s.description} onClick={() => { setScaleMode(s.value); close(); }}>{s.title}</DropdownItem>)}
                  </>
                )}
              </Dropdown>
              <button type="button" title={tr("Skala otomatis dan tampilan awal (Alt+R)")} onClick={() => { setScaleMode("normal"); chartRef.current?.reset(); }}
                className="h-7 whitespace-nowrap rounded-md px-2 font-medium text-foreground hover:bg-muted">
                {tr("Otomatis")}
              </button>
            </div>
          </div>
        </main>

        {/* ---------------- watchlist and details, resizable */}
        {panelOpen && (
          <ResizeHandle label={tr("Lebar panel samping")} value={panelWidth} min={PANEL.min} max={PANEL.max} invert
            onChange={setPanelWidth} onReset={() => setPanelWidth(PANEL.initial)} />
        )}
        <aside aria-label={tr("Daftar pantau dan detail aset")} style={{ "--panel": `${panelWidth}px`, "--watch": `${watchHeight}px` } as React.CSSProperties}
          className={cn("relative flex min-h-0 shrink-0 flex-col overflow-clip rounded-lg bg-card lg:w-[min(var(--panel),50vw)]", !panelOpen && "lg:hidden")}>
          <div className="relative flex max-h-72 shrink-0 flex-col overflow-clip lg:h-[var(--watch)] lg:max-h-[calc(100%-10rem)]">
            <Watchlist holdings={holdings} prices={prices} activeId={holding.id} onSelect={onSelect} />
          </div>
          <ResizeHandle orientation="y" label={tr("Tinggi daftar pantau")} value={watchHeight} min={WATCHLIST.min} max={WATCHLIST.max}
            onChange={setWatchHeight} onReset={() => setWatchHeight(WATCHLIST.initial)} />
          <div className="relative min-h-0 overflow-y-auto border-t border-border lg:flex-1 lg:border-t-0">
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

// ---------------------------------------------------------------- drawing tools

interface ToggleProps {
  magnet: boolean; setMagnet: (v: boolean) => void;
  keepTool: boolean; setKeepTool: (v: boolean) => void;
  locked: boolean; setLocked: (v: boolean) => void;
  hidden: boolean; setHidden: (v: boolean) => void;
  drawingCount: number; clear: () => void;
}

/** The left toolbar: one button per group (showing the group's last tool), its arrow lists the rest, as on TradingView */
function ToolRail({ tool, groupTools, onPick, wide, onZoom, onReset, ...t }: ToggleProps & {
  tool: Tool; groupTools: Record<string, Tool>; onPick: (t: Tool) => void; wide: boolean; onZoom: (f: number) => void; onReset: () => void;
}) {
  return (
    <>
      {TOOL_GROUPS.map((g) => {
        const current = g.tools.includes(tool) ? tool : groupTools[g.id] && g.tools.includes(groupTools[g.id]) ? groupTools[g.id] : g.tools[0];
        return <ToolGroupButton key={g.id} group={g} current={current} active={g.tools.includes(tool)} wide={wide} onPick={onPick} />;
      })}
      <RailSeparator />
      <RailButton wide={wide} label={t.magnet ? tr("Magnet nyala") : tr("Magnet")} hint={tr("Titik menempel ke harga buka, tertinggi, terendah atau tutup")} active={t.magnet} onClick={() => t.setMagnet(!t.magnet)}>
        <Magnet className="size-[18px]" />
      </RailButton>
      <RailButton wide={wide} label={tr("Tetap menggambar")} hint={tr("Alat tidak kembali ke kursor setelah satu gambar")} active={t.keepTool} onClick={() => t.setKeepTool(!t.keepTool)}>
        <PencilRuler className="size-[18px]" />
      </RailButton>
      <RailButton wide={wide} label={t.locked ? tr("Buka kunci gambar") : tr("Kunci semua gambar")} hint={tr("Gambar tidak bisa dipilih atau digeser")} active={t.locked} onClick={() => t.setLocked(!t.locked)}>
        {t.locked ? <Lock className="size-[18px]" /> : <LockOpen className="size-[18px]" />}
      </RailButton>
      <RailButton wide={wide} label={t.hidden ? tr("Tampilkan gambar") : tr("Sembunyikan gambar")} active={t.hidden} onClick={() => t.setHidden(!t.hidden)}>
        {t.hidden ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
      </RailButton>
      <RailSeparator />
      <RailButton wide={wide} label={tr("Perbesar")} hint={tr("Tombol +")} onClick={() => onZoom(0.8)}><ZoomIn className="size-[18px]" /></RailButton>
      <RailButton wide={wide} label={tr("Perkecil")} hint={tr("Tombol −")} onClick={() => onZoom(1.25)}><ZoomOut className="size-[18px]" /></RailButton>
      <RailButton wide={wide} label={tr("Atur ulang tampilan")} hint={tr("Alt+R")} onClick={onReset}><RotateCcw className="size-[18px]" /></RailButton>
      <RailSeparator />
      <RailButton wide={wide} label={t.drawingCount ? tr("Hapus {drawingCount} gambar", { drawingCount: t.drawingCount }) : tr("Belum ada gambar")} disabled={!t.drawingCount} onClick={t.clear} danger>
        <Trash2 className="size-[18px]" />
      </RailButton>
    </>
  );
}

function ToolGroupButton({ group, current, active, wide, onPick }: { group: (typeof TOOL_GROUPS)[number]; current: Tool; active: boolean; wide: boolean; onPick: (t: Tool) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useDismiss(open, [ref, menuRef], () => setOpen(false));
  useMenuFocus(open, menuRef);
  const openMenu = () => {
    const r = ref.current!.getBoundingClientRect();
    setPos({ left: r.right + 6, top: Math.max(8, Math.min(r.top, window.innerHeight - 8 - (group.tools.length * 52 + 40))) });
    setOpen(true);
  };
  return (
    <div ref={ref} className="group/tool relative flex items-stretch">
      <button type="button" onClick={() => onPick(current)} aria-pressed={active} aria-label={TOOLS[current].label} title={wide ? TOOLS[current].hint : `${TOOLS[current].label}: ${TOOLS[current].hint}`}
        className={cn("flex min-h-9 min-w-0 flex-1 items-center gap-2.5 rounded-md px-[9px] py-1 text-left text-sm transition-colors",
          active ? "bg-[#2962FF]/12 text-[#2962FF]" : "text-foreground hover:bg-muted")}>
        <span className="shrink-0">{TOOL_ICONS[current]}</span>
        {wide && <span className="line-clamp-2 leading-tight">{TOOLS[current].label}</span>}
      </button>
      {group.tools.length > 1 && (
        <button type="button" onClick={() => (open ? setOpen(false) : openMenu())} aria-haspopup="menu" aria-expanded={open} aria-label={tr("Pilihan {toLowerCase}", { toLowerCase: group.label.toLowerCase() })}
          title={tr("Semua alat {toLowerCase}", { toLowerCase: group.label.toLowerCase() })}
          className={cn("flex w-4 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground",
            wide || open ? "opacity-100" : "absolute inset-y-0 right-0 opacity-0 focus-visible:opacity-100 group-hover/tool:opacity-100")}>
          <ChevronRight className="size-3" aria-hidden />
        </button>
      )}
      {open && pos && (
        <div ref={menuRef} role="menu" aria-label={group.label} style={{ left: pos.left, top: pos.top }}
          className={cn(menuSurface, "fixed z-50 w-72 animate-[menu-in_150ms_ease-out] origin-top-left motion-reduce:animate-none")}>
          <MenuHeading>{group.label}</MenuHeading>
          {group.tools.map((t) => (
            <DropdownItem key={t} role="menuitemradio" selected={t === current && active} onClick={() => { onPick(t); setOpen(false); }} icon={TOOL_ICONS[t]} description={TOOLS[t].hint}>
              {TOOLS[t].label}
            </DropdownItem>
          ))}
        </div>
      )}
    </div>
  );
}

/** The same tools as a menu, for phones and tablets */
function ToolsMenu({ tool, onPick, ...t }: ToggleProps & { tool: Tool; onPick: (t: Tool) => void }) {
  return (
    <>
      {TOOL_GROUPS.map((g, gi) => (
        <React.Fragment key={g.id}>
          {gi > 0 && <MenuSeparator />}
          <MenuHeading>{g.label}</MenuHeading>
          {g.tools.map((x) => (
            <DropdownItem key={x} role="menuitemradio" selected={tool === x} onClick={() => onPick(x)} icon={TOOL_ICONS[x]}>{TOOLS[x].label}</DropdownItem>
          ))}
        </React.Fragment>
      ))}
      <MenuSeparator />
      <DropdownItem selected={t.magnet} onClick={() => t.setMagnet(!t.magnet)} icon={<Magnet className="size-4" />} description={tr("Menempel ke harga buka, tertinggi, terendah, tutup")}>{tr("Magnet")}</DropdownItem>
      <DropdownItem selected={t.keepTool} onClick={() => t.setKeepTool(!t.keepTool)} icon={<PencilRuler className="size-4" />}>{tr("Tetap menggambar")}</DropdownItem>
      <DropdownItem selected={t.locked} onClick={() => t.setLocked(!t.locked)} icon={<Lock className="size-4" />}>{tr("Kunci semua gambar")}</DropdownItem>
      <DropdownItem selected={t.hidden} onClick={() => t.setHidden(!t.hidden)} icon={<EyeOff className="size-4" />}>{tr("Sembunyikan gambar")}</DropdownItem>
      <MenuSeparator />
      <DropdownItem role="menuitem" selected={false} disabled={!t.drawingCount} onClick={t.clear} icon={<Trash2 className="size-4" />} danger>
        {t.drawingCount ? tr("Hapus {drawingCount} gambar", { drawingCount: t.drawingCount }) : tr("Belum ada gambar")}
      </DropdownItem>
    </>
  );
}

// ---------------------------------------------------------------- chart with its legend

const ChartView = memo(function ChartView({
  chartRef, holding, bars, style, currency, indicators, lines, hists, avgPrice, intervalTitle, exchange, market, tool, magnet, keepTool, locked, hidden,
  scaleMode, priceFactor, view, barSeconds, sessionEnd, live, onToolDone, onDrawingsChange, onRemoveIndicator, onTrade,
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
  intervalTitle: string;
  exchange: string | null;
  market: "OPEN" | "CLOSED" | "ALWAYS" | null;
  tool: Tool;
  magnet: boolean;
  keepTool: boolean;
  locked: boolean;
  hidden: boolean;
  scaleMode: ScaleMode;
  priceFactor: number;
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
        avgPrice={avgPrice} watermark={`${holding.symbol}, ${intervalTitle.toLowerCase()}`} tool={tool} magnet={magnet} keepTool={keepTool}
        locked={locked} hidden={hidden} scaleMode={scaleMode} priceFactor={priceFactor}
        storageKey={`wmt-drawings:${holding.id}`} legacyPrefix={`wmt-draw:${holding.id}:`} view={view} barSeconds={barSeconds} sessionEnd={sessionEnd}
        onHover={setHover} onToolDone={onToolDone} onDrawingsChange={onDrawingsChange}
      />
      {/* Legend, top left, as on TradingView */}
      <div className="pointer-events-none absolute left-2 right-16 top-2 z-10 space-y-1 text-xs">
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
              {market === "CLOSED" ? tr("Pasar tutup") : market === "ALWAYS" ? tr("Buka 24 jam") : tr("Pasar buka")}
            </span>
          )}
          {bar && legendOpen && (
            <span className="flex flex-wrap gap-x-2 tabular-nums">
              {([[tr("Buka"), bar.open], [tr("Tertinggi"), bar.high], [tr("Terendah"), bar.low], [tr("Tutup"), bar.close]] as const).map(([k, v]) => (
                <span key={k}><span className="text-muted-foreground">{k} </span><span style={{ color }}>{plain(v, currency)}</span></span>
              ))}
              {change != null && <span style={{ color }}>{signedPlain(change, currency)} ({formatPercent(changePct)})</span>}
            </span>
          )}
          <button type="button" onClick={() => setLegendOpen(!legendOpen)} aria-expanded={legendOpen}
            aria-label={legendOpen ? tr("Lipat legenda") : tr("Buka legenda")} title={legendOpen ? tr("Lipat legenda") : tr("Buka legenda")}
            className="pointer-events-auto rounded-md border border-border bg-card/80 p-0.5 text-muted-foreground backdrop-blur hover:text-foreground">
            <ChevronDown className={cn("size-3.5 transition-transform", legendOpen && "rotate-180")} aria-hidden />
          </button>
        </div>
        {legendOpen && (<>
          {/* Sell / buy, as the buttons on TradingView's legend */}
          <div className="pointer-events-auto flex items-center gap-1">
            <button type="button" onClick={() => onTrade("SELL")}
              className="min-w-20 rounded-md border border-[#F23645] bg-card/80 px-2 py-0.5 text-center leading-tight text-[#F23645] backdrop-blur transition-colors hover:bg-[#F23645] hover:text-white">
              <span className="block text-xs font-medium tabular-nums">{live != null ? plain(live, currency) : "–"}</span>
              <span className="block text-[10px] font-semibold">{tr("JUAL")}</span>
            </button>
            <button type="button" onClick={() => onTrade("BUY")}
              className="min-w-20 rounded-md border border-[#2962FF] bg-card/80 px-2 py-0.5 text-center leading-tight text-[#2962FF] backdrop-blur transition-colors hover:bg-[#2962FF] hover:text-white">
              <span className="block text-xs font-medium tabular-nums">{live != null ? plain(live, currency) : "–"}</span>
              <span className="block text-[10px] font-semibold">{tr("BELI")}</span>
            </button>
            {holding.currency !== currency && <span className="ml-1 text-[11px] text-muted-foreground">{tr("dicatat dalam")} {holding.currency}</span>}
          </div>

          {indicators.includes("vol") && bar && bar.volume > 0 && (
            <p className="tabular-nums"><span className="text-muted-foreground">{tr("Volume")} </span><span style={{ color }}>{formatCompact(bar.volume)}</span></p>
          )}
          {legendRows.map((row) => (
            <p key={row.id} className="group pointer-events-auto flex w-fit items-center gap-1.5 tabular-nums">
              <span className="text-muted-foreground">{row.label}</span>
              {row.values.map((v, n) => (
                <span key={n} style={{ color: v.color }}>{v.v == null ? "–" : v.price ? plain(v.v, currency) : fmt2.format(v.v)}</span>
              ))}
              <button type="button" onClick={() => onRemoveIndicator(row.id)} aria-label={tr("Hapus {label}", { label: row.label })}
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
      {now.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", second: "2-digit" })} {tr("UTC")}{offset >= 0 ? "+" : "−"}{Math.abs(offset)}
    </span>
  );
}

/**
 * A draggable edge between two parts of the page. Dragging, the arrow keys (Shift: bigger
 * steps), Home and End change the size; a double click or Enter goes back to the usual size.
 */
function ResizeHandle({ orientation = "x", label, value, min, max, onChange, onReset, invert, collapseBelow }: {
  orientation?: "x" | "y";
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  onReset: () => void;
  /** Dragging towards the start makes it bigger (a panel on the right) */
  invert?: boolean;
  /** Dragged smaller than this: hidden (0) */
  collapseBelow?: number;
}) {
  const start = useRef<{ pos: number; value: number } | null>(null);
  const clamp = (v: number) => (collapseBelow != null && v < collapseBelow ? 0 : Math.round(Math.min(max, Math.max(min, v))));
  const horizontal = orientation === "x";
  return (
    <div role="separator" aria-orientation={horizontal ? "vertical" : "horizontal"} aria-label={label} aria-valuenow={value} aria-valuemin={min} aria-valuemax={max} tabIndex={0}
      title={tr("{label}: geser untuk mengubah, klik dua kali untuk ukuran biasa", { label: label })}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { pos: horizontal ? e.clientX : e.clientY, value };
        document.body.style.cursor = horizontal ? "col-resize" : "row-resize";
        document.body.style.userSelect = "none";
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const delta = (horizontal ? e.clientX : e.clientY) - start.current.pos;
        onChange(clamp(start.current.value + (invert ? -delta : delta)));
      }}
      onPointerUp={() => { start.current = null; document.body.style.cursor = ""; document.body.style.userSelect = ""; }}
      onPointerCancel={() => { start.current = null; document.body.style.cursor = ""; document.body.style.userSelect = ""; }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const big = e.shiftKey ? 64 : 16;
        const grow = horizontal ? (invert ? "ArrowLeft" : "ArrowRight") : "ArrowDown";
        const shrink = horizontal ? (invert ? "ArrowRight" : "ArrowLeft") : "ArrowUp";
        if (e.key === grow) onChange(clamp(value + big));
        else if (e.key === shrink) onChange(clamp(value - big));
        else if (e.key === "Home") onChange(min);
        else if (e.key === "End") onChange(max);
        else if (e.key === "Enter") onReset();
        else return;
        e.preventDefault();
      }}
      className={cn("group relative hidden shrink-0 touch-none items-center justify-center outline-none lg:flex",
        horizontal ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize")}>
      {/* A wider area to grab than the line shows */}
      <span className={cn("absolute", horizontal ? "inset-y-0 -inset-x-1.5" : "inset-x-0 -inset-y-1.5")} aria-hidden />
      <span aria-hidden className={cn("rounded-full bg-transparent transition-colors group-hover:bg-[#2962FF]/60 group-focus-visible:bg-[#2962FF] group-active:bg-[#2962FF]",
        horizontal ? "h-full w-0.5" : "h-0.5 w-full")} />
      <span aria-hidden className={cn("absolute rounded-full bg-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
        horizontal ? "h-8 w-1" : "h-1 w-8")} />
    </div>
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

function RailButton({ label, hint, active, disabled, danger, wide, onClick, children }: {
  label: string; hint?: string; active?: boolean; disabled?: boolean; danger?: boolean; wide: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={hint ? `${label}: ${hint}` : label} aria-pressed={active}
      className={cn("flex min-h-9 w-full shrink-0 items-center gap-2.5 rounded-md px-[9px] py-1 text-left text-sm transition-colors disabled:opacity-35",
        active ? "bg-[#2962FF]/12 text-[#2962FF]" : danger ? "text-foreground hover:bg-[#F23645]/10 hover:text-[#F23645]" : "text-foreground hover:bg-muted")}>
      <span className="shrink-0">{children}</span>
      {wide && <span className="line-clamp-2 leading-tight">{label}</span>}
    </button>
  );
}
const RailSeparator = () => <span className="mx-2 my-1 h-px shrink-0 bg-border" aria-hidden />;

/** Closes a menu on a click outside (any of the refs) or Escape */
function useDismiss(open: boolean, refs: React.RefObject<HTMLElement | null>[], close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!refs.some((r) => r.current?.contains(e.target as Node))) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

/** Menu keyboard: focus moves into the menu; arrows, Home and End move between its items */
function useMenuFocus(open: boolean, menu: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = menu.current;
    if (!open || !el) return;
    const items = () => [...el.querySelectorAll<HTMLElement>("[role^=menuitem]:not(:disabled)")];
    (items().find((x) => x.getAttribute("aria-checked") === "true") ?? items()[0])?.focus({ preventScroll: false });
    const onKey = (e: KeyboardEvent) => {
      const list = items();
      const at = list.indexOf(document.activeElement as HTMLElement);
      const go = (i: number) => { e.preventDefault(); list[(i + list.length) % list.length]?.focus(); };
      if (e.key === "ArrowDown") go(at + 1);
      else if (e.key === "ArrowUp") go(at - 1);
      else if (e.key === "Home") go(0);
      else if (e.key === "End") go(list.length - 1);
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [open, menu]);
}

/** A toolbar pop-up menu; stays open while choosing several items (indicators) */
function Dropdown({ label, trigger, children, wide, className, side = "bottom", align = "start" }: {
  label: string; trigger: React.ReactNode; children: (close: () => void) => React.ReactNode; wide?: boolean; className?: string; side?: "bottom" | "top"; align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<React.CSSProperties | null>(null);
  // Chosen with the keyboard or a click: the focus goes back to the button
  const [refocus, setRefocus] = useState(false);
  const close = useCallback(() => { setOpen(false); setRefocus(true); }, []);
  useEffect(() => {
    if (!refocus) return;
    triggerRef.current?.focus();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot flag
    setRefocus(false);
  }, [refocus]);
  useDismiss(open, [ref, menuRef], () => setOpen(false));
  useMenuFocus(open, menuRef);
  const width = wide ? 300 : 224;
  return (
    <div ref={ref} className={cn("shrink-0", className)}>
      <button ref={triggerRef} type="button" aria-label={label} title={label} aria-expanded={open} aria-haspopup="menu"
        onClick={() => {
          // The toolbar scrolls sideways on phones, so the menu is placed on the page, not inside it
          const r = triggerRef.current!.getBoundingClientRect();
          const left = Math.max(8, Math.min(align === "end" ? r.right - width : r.left, window.innerWidth - width - 8));
          setPos(side === "top"
            ? { left, bottom: window.innerHeight - r.top + 6, maxHeight: r.top - 16 }
            : { left, top: r.bottom + 6, maxHeight: window.innerHeight - r.bottom - 16 });
          setOpen(!open);
        }}
        className={cn("inline-flex h-8 items-center gap-1 rounded-md px-2 text-foreground transition-colors hover:bg-muted", open && "bg-muted")}>
        {trigger}
        <ChevronDown className={cn("size-3 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && pos && (
        <div ref={menuRef} role="menu" aria-label={label} style={{ ...pos, width }}
          className={cn(menuSurface, "fixed z-50 overflow-y-auto overscroll-contain animate-[menu-in_150ms_ease-out] motion-reduce:animate-none",
            side === "top" ? "origin-bottom-left" : "origin-top-left")}>
          {children(close)}
        </div>
      )}
    </div>
  );
}

const MenuHeading = ({ children }: { children: React.ReactNode }) => (
  <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</p>
);
const MenuSeparator = () => <div className="mx-2 my-1 h-px bg-border" role="separator" />;

/** A menu row after Apple's menus: a checkmark column on the left, the system blue under the pointer */
function DropdownItem({ selected, onClick, icon, description, children, role = "menuitemcheckbox", disabled, danger }: {
  selected: boolean; onClick: () => void; icon?: React.ReactNode; description?: string; children: React.ReactNode;
  role?: "menuitemcheckbox" | "menuitemradio" | "menuitem"; disabled?: boolean; danger?: boolean;
}) {
  return (
    <button type="button" role={role} aria-checked={role === "menuitem" ? undefined : selected} onClick={onClick} disabled={disabled}
      className={cn("group/item flex w-full items-start gap-2 rounded-md py-1.5 pl-1.5 pr-3 text-left text-sm outline-none [@media(pointer:coarse)]:min-h-11 disabled:opacity-40",
        danger ? "text-[#F23645] hover:bg-[#F23645] hover:text-white focus-visible:bg-[#F23645] focus-visible:text-white"
          : "text-popover-foreground hover:bg-[#007AFF] hover:text-white focus-visible:bg-[#007AFF] focus-visible:text-white dark:hover:bg-[#0A84FF] dark:focus-visible:bg-[#0A84FF]")}>
      <span className="flex w-4 shrink-0 justify-center pt-0.5">{selected && <Check className="size-3.5" strokeWidth={2.5} aria-hidden />}</span>
      {icon && <span className="flex w-[18px] shrink-0 justify-center text-muted-foreground group-hover/item:text-current group-focus-visible/item:text-current">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block">{children}</span>
        {description && <span className="block text-xs text-muted-foreground group-hover/item:text-white/80 group-focus-visible/item:text-white/80">{description}</span>}
      </span>
    </button>
  );
}

/** The ticker button at the top left: switches to another holding */
function SymbolMenu({ holding, holdings, onSelect }: { holding: Holding; holdings: Holding[]; onSelect: (h: Holding) => void }) {
  return (
    <Dropdown label={tr("Ganti aset, sekarang {symbol}", { symbol: holding.symbol })} wide
      trigger={<span className="flex items-center gap-2 text-sm font-semibold"><Avatar symbol={holding.symbol} />{holding.symbol}</span>}>
      {(close) => (
        <>
          <MenuHeading>{tr("Aset Anda")}</MenuHeading>
          {holdings.map((h) => (
            <DropdownItem key={h.id} role="menuitemradio" selected={h.id === holding.id} onClick={() => { close(); onSelect(h); }} icon={<Avatar symbol={h.symbol} className="size-4 text-[9px]" />}
              description={`${h.name ?? ASSET_TYPE_LABEL[h.assetType]}, ${h.platform}`}>
              {h.symbol}
            </DropdownItem>
          ))}
        </>
      )}
    </Dropdown>
  );
}

