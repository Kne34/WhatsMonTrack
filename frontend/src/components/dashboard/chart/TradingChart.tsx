"use client";

import React, { useEffect, useImperativeHandle, useRef, useState } from "react";
import type { IChartApi, IPriceLine, ISeriesApi, ITextWatermarkPluginApi, MouseEventParams, SeriesType, Time, UTCTimestamp } from "lightweight-charts";
import { Pencil, Trash2 } from "lucide-react";
import type { Candle } from "@/lib/portfolio";
import { heikinAshi, type Series } from "@/lib/technicals";
import { TV, alpha } from "./colors";
import { DRAW_COLORS, TOOLS, makeDrawing, newId, paint, type Drawing, type DrawKind, type Geometry, type Point, type Tool } from "./drawings";

export { TV } from "./colors";
export type { Tool } from "./drawings";

type LWC = typeof import("lightweight-charts");

export type ChartStyle = "candle" | "hollow" | "bar" | "heikin" | "line" | "area";
export type ScaleMode = "normal" | "log" | "percent";

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

/** Candles are in UTC; the chart prints the time stamps as given, so shift them to the viewer's clock */
export const localTime = (t: number) => (t - new Date(t * 1000).getTimezoneOffset() * 60) as UTCTimestamp;

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

// ---------------------------------------------------------------- drawings in browser storage

