"use client";

import React, { useEffect, useImperativeHandle, useRef, useState } from "react";
import type {
  IChartApi, IPriceLine, ISeriesApi, ITextWatermarkPluginApi, MouseEventParams, SeriesType, Time, UTCTimestamp,
} from "lightweight-charts";
import type { Candle } from "@/lib/portfolio";
import { heikinAshi, type Series } from "@/lib/technicals";

type LWC = typeof import("lightweight-charts");

export type ChartStyle = "candle" | "hollow" | "bar" | "heikin" | "line" | "area";
export type Tool = "cross" | "trend" | "hline" | "measure";
export type ScaleMode = "normal" | "log" | "percent";

/** TradingView's own colors: candles and the drawing blue */
export const TV = { up: "#089981", down: "#F23645", blue: "#2962FF" };

/** An indicator line (moving average, RSI, MACD...) in pane 0 (on the price) or below it */
export interface LineSpec {
  id: string;
  color: string;
  values: Series;
  pane: number;
  width?: 1 | 2;
  /** Dashed reference levels, e.g. RSI 70/30 */
  levels?: number[];
}
export interface HistSpec { id: string; values: Series; pane: number }

export interface TradingChartHandle {
  /** < 1 zooms in, > 1 zooms out, anchored on the right edge as on TradingView */
  zoom: (factor: number) => void;
  reset: () => void;
  clearDrawings: () => void;
  /** The chart as a PNG */
  screenshot: () => HTMLCanvasElement | null;
}

interface Point { time: number; price: number }
interface Drawings { trends: [Point, Point][]; hlines: number[] }
interface Measure { from: { i: number; price: number }; to: { i: number; price: number }; done: boolean }

