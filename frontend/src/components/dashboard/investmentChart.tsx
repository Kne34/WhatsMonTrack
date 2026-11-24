"use client";

import React, { useEffect, useRef, useState } from "react";
import type { CandlestickData, IChartApi, ISeriesApi, LineData, Time, UTCTimestamp } from "lightweight-charts";
import { ArrowLeftRight, CandlestickChart, CircleAlert, LineChart, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { fetchPriceHistory } from "@/lib/api";
import { formatTime } from "@/lib/format";
import {
  ASSET_TYPE_LABEL, currentPrice, formatMoney, formatPercent,
  type Candle, type ChartRange, type Holding, type MarketPrices, type PriceHistory,
} from "@/lib/portfolio";
import { Button, SegmentedControl, Skeleton } from "../common/ui";

/** Labels as on TradingView in Indonesian: H(ari), B(ulan), T(ahun) */
const RANGES: { value: ChartRange; label: string; title: string }[] = [
  { value: "1D", label: "1H", title: "1 hari" },
  { value: "5D", label: "5H", title: "5 hari" },
  { value: "1M", label: "1B", title: "1 bulan" },
  { value: "3M", label: "3B", title: "3 bulan" },
  { value: "1Y", label: "1T", title: "1 tahun" },
  { value: "5Y", label: "5T", title: "5 tahun" },
];
type Style = "candle" | "line";

/** The chart library draws on a canvas: it needs real colors, read from the theme tokens */
function themeColors() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return { text: v("--muted-foreground"), border: v("--border"), card: v("--card"), up: v("--income"), down: v("--expense"), fg: v("--foreground") };
}
/** #RRGGBB + alpha */
const alpha = (hex: string, a: number) => (/^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${Math.round(a * 255).toString(16).padStart(2, "0")}` : hex);
/** Candles are in UTC; the chart shows the time stamps as given, so shift them to the viewer's clock */
const localTime = (t: number) => (t - new Date(t * 1000).getTimezoneOffset() * 60) as UTCTimestamp;

function useDarkMode() {
  const [dark, setDark] = useState(() => typeof document !== "undefined" && document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setDark(root.classList.contains("dark")));
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

interface Hover { open: number; high: number; low: number; close: number }

/** Candles in the holding's currency (a crypto chart in USD is converted for a rupiah holding) */
function inHoldingCurrency(history: PriceHistory, holding: Holding, fx: number | null): { candles: Candle[]; currency: string } {
  if (history.currency === holding.currency || !fx) return { candles: history.candles, currency: history.currency };
  const k = history.currency === "USD" ? fx : 1 / fx;
  return {
    currency: holding.currency,
    candles: history.candles.map((c) => ({ ...c, open: c.open * k, high: c.high * k, low: c.low * k, close: c.close * k })),
  };
}

function PriceChart({ candles, currency, style, avgPrice, livePrice, onHover }: {
  candles: Candle[];
  currency: string;
  style: Style;
  /** Drawn as a dashed line when it is in the chart's currency */
  avgPrice: number | null;
  livePrice: number | null;
  onHover: (h: Hover | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | null>(null);
  const lastRef = useRef<Candle | null>(null);
  const dark = useDarkMode();
  const hoverRef = useRef(onHover);
  const liveRef = useRef(livePrice);
  useEffect(() => { hoverRef.current = onHover; liveRef.current = livePrice; }, [onHover, livePrice]);

  /** Moves the last bar to the live price, as on a trading screen */
  const applyLive = (price: number | null) => {
    const last = lastRef.current;
    const series = seriesRef.current;
    if (!last || !series || price == null || !(price > 0)) return;
    const time = localTime(last.time);
    try {
      if (style === "candle") {
        (series as ISeriesApi<"Candlestick">).update({ time, open: last.open, high: Math.max(last.high, price), low: Math.min(last.low, price), close: price });
      } else {
        (series as ISeriesApi<"Line">).update({ time, value: price });
      }
    } catch {
      // the chart is being rebuilt; the next price lands on the new one
    }
  };
  const applyLiveRef = useRef(applyLive);
  useEffect(() => { applyLiveRef.current = applyLive; });

  useEffect(() => {
    let disposed = false;
    // Loaded on demand: the library is only needed when a chart is opened
    import("lightweight-charts").then(({ createChart, CandlestickSeries, LineSeries, HistogramSeries, ColorType, CrosshairMode, LineStyle }) => {
      if (disposed || !box.current) return;
      const c = themeColors();
      const number = new Intl.NumberFormat("id-ID", { maximumFractionDigits: currency === "USD" ? 2 : 0 });
      const small = new Intl.NumberFormat("id-ID", { maximumSignificantDigits: 4 });
      const chart = createChart(box.current, {
        autoSize: true,
        layout: { background: { type: ColorType.Solid, color: c.card }, textColor: c.text, fontFamily: "inherit", fontSize: 11, attributionLogo: true },
        grid: { vertLines: { color: alpha(c.border, 0.6) }, horzLines: { color: alpha(c.border, 0.6) } },
        rightPriceScale: { borderColor: c.border },
        timeScale: { borderColor: c.border, timeVisible: true, secondsVisible: false, fixLeftEdge: true, fixRightEdge: true },
        crosshair: { mode: CrosshairMode.Normal },
        localization: { locale: "id-ID", priceFormatter: (p: number) => (Math.abs(p) < 1 ? small.format(p) : number.format(p)) },
        handleScroll: { vertTouchDrag: false },
      });

      const series =
        style === "candle"
          ? chart.addSeries(CandlestickSeries, { upColor: c.up, downColor: c.down, wickUpColor: c.up, wickDownColor: c.down, borderVisible: false })
          : chart.addSeries(LineSeries, { color: c.fg, lineWidth: 2, crosshairMarkerRadius: 4 });
      const minMove = candles.some((k) => k.close < 1) ? 0.00000001 : currency === "USD" ? 0.01 : 1;
      series.applyOptions({ priceFormat: { type: "price", precision: minMove < 0.01 ? 8 : minMove < 1 ? 2 : 0, minMove } });
      const points = candles.map((k) => ({ time: localTime(k.time), open: k.open, high: k.high, low: k.low, close: k.close }));
      if (style === "candle") (series as ISeriesApi<"Candlestick">).setData(points as CandlestickData<Time>[]);
      else (series as ISeriesApi<"Line">).setData(points.map((p) => ({ time: p.time, value: p.close })) as LineData<Time>[]);

      // Volume along the bottom fifth, in the candle's color
      if (candles.some((k) => k.volume > 0)) {
        const volume = chart.addSeries(HistogramSeries, { priceScaleId: "", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
        volume.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
        volume.setData(candles.map((k) => ({ time: localTime(k.time), value: k.volume, color: alpha(k.close >= k.open ? c.up : c.down, 0.35) })));
      }
      series.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: candles.some((k) => k.volume > 0) ? 0.24 : 0.08 } });

      if (avgPrice != null && avgPrice > 0) {
        series.createPriceLine({ price: avgPrice, color: c.text, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "Rata-rata beli" });
      }

      chart.subscribeCrosshairMove((param) => {
        const d = param.seriesData.get(series) as (CandlestickData & LineData) | undefined;
        if (!d) return hoverRef.current(null);
        const close = d.close ?? d.value;
        hoverRef.current({ open: d.open ?? close, high: d.high ?? close, low: d.low ?? close, close });
      });
      chart.timeScale().fitContent();
      chartRef.current = chart;
      seriesRef.current = series;
      lastRef.current = candles.at(-1) ?? null;
      applyLiveRef.current(liveRef.current);
    });
    return () => {
      disposed = true;
      chartRef.current?.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [candles, currency, style, avgPrice, dark]);

  useEffect(() => { applyLiveRef.current(livePrice); }, [livePrice]);

  return <div ref={box} className="h-full w-full" />;
}

/** A holding's price chart (TradingView-style candles), its live price, and its actions. */
export function HoldingChartDialog({ holding, prices, onClose, onTrade, onEdit }: {
  holding: Holding;
  prices: MarketPrices | null;
  onClose: () => void;
  onTrade: () => void;
  onEdit: () => void;
}) {
  const [range, setRange] = useState<ChartRange>("1D");
  const [style, setStyle] = useState<Style>("candle");
  const [history, setHistory] = useState<PriceHistory | null>(null);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);
  const fx = prices?.fx?.price ?? null;
  const quote = prices?.prices[holding.priceKey];
  const live = currentPrice(holding, quote, fx);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchPriceHistory(holding.id, range)
        .then((h) => { if (!cancelled) { setHistory(h); setFailed(false); } })
        .catch(() => { if (!cancelled) setFailed(true); });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new range starts from a skeleton
    setHistory(null);
    load();
    // Intraday ranges get new bars; the server caches them for 30 seconds
    const every = range === "1D" || range === "5D" ? 60_000 : 5 * 60_000;
    const timer = setInterval(load, every);
    return () => { cancelled = true; clearInterval(timer); };
  }, [holding.id, range]);

  const shown = history ? inHoldingCurrency(history, holding, fx) : null;
  const candles = shown?.candles ?? [];
  const currency = shown?.currency ?? holding.currency;
  const first = candles[0];
  const lastClose = live ?? candles.at(-1)?.close ?? null;
  const rangeChange = first && lastClose != null && first.open > 0 ? ((lastClose - first.open) / first.open) * 100 : null;
  const rangeTitle = RANGES.find((r) => r.value === range)!.title;
  const tone = (n: number | null | undefined) => (n == null || n === 0 ? "text-muted-foreground" : n > 0 ? "text-income" : "text-expense");
  const avgInChart = currency === holding.currency ? holding.avgPrice : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] grid-cols-1 gap-4 overflow-y-auto overflow-x-hidden rounded-2xl bg-card p-4 sm:max-w-3xl sm:p-6">
        <DialogHeader className="pr-8">
          <DialogTitle className="text-lg font-semibold">{holding.symbol}</DialogTitle>
          <DialogDescription>{holding.name || ASSET_TYPE_LABEL[holding.assetType]}, di {holding.platform}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <p className="text-2xl font-semibold tracking-tight text-foreground tabular-nums sm:text-3xl" aria-live="polite">
              {live != null ? formatMoney(live, holding.currency) : "–"}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {quote?.changePct != null && (
                <span className={tone(quote.changePct)}>{formatPercent(quote.changePct)} {holding.assetType === "CRYPTO" ? "24 jam" : "hari ini"}</span>
              )}
              {rangeChange != null && range !== "1D" && <span className={tone(rangeChange)}>{formatPercent(rangeChange)} {rangeTitle}</span>}
              <LiveBadge stale={!!quote?.stale} at={quote?.updatedAt} known={!!quote} />
            </p>
          </div>
          <SegmentedControl<ChartRange> label="Rentang waktu" value={range} onChange={setRange} className="flex w-full sm:inline-flex sm:w-auto"
            options={RANGES.map((r) => ({ value: r.value, label: r.label }))} />
        </div>

        <div className="flex items-start justify-between gap-3">
          {/* What the crosshair points at (or the last bar) */}
          <dl className="grid min-h-4 grid-cols-2 gap-x-4 gap-y-1 text-xs tabular-nums sm:flex sm:flex-wrap">
            {(() => {
              const bar = hover ?? candles.at(-1);
              if (!bar) return null;
              return ([["Buka", bar.open], ["Tertinggi", bar.high], ["Terendah", bar.low], ["Tutup", hover ? bar.close : lastClose ?? bar.close]] as const).map(([k, v]) => (
                <div key={k} className="flex min-w-0 flex-wrap gap-x-1">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="font-medium text-foreground">{formatMoney(v, currency)}</dd>
                </div>
              ));
            })()}
          </dl>
          <div role="group" aria-label="Jenis chart" className="inline-flex shrink-0 rounded-lg bg-muted p-0.5">
              {([["candle", "Candlestick", CandlestickChart], ["line", "Garis", LineChart]] as const).map(([value, label, Icon]) => (
                <button key={value} type="button" aria-pressed={style === value} aria-label={label} title={label} onClick={() => setStyle(value)}
                  className={cn("rounded-md p-1.5 transition-colors", style === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  <Icon className="size-4" aria-hidden />
                </button>
              ))}
          </div>
        </div>

        <div className="relative h-72 sm:h-96" role="img" aria-label={`Chart harga ${holding.symbol} ${rangeTitle}`}>
          {history == null && !failed ? (
            <Skeleton className="h-full w-full" />
          ) : candles.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl bg-muted px-6 text-center text-sm text-muted-foreground">
              <CircleAlert className="size-5 text-warning" aria-hidden />
              {failed ? "Chart gagal dimuat. Dicoba lagi otomatis." : "Belum ada data harga untuk rentang ini."}
            </div>
          ) : (
            <PriceChart candles={candles} currency={currency} style={style} avgPrice={avgInChart} livePrice={live} onHover={setHover} />
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {history?.source ? `Data ${history.source}` : ""}
            {history?.source && shown && history.currency !== currency ? `, dikonversi ke ${currency} dengan kurs live` : ""}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button variant="secondary" onClick={onEdit}><Pencil className="size-4" aria-hidden /> Ubah</Button>
            <Button onClick={onTrade}><ArrowLeftRight className="size-4" aria-hidden /> Beli/jual</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** "Live" with a pulsing dot, or when the price is a stored one, since when */
export function LiveBadge({ stale, at, known = true, className }: { stale: boolean; at?: string; known?: boolean; className?: string }) {
  if (!known) return <span className={className}>Harga belum tersedia</span>;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="relative flex size-2" aria-hidden>
        {!stale && <span className="absolute inline-flex size-full rounded-full bg-income opacity-60 motion-safe:animate-ping" />}
        <span className={cn("relative inline-flex size-2 rounded-full", stale ? "bg-warning" : "bg-income")} />
      </span>
      {stale ? `Tersimpan ${at ? formatTime(at) : ""}`.trim() : "Live"}
    </span>
  );
}