const KINDS = new Set(Object.keys(TOOLS));
function loadDrawings(key: string, legacyPrefix?: string): Drawing[] {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null");
    if (Array.isArray(saved)) {
      return saved.filter((d): d is Drawing => d && typeof d.id === "string" && KINDS.has(d.kind) && Array.isArray(d.points) && d.points.every((p: Point) => Number.isFinite(p?.time) && Number.isFinite(p?.price)));
    }
    // Drawings of the first chart page were kept per interval as { trends, hlines }
    if (!legacyPrefix) return [];
    const out: Drawing[] = [];
    const old: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(legacyPrefix)) continue;
      old.push(k);
      const d = JSON.parse(localStorage.getItem(k) ?? "null");
      for (const [a, b] of d?.trends ?? []) out.push({ id: newId(), kind: "trend", points: [a, b], color: TV.blue });
      for (const price of d?.hlines ?? []) out.push({ id: newId(), kind: "hline", points: [{ time: 0, price }], color: TV.blue });
    }
    if (old.length) {
      localStorage.setItem(key, JSON.stringify(out));
      old.forEach((k) => localStorage.removeItem(k));
    }
    return out;
  } catch {
    // private mode or bad data: start empty
    return [];
  }
}
function saveDrawings(key: string, d: Drawing[]) {
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

interface Drag { id: string; handle: number | null; x: number; y: number; orig: Point[]; moved: boolean }

/**
 * The price chart of the chart page, on TradingView's open-source library: scroll to zoom, drag
 * to pan, drag the axes to stretch, indicator panes, and the drawing tools of TradingView's left
 * toolbar painted on an SVG layer (select a drawing to drag it or its points, recolor or delete
 * it). Drawings are kept per asset in this browser, in the asset's own currency, so they show on
 * every interval and in rupiah as well.
 */
export function TradingChart({
  ref, bars, style, currency, volume, lines, hists, avgPrice, watermark, tool, magnet, keepTool, locked, hidden, scaleMode,
  priceFactor, storageKey, legacyPrefix, view, barSeconds, sessionEnd, onHover, onToolDone, onDrawingsChange,
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
  /** Stay on the drawing tool after a drawing (otherwise back to the cursor) */
  keepTool: boolean;
  /** Drawings can't be selected or moved */
  locked: boolean;
  hidden: boolean;
  scaleMode: ScaleMode;
  /** Shown prices = the asset's own prices × this (the dollar-rupiah rate when shown in rupiah) */
  priceFactor: number;
  /** Where the drawings of this asset are kept */
  storageKey: string;
  /** Keys of drawings kept the old way, moved to `storageKey` once */
  legacyPrefix?: string;
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
  /** Rupiah prices have no decimals on the axis, dollars two */
  const decimalsRef = useRef(2);
  const bgRef = useRef("#000");
  const watermarkRef = useRef<ITextWatermarkPluginApi<Time> | null>(null);
  const shownRef = useRef<Candle[] | null>(null);
  const appliedView = useRef<string | null>(null);
  const drag = useRef<Drag | null>(null);
  const brush = useRef<Point[] | null>(null);

  const [store, setStore] = useState<{ key: string; list: Drawing[] }>({ key: "", list: [] });
  const drawings = store.key === storageKey ? store.list : [];
  const [pending, setPending] = useState<Point[]>([]);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [color, setColor] = useState(DRAW_COLORS[0]);
  const [textEdit, setTextEdit] = useState<{ id: string | null; point: Point; value: string } | null>(null);
  const [brushPoints, setBrushPoints] = useState<Point[] | null>(null);
  const [, setTick] = useState(0);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  const shown = style === "heikin" ? heikinAshi(bars) : bars;
  const countdownEnd = barSeconds ? (Math.floor(now / barSeconds) + 1) * barSeconds : sessionEnd;
  const ticking = barSeconds != null || sessionEnd != null;
  const k = priceFactor || 1;

  // Everything the chart's event handlers need, always current
  const live = useRef({ shown, tool, magnet, keepTool, pending, drawings, color, k, storageKey, onHover, onToolDone });
  useEffect(() => {
    live.current = { shown, tool, magnet, keepTool, pending, drawings, color, k, storageKey, onHover, onToolDone };
  });

  // Loaded on demand: only the chart page needs the library
  useEffect(() => {
    let cancelled = false;
    import("lightweight-charts").then((m) => !cancelled && setLib(m));
    return () => { cancelled = true; };
  }, []);

  // Drawings of this asset; saved on every change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read from browser storage when the asset changes
    setStore({ key: storageKey, list: loadDrawings(storageKey, legacyPrefix) });
    setPending([]);
    setSelected(null);
    setTextEdit(null);
  }, [storageKey, legacyPrefix]);
  useEffect(() => {
    if (store.key) saveDrawings(store.key, store.list);
  }, [store]);
  useEffect(() => { onDrawingsChange(drawings.length); }, [drawings.length, onDrawingsChange]);
  const setDrawings = (update: (list: Drawing[]) => Drawing[]) => setStore((s) => (s.key === live.current.storageKey ? { ...s, list: update(s.list) } : s));

  // Another tool drops a half-made drawing; the brush draws instead of panning
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to the toolbar
    setPending([]);
    setCursor(null);
    if (tool !== "cross" && tool !== "eraser") setSelected(null);
    const drawing = tool === "brush";
    chartRef.current?.applyOptions({ handleScroll: { pressedMouseMove: !drawing, horzTouchDrag: !drawing, vertTouchDrag: false } });
  }, [tool, chartVersion]);

  // Delete removes the selected drawing, Escape lets go of it
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select, [role=dialog]")) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selected) {
        e.preventDefault();
        setDrawings((list) => list.filter((d) => d.id !== selected));
        setSelected(null);
      } else if (e.key === "Escape") {
        setPending([]);
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  // ------------------------------------------------------------ the chart itself (rebuilt when the theme changes)
  useEffect(() => {
    if (!lib || !box.current) return;
    const lineSeries = linesRef.current;
    const histSeries = histsRef.current;
    const c = themeColors();
    bgRef.current = c.bg;
    const formats = [0, 2].map((d) => new Intl.NumberFormat("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d }));
    const small = new Intl.NumberFormat("id-ID", { maximumSignificantDigits: 4 });
    const chart = lib.createChart(box.current, {
      autoSize: true,
      layout: {
        background: { type: lib.ColorType.Solid, color: c.bg }, textColor: c.text, fontFamily: "inherit", fontSize: 11,
        // The library's license asks for a link to TradingView; it is in the page's data sources instead of a logo on the chart
        attributionLogo: false, panes: { separatorColor: c.border, separatorHoverColor: alpha(TV.blue, 0.2), enableResize: true },
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
    // loses the second point of a quick drawing: clicks are read from the pointer instead
    const el = box.current;
    let down: { x: number; y: number } | null = null;
    const local = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const inPane = (x: number, y: number) => x <= chart.paneSize(0).width && y <= chart.paneSize(0).height;
    const onDown = (e: PointerEvent) => {
      down = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
      const { x, y } = local(e);
      if (down && live.current.tool === "brush" && inPane(x, y)) {
        const p = pointAt(x, y, false);
        if (p) {
          brush.current = [p];
          setBrushPoints([p]);
          el.setPointerCapture(e.pointerId);
        }
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!brush.current) return;
      const { x, y } = local(e);
      const p = pointAt(x, y, false);
      if (p) {
        brush.current = [...brush.current, p];
        setBrushPoints(brush.current);
      }
    };
    const onUp = (e: PointerEvent) => {
      if (brush.current) {
        const points = brush.current;
        brush.current = null;
        setBrushPoints(null);
        if (points.length > 1) addDrawing(makeDrawing("brush", points, live.current.color));
        return;
      }
      if (!down || Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 4) return;
      down = null;
      const { x, y } = local(e);
      // Only the price pane (not the axes or the indicator panes below)
      if (!inPane(x, y)) return onClick(null);
      onClick({ x, y });
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onUp);
    chartRef.current = chart;
    setChartVersion((v) => v + 1);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onUp);
      chart.remove();
      chartRef.current = null;
      mainRef.current = null;
      volumeRef.current = null;
      lineSeries.clear();
      histSeries.clear();
      priceLinesRef.current = [];
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
    const fine = bars.some((b) => b.close > 0 && b.close < 1);
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
    const point = (b: Candle) => (ohlc
      ? { time: localTime(b.time), open: b.open, high: b.high, low: b.low, close: b.close }
      : { time: localTime(b.time), value: b.close });

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
    if (volume && bars.some((b) => b.volume > 0)) {
      if (!volumeRef.current) {
        volumeRef.current = chart.addSeries(lib.HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
        volumeRef.current.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      }
      volumeRef.current.setData(bars.map((b) => ({ time: localTime(b.time), value: b.volume, color: alpha(b.close >= b.open ? TV.up : TV.down, 0.45) })));
      main.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.22 } });
    } else {
      if (volumeRef.current) chart.removeSeries(volumeRef.current);
      volumeRef.current = null;
      main.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.08 } });
    }

    const toPoints = (values: Series) => bars.map((b, i) => (values[i] == null ? { time: localTime(b.time) } : { time: localTime(b.time), value: values[i]! }));

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
      s.setData(bars.map((b, i) => {
        const v = spec.values[i];
        if (v == null) return { time: localTime(b.time) };
        const before = spec.values[i - 1] ?? v;
        const col = v >= 0 ? (v >= before ? TV.up : alpha(TV.up, 0.5)) : (v <= before ? TV.down : alpha(TV.down, 0.5));
        return { time: localTime(b.time), value: v, color: col };
      }));
    }
    chart.panes().forEach((p, i) => p.setStretchFactor(i === 0 ? 3 : 1));

    // The average buy price as a dashed line on the price
    for (const pl of priceLinesRef.current) main.removePriceLine(pl);
    priceLinesRef.current = [];
    if (avgPrice != null && avgPrice > 0) {
      priceLinesRef.current.push(main.createPriceLine({ price: avgPrice, color: c.fg, lineWidth: 1, lineStyle: lib.LineStyle.Dashed, axisLabelVisible: true, title: "Rata-rata beli" }));
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
  }, [lib, chartVersion, bars, style, currency, volume, lines, hists, avgPrice, scaleMode, watermark, view.key]);

  // The drawings follow every move of the view: scrolling, zooming, stretching the price axis
  useEffect(() => {
    let raf = 0;
    let last = "";
    const loop = () => {
      const chart = chartRef.current;
      const main = mainRef.current?.series;
      if (chart && main) {
        const r = chart.timeScale().getVisibleLogicalRange();
        const size = chart.paneSize(0);
        const ref = live.current.shown.at(-1)?.close ?? 1;
        const sig = `${r?.from}|${r?.to}|${main.priceToCoordinate(ref)}|${main.priceToCoordinate(ref * 1.1)}|${size.width}|${size.height}`;
        if (sig !== last) {
          last = sig;
          setTick((t) => t + 1);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

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
      const first = data.findIndex((b) => b.time >= from);
      chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, first === -1 ? 0 : first) - 0.5, to: n - 1 + 6 });
    } else {
      chart.timeScale().setVisibleLogicalRange({ from: Math.max(-2, n - 140), to: n - 1 + 8 });
    }
  }

  // ------------------------------------------------------------ time and price <-> screen

  /** The length of one bar in seconds (for times past the last bar) */
  function step() {
    const d = live.current.shown;
    return d.length > 1 ? d[d.length - 1].time - d[d.length - 2].time : 86_400;
  }
  /** Bar index of a time, fractional between bars and past either end */
  function logicalOf(time: number): number {
    const d = live.current.shown;
    const n = d.length;
    if (!n) return 0;
    if (time >= d[n - 1].time) return n - 1 + (time - d[n - 1].time) / step();
    if (time <= d[0].time) return (time - d[0].time) / step();
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (d[mid].time <= time) lo = mid;
      else hi = mid;
    }
    return lo + (time - d[lo].time) / (d[hi].time - d[lo].time);
  }
  /** The time of a bar index (snapped to the bar), also past the last bar */
  function timeOf(logical: number): number {
    const d = live.current.shown;
    const n = d.length;
    const i = Math.round(logical);
    if (!n) return 0;
    if (i >= 0 && i < n) return d[i].time;
    return i >= n ? d[n - 1].time + (i - (n - 1)) * step() : d[0].time + i * step();
  }
  const xOf = (time: number) => chartRef.current?.timeScale().logicalToCoordinate(logicalOf(time) as never) ?? null;
  const yOf = (price: number) => mainRef.current?.series.priceToCoordinate(price * live.current.k) ?? null;

  /** The point under a screen position, in the asset's own prices; the magnet snaps to the bar's open/high/low/close */
  function pointAt(x: number, y: number, snap: boolean): Point | null {
    const chart = chartRef.current;
    const main = mainRef.current?.series;
    if (!chart || !main) return null;
    const logical = chart.timeScale().coordinateToLogical(x);
    const raw = main.coordinateToPrice(y);
    if (logical == null || raw == null) return null;
    let price: number = raw;
    const bar = live.current.shown[Math.round(logical)];
    if (snap && live.current.magnet && bar) {
      price = [bar.open, bar.high, bar.low, bar.close].reduce((best, p) => (Math.abs(p - raw) < Math.abs(best - raw) ? p : best), bar.close);
    }
    return { time: timeOf(logical), price: price / live.current.k };
  }

  function addDrawing(d: Drawing) {
    setDrawings((list) => [...list, d]);
    setSelected(d.id);
    if (!live.current.keepTool) live.current.onToolDone();
  }

  function onMove(param: MouseEventParams<Time>) {
    const i = param.logical == null || !param.point ? null : Math.round(param.logical);
    live.current.onHover(i != null && i >= 0 && i < live.current.shown.length ? i : null);
    if (live.current.pending.length && param.point && (param.paneIndex ?? 0) === 0) {
      setCursor(pointAt(param.point.x, param.point.y, true));
    }
  }

  /** A click on the price pane (null: somewhere else on the chart) */
  function onClick(at: { x: number; y: number } | null) {
    const { tool: t, pending: p, color: col } = live.current;
    if (t === "cross") return setSelected(null);
    if (t === "eraser" || t === "brush" || !at) return;
    const pt = pointAt(at.x, at.y, true);
    if (!pt) return;
    if (t === "text") {
      setTextEdit({ id: null, point: pt, value: "" });
      return;
    }
    const last = p[p.length - 1];
    if (last && last.time === pt.time && last.price === pt.price) return;
    const points = [...p, pt];
    if (points.length >= TOOLS[t].clicks) {
      setPending([]);
      setCursor(null);
      addDrawing(makeDrawing(t, points, col));
    } else {
      setPending(points);
    }
  }

  // ------------------------------------------------------------ selecting, moving, erasing

  function startDrag(e: React.PointerEvent, id: string, handle: number | null) {
    if (tool === "eraser") {
      e.stopPropagation();
      setDrawings((list) => list.filter((d) => d.id !== id));
      return;
    }
    if (tool !== "cross" || locked) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setSelected(id);
    const d = drawings.find((x) => x.id === id);
    if (d) drag.current = { id, handle, x: e.clientX, y: e.clientY, orig: d.points, moved: false };
  }
  function moveDrag(e: React.PointerEvent) {
    const g = drag.current;
    if (!g || !box.current) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
    g.moved = true;
    setDrawings((list) => list.map((d) => {
      if (d.id !== g.id) return d;
      const shift = (p: Point, snap: boolean) => {
        const x = xOf(p.time);
        const y = yOf(p.price);
        return x == null || y == null ? p : pointAt(x + dx, y + dy, snap) ?? p;
      };
      if (g.handle == null) return { ...d, points: g.orig.map((p) => shift(p, false)) };
      const h = g.handle;
      const moved = shift(g.orig[h], true);
      const points = g.orig.map((p, i) => (i === h ? moved : p));
      // A position's target and stop end at the same time
      if ((d.kind === "long" || d.kind === "short") && h > 0) points[3 - h] = { ...points[3 - h], time: moved.time };
      return { ...d, points };
    }));
  }
  const endDrag = () => { drag.current = null; };

  const update = (id: string, change: Partial<Drawing>) => setDrawings((list) => list.map((d) => (d.id === id ? { ...d, ...change } : d)));
  function commitText() {
    if (!textEdit) return;
    const text = textEdit.value.trim();
    if (textEdit.id) {
      if (text) update(textEdit.id, { text });
    } else if (text) {
      addDrawing({ ...makeDrawing("text", [textEdit.point], color), text });
    }
    setTextEdit(null);
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
      setDrawings(() => []);
      setPending([]);
      setSelected(null);
    },
  }));

  // ------------------------------------------------------------ overlays in the chart's coordinates

  const chart = chartRef.current;
  const main = mainRef.current?.series;
  const pane = chart?.paneSize(0) ?? { width: 0, height: 0 };
  const scaleWidth = chart ? chart.priceScale("right").width() : 0;
  const fmt = new Intl.NumberFormat("id-ID", decimalsRef.current ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 });
  const small = new Intl.NumberFormat("id-ID", { maximumSignificantDigits: 4 });
  const geo: Geometry = {
    x: xOf, y: yOf,
    bars: (a, b) => Math.round(logicalOf(b) - logicalOf(a)),
    price: (v) => { const p = v * k; return Math.abs(p) > 0 && Math.abs(p) < 1 ? small.format(p) : fmt.format(p); },
    width: pane.width, height: pane.height, bg: bgRef.current,
  };

  const interactive = (tool === "cross" && !locked) || tool === "eraser";
  let preview: Drawing | null = null;
  if (tool !== "cross" && tool !== "eraser" && tool !== "brush" && pending.length && cursor) {
    const points = [...pending, cursor];
    preview = makeDrawing(tool as DrawKind, points.slice(0, Math.max(1, TOOLS[tool].clicks)), color, "preview");
  }
  if (brushPoints && brushPoints.length > 1) preview = makeDrawing("brush", brushPoints, color, "preview");
  const selectedDrawing = drawings.find((d) => d.id === selected) ?? null;

  let layer: React.ReactNode = null;
  if (chart && main && pane.width > 0) {
    const items = (hidden ? [] : drawings).map((d) => ({ d, art: paint(d, geo) }));
    layer = (
      <svg className={interactive ? "absolute left-0 top-0 z-[1]" : "absolute left-0 top-0 z-[1] [&_*]:pointer-events-none!"} width={pane.width + scaleWidth} height={pane.height}
        style={{ pointerEvents: "none", overflow: "hidden" }} aria-hidden>
        <defs><clipPath id="wmt-pane"><rect x={0} y={0} width={pane.width} height={pane.height} /></clipPath></defs>
        <g clipPath="url(#wmt-pane)">
          {items.map(({ d, art }) => art && (
            <g key={d.id} className={tool === "eraser" ? "cursor-not-allowed" : "cursor-pointer"}
              onPointerDown={(e) => startDrag(e, d.id, null)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
              <g pointerEvents="none" opacity={selected && selected !== d.id ? 0.85 : 1}>{art.picture}</g>
              {art.hit}
            </g>
          ))}
          {preview && <g pointerEvents="none" opacity={0.85}>{paint(preview, geo)?.picture}</g>}
        </g>
        {items.map(({ d, art }) => art?.axis && <g key={`axis-${d.id}`} pointerEvents="none">{art.axis}</g>)}
        {/* Handles of the selected drawing, drawn last so they stay on top */}
        {selectedDrawing && !hidden && interactive && tool === "cross" && (paint(selectedDrawing, geo)?.handles ?? []).map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={5} fill={bgRef.current} stroke={TV.blue} strokeWidth={2} pointerEvents="all" className="cursor-move"
            onPointerDown={(e) => startDrag(e, selectedDrawing.id, i)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} />
        ))}
      </svg>
    );
  }

  let countdown: React.ReactNode = null;
  if (chart && main && countdownEnd != null && shown.length && now < countdownEnd) {
    const lastBar = shown[shown.length - 1];
    const y = main.priceToCoordinate(lastBar.close);
    if (y != null && y > 0 && y < pane.height - 24) {
      countdown = (
        <div className="pointer-events-none absolute right-0 px-1 text-center text-[11px] leading-[16px] text-white tabular-nums"
          style={{ top: y + 9, width: scaleWidth, background: lastBar.close >= lastBar.open ? TV.up : TV.down }}>
          {formatCountdown(countdownEnd - now)}
        </div>
      );
    }
  }

  const textAt = textEdit ? { x: xOf(textEdit.point.time), y: yOf(textEdit.point.price) } : null;

  return (
    <div className={tool === "cross" ? "relative h-full w-full" : "relative h-full w-full [&_canvas]:cursor-crosshair"}>
      {/* isolate: the chart's canvases have their own z-index; they stay under the drawings */}
      <div ref={box} className="isolate h-full w-full" />
      {layer}
      {countdown}
      {pending.length > 0 && TOOLS[tool].clicks > 1 && (
        <p className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-foreground/85 px-3 py-1 text-xs text-background">
          {TOOLS[tool].label}: titik {pending.length + 1} dari {TOOLS[tool].clicks}. Esc membatalkan.
        </p>
      )}
      {textEdit && textAt?.x != null && textAt.y != null && (
        <input autoFocus value={textEdit.value} placeholder="Ketik catatan" aria-label="Teks di chart" maxLength={120}
          onChange={(e) => setTextEdit({ ...textEdit, value: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") commitText(); if (e.key === "Escape") { e.stopPropagation(); setTextEdit(null); } }}
          onBlur={commitText}
          className="absolute z-20 w-48 rounded-md border border-[#007AFF] bg-card px-2 py-1 text-sm text-foreground shadow-lg outline-none"
          style={{ left: textAt.x, top: textAt.y - 22 }} />
      )}
      {/* The selected drawing's toolbar: color, text, delete */}
      {selectedDrawing && tool === "cross" && !locked && !hidden && (
        <div role="toolbar" aria-label={`Gambar terpilih: ${TOOLS[selectedDrawing.kind].label}`}
          className="absolute left-1/2 top-2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-black/[0.08] bg-popover/85 p-1 shadow-lg backdrop-blur-xl dark:border-white/10">
          <span className="px-2 text-xs font-medium text-muted-foreground max-sm:hidden">{TOOLS[selectedDrawing.kind].label}</span>
          {DRAW_COLORS.map((c) => (
            <button key={c} type="button" aria-label={`Warna ${c}`} aria-pressed={selectedDrawing.color === c}
              onClick={() => { update(selectedDrawing.id, { color: c }); setColor(c); }}
              className="flex size-7 items-center justify-center rounded-md hover:bg-muted">
              <span className="size-4 rounded-full ring-offset-2 ring-offset-card" style={{ background: c, boxShadow: selectedDrawing.color === c ? `0 0 0 2px var(--card), 0 0 0 3.5px ${c}` : undefined }} />
            </button>
          ))}
          {selectedDrawing.kind === "text" && (
            <button type="button" aria-label="Ubah teks" title="Ubah teks" onClick={() => setTextEdit({ id: selectedDrawing.id, point: selectedDrawing.points[0], value: selectedDrawing.text ?? "" })}
              className="flex size-7 items-center justify-center rounded-md text-foreground hover:bg-muted">
              <Pencil className="size-4" aria-hidden />
            </button>
          )}
          <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
          <button type="button" aria-label="Hapus gambar (Delete)" title="Hapus gambar (Delete)"
            onClick={() => { setDrawings((list) => list.filter((d) => d.id !== selectedDrawing.id)); setSelected(null); }}
            className="flex size-7 items-center justify-center rounded-md text-[#F23645] hover:bg-[#F23645]/10">
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