/** Candles are in UTC; the chart prints the time stamps as given, so shift them to the viewer's clock */
export const localTime = (t: number) => (t - new Date(t * 1000).getTimezoneOffset() * 60) as UTCTimestamp;
const alpha = (hex: string, a: number) => (/^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${Math.round(a * 255).toString(16).padStart(2, "0")}` : hex);

function themeColors() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return { text: v("--muted-foreground"), border: v("--border"), bg: v("--card"), fg: v("--foreground") };
}

export function useDarkMode() {
  const [dark, setDark] = useState(() => typeof document !== "undefined" && document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setDark(root.classList.contains("dark")));
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

function loadDrawings(key: string): Drawings {
  try {
    const d = JSON.parse(localStorage.getItem(key) ?? "null");
    if (d && Array.isArray(d.trends) && Array.isArray(d.hlines)) return d;
  } catch {
    // private mode or bad data: start empty
  }
  return { trends: [], hlines: [] };
}
function saveDrawings(key: string, d: Drawings) {
  try {
    localStorage.setItem(key, JSON.stringify(d));
  } catch {
    // not saved; the drawings still show until the page closes
  }
}

const formatCountdown = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
};

/**
 * The price chart of the chart page, on TradingView's open-source library: scroll to zoom, drag
 * to pan, drag the axes to stretch, indicator panes, drawings (trend line, horizontal line,
 * measure) kept per asset in this browser, and the last bar following the live price.
 */
export function TradingChart({
  ref, bars, style, currency, volume, lines, hists, avgPrice, watermark, tool, magnet, scaleMode,
  storageKey, view, barSeconds, sessionEnd, onHover, onToolDone, onDrawingsChange,
}: {
  ref?: React.Ref<TradingChartHandle>;
  bars: Candle[];
  style: ChartStyle;
  currency: string;
  volume: boolean;
  lines: LineSpec[];
  hists: HistSpec[];
  /** The user's average buy price, as a dashed line; null hides it */
  avgPrice: number | null;
  watermark: string;
  tool: Tool;
  magnet: boolean;
  scaleMode: ScaleMode;
  /** Where the drawings of this asset and interval are kept */
  storageKey: string;
  /** A new key moves the view: to `from` (Unix seconds) or to the latest bars */
  view: { key: string; from: number | null };
  /** Bars that close on the clock (intraday, crypto days): their length in seconds, for the countdown under the price label */
  barSeconds: number | null;
  /** Otherwise the end of today's stock session (Unix seconds); null shows no countdown */
  sessionEnd: number | null;
  onHover: (index: number | null) => void;
  onToolDone: () => void;
  onDrawingsChange: (count: number) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [lib, setLib] = useState<LWC | null>(null);
  const [chartVersion, setChartVersion] = useState(0);
  const dark = useDarkMode();
  const chartRef = useRef<IChartApi | null>(null);
  const mainRef = useRef<{ series: ISeriesApi<SeriesType>; key: string } | null>(null);
  const volumeRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const linesRef = useRef(new Map<string, ISeriesApi<"Line">>());
  const histsRef = useRef(new Map<string, ISeriesApi<"Histogram">>());
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const trendRefs = useRef<ISeriesApi<"Line">[]>([]);
  const previewRef = useRef<ISeriesApi<"Line"> | null>(null);
  const previewTarget = useRef("");
  /** Rupiah prices have no decimals on the axis, dollars two */
  const decimalsRef = useRef(2);
  const watermarkRef = useRef<ITextWatermarkPluginApi<Time> | null>(null);
  const shownRef = useRef<Candle[] | null>(null);
  const appliedView = useRef<string | null>(null);
  const [drawings, setDrawings] = useState<Drawings>({ trends: [], hlines: [] });
  const [pending, setPending] = useState<Point | null>(null);
  const [measure, setMeasure] = useState<Measure | null>(null);
  const [, setTick] = useState(0);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  const shown = style === "heikin" ? heikinAshi(bars) : bars;
  const countdownEnd = barSeconds ? (Math.floor(now / barSeconds) + 1) * barSeconds : sessionEnd;
  const ticking = barSeconds != null || sessionEnd != null;

  // Everything the chart's event handlers need, always current
  const live = useRef({ shown, bars, tool, magnet, pending, measure, drawings, storageKey, onHover, onToolDone });
  useEffect(() => {
    live.current = { shown, bars, tool, magnet, pending, measure, drawings, storageKey, onHover, onToolDone };
  });

  // Loaded on demand: only the chart page needs the library
  useEffect(() => {
    let cancelled = false;
    import("lightweight-charts").then((m) => !cancelled && setLib(m));
    return () => { cancelled = true; };
  }, []);

  // Drawings of this asset and interval
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read from browser storage when the asset or interval changes
    setDrawings(loadDrawings(storageKey));
    setPending(null);
    setMeasure(null);
  }, [storageKey]);
  // Another tool drops a half-drawn trend line
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to the toolbar
    if (tool !== "trend") setPending(null);
  }, [tool]);
  useEffect(() => { onDrawingsChange(drawings.trends.length + drawings.hlines.length); }, [drawings, onDrawingsChange]);

  // ------------------------------------------------------------ the chart itself (rebuilt when the theme changes)
  useEffect(() => {
    if (!lib || !box.current) return;
    const lineSeries = linesRef.current;
    const histSeries = histsRef.current;
    const c = themeColors();
    const formats = [0, 2].map((d) => new Intl.NumberFormat("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d }));
    const small = new Intl.NumberFormat("id-ID", { maximumSignificantDigits: 4 });
    const chart = lib.createChart(box.current, {
      autoSize: true,
      layout: {
        background: { type: lib.ColorType.Solid, color: c.bg }, textColor: c.text, fontFamily: "inherit", fontSize: 11,
        attributionLogo: true, panes: { separatorColor: c.border, separatorHoverColor: alpha(TV.blue, 0.2), enableResize: true },
      },
      grid: { vertLines: { color: alpha(c.border, 0.55) }, horzLines: { color: alpha(c.border, 0.55) } },
      rightPriceScale: { borderColor: c.border, scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { borderColor: c.border, timeVisible: true, secondsVisible: false, rightOffset: 8, barSpacing: 8, minBarSpacing: 0.3, shiftVisibleRangeOnNewBar: true },
      crosshair: {
        mode: lib.CrosshairMode.Normal,
        vertLine: { color: alpha(c.text, 0.7), labelBackgroundColor: dark ? "#2A2E39" : "#131722" },
        horzLine: { color: alpha(c.text, 0.7), labelBackgroundColor: dark ? "#2A2E39" : "#131722" },
      },
      localization: { locale: "id-ID", priceFormatter: (p: number) => (Math.abs(p) > 0 && Math.abs(p) < 1 ? small.format(p) : formats[decimalsRef.current ? 1 : 0].format(p)) },
      // Scroll wheel zooms, dragging pans, as on TradingView
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: true }, axisDoubleClickReset: { time: true, price: true } },
      kineticScroll: { mouse: false, touch: true },
    });
    watermarkRef.current = lib.createTextWatermark(chart.panes()[0], {
      horzAlign: "center", vertAlign: "center",
      lines: [{ text: "", color: alpha(c.text, 0.12), fontSize: 56, fontFamily: "inherit", fontStyle: "600" }],
    });

    chart.subscribeCrosshairMove(onMove);
    // The library drops a second click within half a second (it waits for a double click), which
    // loses the second point of a quick trend line: clicks are read from the pointer instead
    const el = box.current;
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => { down = e.button === 0 ? { x: e.clientX, y: e.clientY } : null; };
    const onUp = (e: PointerEvent) => {
      if (!down || Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 4) return;
      down = null;
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      // Only the price pane (not the axes or the indicator panes below)
      if (x > chart.paneSize(0).width || y > chart.paneSize(0).height) return onClick(null);
      onClick({ x, y, logical: chart.timeScale().coordinateToLogical(x) });
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    const bump = () => setTick((t) => t + 1);
    chart.timeScale().subscribeVisibleLogicalRangeChange(bump);
    chartRef.current = chart;
    setChartVersion((v) => v + 1);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      chart.remove();
      chartRef.current = null;
      mainRef.current = null;
      volumeRef.current = null;
      lineSeries.clear();
      histSeries.clear();
      priceLinesRef.current = [];
      trendRefs.current = [];
      previewRef.current = null;
      watermarkRef.current = null;
      shownRef.current = null;
      appliedView.current = null;
    };
    // The handlers read `live`; the chart is rebuilt only for a new theme
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lib, dark]);

  // ------------------------------------------------------------ data and indicators
  useEffect(() => {
    const chart = chartRef.current;
    if (!lib || !chart) return;
    const c = themeColors();
    const fine = bars.some((k) => k.close > 0 && k.close < 1);
    const minMove = fine ? 0.00000001 : currency === "USD" ? 0.01 : 1;
    const precision = minMove < 0.01 ? 8 : minMove < 1 ? 2 : 0;
    decimalsRef.current = currency === "USD" ? 2 : 0;

    // Main series: recreated when the chart type changes
    const key = `${style}|${precision}`;
    if (!mainRef.current || mainRef.current.key !== key) {
      const range = chart.timeScale().getVisibleLogicalRange();
      if (mainRef.current) chart.removeSeries(mainRef.current.series);
      priceLinesRef.current = [];
      const common = { priceFormat: { type: "price" as const, precision, minMove }, priceLineStyle: lib.LineStyle.Dotted };
      let series: ISeriesApi<SeriesType>;
      if (style === "line") series = chart.addSeries(lib.LineSeries, { ...common, color: TV.blue, lineWidth: 2 });
      else if (style === "area") series = chart.addSeries(lib.AreaSeries, { ...common, lineColor: TV.blue, topColor: alpha(TV.blue, 0.28), bottomColor: alpha(TV.blue, 0.02), lineWidth: 2 });
      else if (style === "bar") series = chart.addSeries(lib.BarSeries, { ...common, upColor: TV.up, downColor: TV.down, thinBars: false });
      else {
        series = chart.addSeries(lib.CandlestickSeries, {
          ...common, upColor: style === "hollow" ? "rgba(0,0,0,0)" : TV.up, downColor: TV.down,
          borderVisible: true, borderUpColor: TV.up, borderDownColor: TV.down, wickUpColor: TV.up, wickDownColor: TV.down,
        });
      }
      mainRef.current = { series, key };
      shownRef.current = null;
      if (range) requestAnimationFrame(() => chartRef.current?.timeScale().setVisibleLogicalRange(range));
    }
    const main = mainRef.current.series;
    const ohlc = style !== "line" && style !== "area";
    const point = (k: Candle) => (ohlc
      ? { time: localTime(k.time), open: k.open, high: k.high, low: k.low, close: k.close }
      : { time: localTime(k.time), value: k.close });

    // A live tick changes the last bar (or adds one): update it instead of redrawing everything
    const prev = shownRef.current;
    const sameStart = prev && prev.length > 0 && shown.length > 0 && prev[0].time === shown[0].time;
    try {
      if (sameStart && shown.length === prev.length) main.update(point(shown[shown.length - 1]));
      else if (sameStart && shown.length === prev.length + 1) {
        main.update(point(shown[shown.length - 2]));
        main.update(point(shown[shown.length - 1]));
      } else main.setData(shown.map(point));
    } catch {
      main.setData(shown.map(point));
    }
    shownRef.current = shown;

    // Volume along the bottom fifth of the price pane
    if (volume && bars.some((k) => k.volume > 0)) {
      if (!volumeRef.current) {
        volumeRef.current = chart.addSeries(lib.HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
        volumeRef.current.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      }
      volumeRef.current.setData(bars.map((k) => ({ time: localTime(k.time), value: k.volume, color: alpha(k.close >= k.open ? TV.up : TV.down, 0.45) })));
      main.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.22 } });
    } else {
      if (volumeRef.current) chart.removeSeries(volumeRef.current);
      volumeRef.current = null;
      main.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.08 } });
    }

    const toPoints = (values: Series) => bars.map((k, i) => (values[i] == null ? { time: localTime(k.time) } : { time: localTime(k.time), value: values[i]! }));

    // Indicator lines
    const wantedLines = new Set(lines.map((l) => l.id));
    for (const [id, s] of linesRef.current) if (!wantedLines.has(id)) { chart.removeSeries(s); linesRef.current.delete(id); }
    const wantedHists = new Set(hists.map((h) => h.id));
    for (const [id, s] of histsRef.current) if (!wantedHists.has(id)) { chart.removeSeries(s); histsRef.current.delete(id); }
    for (const spec of lines) {
      let s = linesRef.current.get(spec.id);
      if (!s) {
        s = chart.addSeries(lib.LineSeries, {
          color: spec.color, lineWidth: spec.width ?? 1, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false,
          priceFormat: spec.pane === 0 ? { type: "price", precision, minMove } : { type: "price", precision: 2, minMove: 0.01 },
        }, spec.pane);
        for (const level of spec.levels ?? []) {
          s.createPriceLine({ price: level, color: alpha(c.text, 0.6), lineWidth: 1, lineStyle: lib.LineStyle.Dashed, axisLabelVisible: false, title: "" });
        }
        linesRef.current.set(spec.id, s);
      } else if (s.getPane().paneIndex() !== spec.pane) {
        s.moveToPane(spec.pane);
      }
      s.setData(toPoints(spec.values));
    }
    for (const spec of hists) {
      let s = histsRef.current.get(spec.id);
      if (!s) {
        s = chart.addSeries(lib.HistogramSeries, { priceLineVisible: false, lastValueVisible: false, priceFormat: { type: "price", precision: 2, minMove: 0.01 } }, spec.pane);
        histsRef.current.set(spec.id, s);
      } else if (s.getPane().paneIndex() !== spec.pane) {
        s.moveToPane(spec.pane);
      }
      s.setData(bars.map((k, i) => {
        const v = spec.values[i];
        if (v == null) return { time: localTime(k.time) };
        const before = spec.values[i - 1] ?? v;
        const color = v >= 0 ? (v >= before ? TV.up : alpha(TV.up, 0.5)) : (v <= before ? TV.down : alpha(TV.down, 0.5));
        return { time: localTime(k.time), value: v, color };
      }));
    }
    chart.panes().forEach((p, i) => p.setStretchFactor(i === 0 ? 3 : 1));

    // Price lines on the price: the average buy price and the horizontal lines drawn
    for (const pl of priceLinesRef.current) main.removePriceLine(pl);
    priceLinesRef.current = [];
    if (avgPrice != null && avgPrice > 0) {
      priceLinesRef.current.push(main.createPriceLine({ price: avgPrice, color: c.fg, lineWidth: 1, lineStyle: lib.LineStyle.Dashed, axisLabelVisible: true, title: "Rata-rata beli" }));
    }
    for (const price of drawings.hlines) {
      priceLinesRef.current.push(main.createPriceLine({ price, color: TV.blue, lineWidth: 1, lineStyle: lib.LineStyle.Solid, axisLabelVisible: true, title: "" }));
    }

    chart.priceScale("right").applyOptions({
      mode: scaleMode === "log" ? lib.PriceScaleMode.Logarithmic : scaleMode === "percent" ? lib.PriceScaleMode.Percentage : lib.PriceScaleMode.Normal,
    });
    watermarkRef.current?.applyOptions({ lines: [{ text: watermark, color: alpha(c.text, 0.12), fontSize: 56, fontFamily: "inherit", fontStyle: "600" }] });

    // A new interval or range: move the view once the bars are there
    if (shown.length && appliedView.current !== view.key) {
      appliedView.current = view.key;
      applyView(view.from);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lib, chartVersion, bars, style, currency, volume, lines, hists, avgPrice, drawings.hlines, scaleMode, watermark, view.key]);

  // ------------------------------------------------------------ trend lines
  useEffect(() => {
    const chart = chartRef.current;
    if (!lib || !chart) return;
    for (const s of trendRefs.current) chart.removeSeries(s);
    trendRefs.current = drawings.trends.map(([a, b]) => {
      const s = chart.addSeries(lib.LineSeries, trendOptions(lib));
      s.setData([a, b].sort((x, y) => x.time - y.time).map((p) => ({ time: localTime(p.time), value: p.price })));
      return s;
    });
  }, [lib, chartVersion, drawings.trends]);

  // The preview of a trend line follows the mouse (see onMove)
  useEffect(() => {
    const chart = chartRef.current;
    if (!lib || !chart) return;
    if (pending && !previewRef.current) previewRef.current = chart.addSeries(lib.LineSeries, { ...trendOptions(lib), lineStyle: lib.LineStyle.Dashed });
    if (!pending && previewRef.current) {
      chart.removeSeries(previewRef.current);
      previewRef.current = null;
    }
  }, [lib, chartVersion, pending]);

  // The bar close countdown ticks every second
  useEffect(() => {
    if (!ticking) return;
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, [ticking]);

  function applyView(from: number | null) {
    const chart = chartRef.current;
    const data = live.current.shown;
    if (!chart || !data.length) return;
    const n = data.length;
    if (from != null) {
      const first = data.findIndex((k) => k.time >= from);
      chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, first === -1 ? 0 : first) - 0.5, to: n - 1 + 6 });
    } else {
      chart.timeScale().setVisibleLogicalRange({ from: Math.max(-2, n - 140), to: n - 1 + 8 });
    }
  }

  /** The price under the pointer; with the magnet, the nearest open/high/low/close of the bar */
  function priceAt(y: number, i: number): number | null {
    const main = mainRef.current?.series;
    if (!main) return null;
    const raw = main.coordinateToPrice(y);
    if (raw == null) return null;
    const bar = live.current.shown[i];
    if (!live.current.magnet || !bar) return raw;
    return [bar.open, bar.high, bar.low, bar.close].reduce((best, p) => (Math.abs(p - raw) < Math.abs(best - raw) ? p : best), bar.close);
  }

  function indexOf(param: MouseEventParams<Time>): number | null {
    if (param.logical == null || !param.point) return null;
    const i = Math.round(param.logical);
    return i >= 0 && i < live.current.shown.length ? i : null;
  }

  function onMove(param: MouseEventParams<Time>) {
    const i = indexOf(param);
    live.current.onHover(i);
    const { pending: p, measure: m, shown: data } = live.current;
    if (i == null || (param.paneIndex ?? 0) !== 0) return;
    const price = param.point ? priceAt(param.point.y, i) : null;
    if (price == null) return;
    if (p && previewRef.current && data[i].time !== p.time) {
      // setData inside a crosshair event fires another crosshair event: only on a new point, and on the next frame
      const target = `${data[i].time}:${price}`;
      if (previewTarget.current !== target) {
        previewTarget.current = target;
        const points = [p, { time: data[i].time, price }].sort((x, y) => x.time - y.time).map((q) => ({ time: localTime(q.time), value: q.price }));
        requestAnimationFrame(() => previewRef.current?.setData(points));
      }
    }
    if (m && !m.done) setMeasure({ ...m, to: { i, price } });
  }

  /** A click on the price pane (null: somewhere else on the chart) */
  function onClick(at: { x: number; y: number; logical: number | null } | null) {
    const { tool: t, pending: p, measure: m, shown: data, drawings: d, storageKey: key } = live.current;
    const i = at?.logical == null ? null : Math.round(at.logical);
    if (t === "cross") {
      if (m) setMeasure(null);
      return;
    }
    if (!at || i == null || i < 0 || i >= data.length) return;
    const price = priceAt(at.y, i);
    if (price == null) return;
    const store = (next: Drawings) => { setDrawings(next); saveDrawings(key, next); };
    if (t === "hline") {
      store({ ...d, hlines: [...d.hlines, price] });
      live.current.onToolDone();
    } else if (t === "trend") {
      if (!p) setPending({ time: data[i].time, price });
      else if (data[i].time !== p.time) {
        store({ ...d, trends: [...d.trends, [p, { time: data[i].time, price }]] });
        setPending(null);
        live.current.onToolDone();
      }
    } else if (t === "measure") {
      if (!m || m.done) setMeasure({ from: { i, price }, to: { i, price }, done: false });
      else {
        setMeasure({ ...m, to: { i, price }, done: true });
        live.current.onToolDone();
      }
    }
  }

  useImperativeHandle(ref, () => ({
    zoom(factor: number) {
      const ts = chartRef.current?.timeScale();
      const r = ts?.getVisibleLogicalRange();
      if (!ts || !r) return;
      const width = Math.max(8, (r.to - r.from) * factor);
      ts.setVisibleLogicalRange({ from: r.to - width, to: r.to });
    },
    reset() {
      chartRef.current?.priceScale("right").applyOptions({ autoScale: true });
      applyView(null);
    },
    screenshot() {
      return chartRef.current?.takeScreenshot() ?? null;
    },
    clearDrawings() {
      const empty = { trends: [], hlines: [] };
      setDrawings(empty);
      saveDrawings(live.current.storageKey, empty);
      setPending(null);
      setMeasure(null);
    },
  }));

  // Overlays positioned on the chart's coordinates (they follow scrolling and zooming)
  const chart = chartRef.current;
  const main = mainRef.current?.series;
  let measureBox: React.ReactNode = null;
  if (chart && main && measure) {
    const x1 = chart.timeScale().logicalToCoordinate(measure.from.i as never);
    const x2 = chart.timeScale().logicalToCoordinate(measure.to.i as never);
    const y1 = main.priceToCoordinate(measure.from.price);
    const y2 = main.priceToCoordinate(measure.to.price);
    if (x1 != null && x2 != null && y1 != null && y2 != null) {
      const diff = measure.to.price - measure.from.price;
      const pct = measure.from.price ? (diff / measure.from.price) * 100 : 0;
      const up = diff >= 0;
      const color = up ? TV.blue : TV.down;
      const fmt = new Intl.NumberFormat("id-ID", { maximumSignificantDigits: 6 });
      const pctFmt = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });
      const bars = measure.to.i - measure.from.i;
      measureBox = (
        <div className="pointer-events-none absolute" style={{ left: Math.min(x1, x2), top: Math.min(y1, y2), width: Math.max(1, Math.abs(x2 - x1)), height: Math.max(1, Math.abs(y2 - y1)), background: alpha(color, 0.18), outline: `1px solid ${alpha(color, 0.6)}` }}>
          <div className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded px-2 py-1 text-center text-[11px] font-medium leading-tight text-white tabular-nums"
            style={{ background: color, [up ? "bottom" : "top"]: "calc(100% + 4px)" }}>
            {up ? "+" : "−"}{fmt.format(Math.abs(diff))} ({up ? "+" : "−"}{pctFmt.format(Math.abs(pct))}%)
            <br />{Math.abs(bars)} bar
          </div>
        </div>
      );
    }
  }
  let countdown: React.ReactNode = null;
  if (chart && main && countdownEnd != null && shown.length && now < countdownEnd) {
    const lastBar = shown[shown.length - 1];
    const y = main.priceToCoordinate(lastBar.close);
    const height = chart.paneSize(0).height;
    if (y != null && y > 0 && y < height - 24) {
      countdown = (
        <div className="pointer-events-none absolute right-0 px-1 text-center text-[11px] leading-[16px] text-white tabular-nums"
          style={{ top: y + 9, width: chart.priceScale("right").width(), background: lastBar.close >= lastBar.open ? TV.up : TV.down }}>
          {formatCountdown(countdownEnd - now)}
        </div>
      );
    }
  }

  return (
    <div className={tool === "cross" ? "relative h-full w-full" : "relative h-full w-full [&_canvas]:cursor-crosshair"}>
      <div ref={box} className="h-full w-full" />
      {measureBox}
      {countdown}
    </div>
  );
}

function trendOptions(lib: LWC) {
  return {
    color: TV.blue, lineWidth: 2 as const, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
    pointMarkersVisible: true, pointMarkersRadius: 3, lineStyle: lib.LineStyle.Solid,
    // Drawings never stretch the price scale
    autoscaleInfoProvider: () => null,
  };
}
