"use client";

import React from "react";
import { TV, alpha } from "./colors";

import { tr } from "@/lib/i18n";
/**
 * The drawing tools of the chart page, after TradingView's left toolbar: what each tool is, how many
 * clicks it takes, its icon, and how a drawing is painted (an SVG layer over the chart, in the
 * chart's coordinates, so it follows zooming and scrolling).
 */

export interface Point { time: number; price: number }

export type DrawKind =
  | "trend" | "arrow" | "ray" | "extended" | "hline" | "hray" | "vline" | "crossline"
  | "channel" | "fib" | "fibext"
  | "rect" | "ellipse" | "triangle" | "brush"
  | "text" | "arrowup" | "arrowdown"
  | "long" | "short" | "pricerange" | "daterange" | "measure";

export type Tool = "cross" | "eraser" | DrawKind;

export interface Drawing {
  id: string;
  kind: DrawKind;
  points: Point[];
  color: string;
  text?: string;
}

// ---------------------------------------------------------------- icons (18px, drawn like TradingView's)

const I = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);
const dot = (x: number, y: number) => <circle cx={x} cy={y} r="1.6" fill="currentColor" stroke="none" />;

export const TOOL_ICONS: Record<Tool, React.ReactNode> = {
  cross: <I><path d="M9 2v14M2 9h14" /></I>,
  eraser: <I><path d="M7.5 15.5h8M3.2 11.3l6.6-6.6a1.5 1.5 0 0 1 2.1 0l2.4 2.4a1.5 1.5 0 0 1 0 2.1l-5.8 5.8H6.3l-3.1-3.1a.4.4 0 0 1 0-.6zM6.5 8l4.5 4.5" /></I>,
  trend: <I><path d="M3.5 14.5l11-11" />{dot(3.5, 14.5)}{dot(14.5, 3.5)}</I>,
  arrow: <I><path d="M3.5 14.5l11-11M8.5 3.5h6v6" /></I>,
  ray: <I><path d="M4 14l12-12" />{dot(4, 14)}{dot(9, 9)}</I>,
  extended: <I><path d="M1.5 16.5l15-15" />{dot(6, 12)}{dot(12, 6)}</I>,
  hline: <I><path d="M1.5 9h15" />{dot(9, 9)}</I>,
  hray: <I><path d="M4 9h12.5" />{dot(4, 9)}</I>,
  vline: <I><path d="M9 1.5v15" />{dot(9, 9)}</I>,
  crossline: <I><path d="M9 1.5v15M1.5 9h15" />{dot(9, 9)}</I>,
  channel: <I><path d="M2 11l10-8M6 15l10-8" />{dot(2, 11)}{dot(12, 3)}{dot(16, 7)}</I>,
  fib: <I><path d="M2 3.5h14M2 7h14M2 10.5h14M2 14.5h14" strokeDasharray="0" />{dot(3, 14.5)}{dot(15, 3.5)}</I>,
  fibext: <I><path d="M2 15l4-8 3 4M9 3.5h7M9 7h7M9 11h7" /></I>,
  rect: <I><rect x="3" y="4.5" width="12" height="9" rx="0.5" />{dot(3, 13.5)}{dot(15, 4.5)}</I>,
  ellipse: <I><ellipse cx="9" cy="9" rx="7" ry="4.8" /></I>,
  triangle: <I><path d="M2.5 14.5L7 3.5l8.5 7.5z" /></I>,
  brush: <I><path d="M2.5 13.5c2-.5 2.5-3 4.5-3s1.5 3 4 3 3-6 4.5-8" /></I>,
  text: <I><path d="M4 4h10M9 4v11M6.5 15h5" /></I>,
  arrowup: <I><path d="M9 3l5 5.5h-3V15H7V8.5H4z" /></I>,
  arrowdown: <I><path d="M9 15l5-5.5h-3V3H7v6.5H4z" /></I>,
  long: <I><path d="M2.5 9h13" /><rect x="2.5" y="3" width="13" height="6" fill="currentColor" fillOpacity="0.18" /><rect x="2.5" y="9" width="13" height="5" /></I>,
  short: <I><path d="M2.5 9h13" /><rect x="2.5" y="4" width="13" height="5" /><rect x="2.5" y="9" width="13" height="6" fill="currentColor" fillOpacity="0.18" /></I>,
  pricerange: <I><path d="M3 3h12M3 15h12M9 4v10M7 6l2-2 2 2M7 12l2 2 2-2" /></I>,
  daterange: <I><path d="M3 3v12M15 3v12M4 9h10M6 7l-2 2 2 2M12 7l2 2-2 2" /></I>,
  measure: <I><path d="M3.5 14.5l11-11M2 6.5L6.5 2M11.5 16l4.5-4.5M5.5 9.5l1.5 1.5M8.5 6.5l1.5 1.5" /></I>,
};

// ---------------------------------------------------------------- the tools

/** How many clicks a drawing takes; 0 = not a drawing (cursor, eraser), -1 = drag (brush) */
export const TOOLS: Record<Tool, { label: string; hint: string; clicks: number }> = {
  cross: { get label() { return tr("Kursor silang"); }, get hint() { return tr("Geser, zoom, dan pilih gambar (Esc)"); }, clicks: 0 },
  eraser: { get label() { return tr("Penghapus"); }, get hint() { return tr("Klik gambar untuk menghapusnya"); }, clicks: 0 },
  trend: { get label() { return tr("Garis tren"); }, get hint() { return tr("Klik dua titik"); }, clicks: 2 },
  arrow: { get label() { return tr("Panah"); }, get hint() { return tr("Klik awal dan ujung panah"); }, clicks: 2 },
  ray: { get label() { return tr("Sinar"); }, get hint() { return tr("Klik dua titik; garis berlanjut ke kanan"); }, clicks: 2 },
  extended: { get label() { return tr("Garis diperpanjang"); }, get hint() { return tr("Klik dua titik; garis berlanjut ke dua arah"); }, clicks: 2 },
  hline: { get label() { return tr("Garis horizontal"); }, get hint() { return tr("Klik satu harga"); }, clicks: 1 },
  hray: { get label() { return tr("Sinar horizontal"); }, get hint() { return tr("Klik satu titik; garis berlanjut ke kanan"); }, clicks: 1 },
  vline: { get label() { return tr("Garis vertikal"); }, get hint() { return tr("Klik satu waktu"); }, clicks: 1 },
  crossline: { get label() { return tr("Garis silang"); }, get hint() { return tr("Klik satu titik"); }, clicks: 1 },
  channel: { get label() { return tr("Kanal paralel"); }, get hint() { return tr("Klik dua titik garis, lalu satu titik untuk lebarnya"); }, clicks: 3 },
  fib: { get label() { return tr("Fib retracement"); }, get hint() { return tr("Klik titik awal dan akhir gerakan harga"); }, clicks: 2 },
  fibext: { get label() { return tr("Ekstensi Fib berbasis tren"); }, get hint() { return tr("Klik awal tren, akhir tren, lalu titik koreksi"); }, clicks: 3 },
  rect: { get label() { return tr("Persegi panjang"); }, get hint() { return tr("Klik dua sudut"); }, clicks: 2 },
  ellipse: { get label() { return tr("Elips"); }, get hint() { return tr("Klik dua sudut"); }, clicks: 2 },
  triangle: { get label() { return tr("Segitiga"); }, get hint() { return tr("Klik tiga titik"); }, clicks: 3 },
  brush: { get label() { return tr("Kuas"); }, get hint() { return tr("Tekan dan geser untuk menggambar bebas"); }, clicks: -1 },
  text: { get label() { return tr("Teks"); }, get hint() { return tr("Klik tempatnya, lalu ketik"); }, clicks: 1 },
  arrowup: { get label() { return tr("Tanda panah naik"); }, get hint() { return tr("Klik satu titik"); }, clicks: 1 },
  arrowdown: { get label() { return tr("Tanda panah turun"); }, get hint() { return tr("Klik satu titik"); }, clicks: 1 },
  long: { get label() { return tr("Posisi beli"); }, get hint() { return tr("Klik harga masuk, lalu target; batas rugi bisa digeser"); }, clicks: 2 },
  short: { get label() { return tr("Posisi jual"); }, get hint() { return tr("Klik harga masuk, lalu target; batas rugi bisa digeser"); }, clicks: 2 },
  pricerange: { get label() { return tr("Rentang harga"); }, get hint() { return tr("Klik dua harga"); }, clicks: 2 },
  daterange: { get label() { return tr("Rentang tanggal"); }, get hint() { return tr("Klik dua waktu"); }, clicks: 2 },
  measure: { get label() { return tr("Rentang tanggal dan harga"); }, get hint() { return tr("Klik awal dan akhir"); }, clicks: 2 },
};

/** The groups of the left toolbar; each button shows the group's last-used tool, the arrow opens the rest */
export const TOOL_GROUPS: { id: string; label: string; tools: Tool[] }[] = [
  { id: "cursor", get label() { return tr("Kursor"); }, tools: ["cross", "eraser"] },
  { id: "lines", get label() { return tr("Garis"); }, tools: ["trend", "arrow", "ray", "extended", "hline", "hray", "vline", "crossline"] },
  { id: "fib", get label() { return tr("Kanal dan Fibonacci"); }, tools: ["channel", "fib", "fibext"] },
  { id: "shapes", get label() { return tr("Bentuk"); }, tools: ["rect", "ellipse", "triangle", "brush"] },
  { id: "notes", get label() { return tr("Anotasi"); }, tools: ["text", "arrowup", "arrowdown"] },
  { id: "measure", get label() { return tr("Prediksi dan ukur"); }, tools: ["long", "short", "pricerange", "daterange", "measure"] },
];

export const DRAW_COLORS = ["#2962FF", "#F23645", "#089981", "#FF9800", "#9C27B0", "#787B86"];

const FIB_LEVELS: [number, string][] = [
  [0, "#787B86"], [0.236, "#F23645"], [0.382, "#FF9800"], [0.5, "#4CAF50"], [0.618, "#089981"], [0.786, "#00BCD4"], [1, "#787B86"],
];
const FIB_EXT_LEVELS: [number, string][] = [
  [0, "#787B86"], [0.382, "#F23645"], [0.618, "#FF9800"], [1, "#4CAF50"], [1.618, "#2962FF"], [2.618, "#9C27B0"],
];

/** The drawing made from the clicked points (a position gets its stop mirrored from the target) */
export function makeDrawing(kind: DrawKind, points: Point[], color: string, id = newId()): Drawing {
  if (kind === "long" || kind === "short") {
    const [entry, second] = points;
    const end = second ?? entry;
    const d = Math.abs(end.price - entry.price) || entry.price * 0.02;
    const up = kind === "long" ? 1 : -1;
    return {
      id, kind, color,
      points: [entry, { time: end.time, price: entry.price + up * d }, { time: end.time, price: entry.price - up * d }],
    };
  }
  return { id, kind, color, points };
}

export const newId = () => Math.random().toString(36).slice(2, 10);

// ---------------------------------------------------------------- painting

export interface Geometry {
  /** Screen x of a time (also beyond the last bar), y of a price; null when off the scale */
  x: (time: number) => number | null;
  y: (price: number) => number | null;
  /** Bars between two times (negative when backwards) */
  bars: (from: number, to: number) => number;
  price: (v: number) => string;
  width: number;
  height: number;
  /** The background, for the outline around labels */
  bg: string;
}

type XY = [number, number];
const FAR = 20_000;
const line = (a: XY, b: XY) => `M${a[0]},${a[1]}L${b[0]},${b[1]}`;
function extend(a: XY, b: XY, both: boolean): [XY, XY] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return [a, b];
  const k = FAR / len;
  return [both ? [a[0] - dx * k, a[1] - dy * k] : a, [b[0] + dx * k, b[1] + dy * k]];
}
const pctText = (from: number, to: number) => {
  if (!from) return "";
  const p = ((to - from) / from) * 100;
  return `${p > 0 ? "+" : p < 0 ? "−" : ""}${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(Math.abs(p))}%`;
};
const signed = (v: number, fmt: (v: number) => string) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmt(Math.abs(v))}`;

export function duration(seconds: number) {
  const s = Math.abs(seconds);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d >= 60) return tr("{d} hari", { d: d });
  if (d > 0) return h ? tr("{d} hari {h} jam", { d: d, h: h }) : tr("{d} hari", { d: d });
  if (h > 0) return m ? tr("{h} jam {m} menit", { h: h, m: m }) : tr("{h} jam", { h: h });
  return tr("{m} menit", { m: m });
}

/** A filled label with text; width estimated from the characters (11px font) */
function Label({ x, y, text, bg, fg = "#fff", anchor = "middle" }: { x: number; y: number; text: string[]; bg: string; fg?: string; anchor?: "start" | "middle" | "end" }) {
  const w = Math.max(...text.map((t) => t.length)) * 6.3 + 14;
  const h = text.length * 15 + 6;
  const left = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
  return (
    <g pointerEvents="none">
      <rect x={left} y={y} width={w} height={h} rx={3} fill={bg} />
      {text.map((t, i) => (
        <text key={i} x={left + w / 2} y={y + 15 + i * 15} textAnchor="middle" fontSize={11} fontWeight={500} fill={fg} style={{ fontVariantNumeric: "tabular-nums" }}>{t}</text>
      ))}
    </g>
  );
}

/** Text on the chart with an outline in the background color, readable over candles */
function Note({ x, y, text, color, bg, anchor = "start", size = 11 }: { x: number; y: number; text: string; color: string; bg: string; anchor?: "start" | "middle" | "end"; size?: number }) {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={size} fill={color} stroke={bg} strokeWidth={3} paintOrder="stroke" pointerEvents="none" style={{ fontVariantNumeric: "tabular-nums" }}>
      {text}
    </text>
  );
}

/**
 * The picture of one drawing. `hit` is the invisible, wider outline that takes the clicks; the
 * handles (the points that can be dragged) are returned as screen positions.
 */
/** `axis`: drawn over the price axis, outside the chart area (the price label of a horizontal line) */
export function paint(d: Drawing, g: Geometry): { picture: React.ReactNode; hit: React.ReactNode; handles: XY[]; axis?: React.ReactNode } | null {
  const pts: XY[] = [];
  for (const p of d.points) {
    const x = g.x(p.time);
    const y = g.y(p.price);
    if (x == null || y == null) return null;
    pts.push([x, y]);
  }
  const c = d.color;
  const [a, b, c3] = pts;
  const stroke = { stroke: c, strokeWidth: 1.5, fill: "none" };
  const hitStroke = (path: string) => <path d={path} stroke="transparent" strokeWidth={12} fill="none" pointerEvents="stroke" />;
  const hitFill = (el: React.ReactElement<{ pointerEvents?: string }>) => React.cloneElement(el, { pointerEvents: "visiblePainted" });

  switch (d.kind) {
    case "trend":
    case "arrow":
    case "ray":
    case "extended": {
      if (!b) return { picture: null, hit: null, handles: [a] };
      const [s, e] = d.kind === "ray" ? extend(a, b, false) : d.kind === "extended" ? extend(a, b, true) : [a, b];
      const path = line(s, e);
      let head: React.ReactNode = null;
      if (d.kind === "arrow") {
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const wing = (t: number): XY => [b[0] - 11 * Math.cos(ang + t), b[1] - 11 * Math.sin(ang + t)];
        head = <path d={`M${wing(0.45).join(",")}L${b.join(",")}L${wing(-0.45).join(",")}`} {...stroke} strokeWidth={2} />;
      }
      return { picture: <><path d={path} {...stroke} strokeWidth={2} />{head}</>, hit: hitStroke(path), handles: [a, b] };
    }
    case "hline":
    case "hray":
    case "vline":
    case "crossline": {
      const parts: string[] = [];
      if (d.kind === "hline" || d.kind === "crossline") parts.push(line([-FAR, a[1]], [FAR, a[1]]));
      if (d.kind === "hray") parts.push(line(a, [FAR, a[1]]));
      if (d.kind === "vline" || d.kind === "crossline") parts.push(line([a[0], -FAR], [a[0], FAR]));
      const path = parts.join("");
      const axis = d.kind !== "vline" ? <Label x={g.width + 1} y={a[1] - 10} text={[g.price(d.points[0].price)]} bg={c} anchor="start" /> : null;
      return { picture: <path d={path} {...stroke} />, hit: hitStroke(path), handles: [a], axis };
    }
    case "channel": {
      if (!b) return { picture: null, hit: null, handles: [a] };
      if (!c3) return { picture: <path d={line(a, b)} {...stroke} />, hit: null, handles: [a, b] };
      // The parallel line goes through the third point
      const slope = b[0] === a[0] ? 0 : (b[1] - a[1]) / (b[0] - a[0]);
      const dy = c3[1] - (a[1] + slope * (c3[0] - a[0]));
      const a2: XY = [a[0], a[1] + dy];
      const b2: XY = [b[0], b[1] + dy];
      const mid = line([a[0], a[1] + dy / 2], [b[0], b[1] + dy / 2]);
      const path = line(a, b) + line(a2, b2);
      return {
        picture: <>
          {hitFill(<path d={`M${a.join(",")}L${b.join(",")}L${b2.join(",")}L${a2.join(",")}Z`} fill={alpha(c, 0.12)} stroke="none" />)}
          <path d={path} {...stroke} />
          <path d={mid} stroke={c} strokeWidth={1} strokeDasharray="4 4" fill="none" />
        </>,
        hit: hitStroke(path), handles: [a, b, [b[0], b[1] + dy]],
      };
    }
    case "fib": {
      if (!b) return { picture: null, hit: null, handles: [a] };
      const left = Math.min(a[0], b[0]);
      const right = Math.max(a[0], b[0]);
      const [p1, p2] = [d.points[0].price, d.points[1].price];
      const levels = FIB_LEVELS.map(([l, col]) => ({ l, col, price: p2 + (p1 - p2) * l })).map((v) => ({ ...v, y: g.y(v.price) }));
      if (levels.some((v) => v.y == null)) return null;
      const fills = levels.slice(1).map((v, i) => (
        <rect key={`f${i}`} x={left} y={Math.min(levels[i].y!, v.y!)} width={right - left} height={Math.abs(v.y! - levels[i].y!)} fill={alpha(v.col, 0.1)} pointerEvents="visiblePainted" />
      ));
      const rows = levels.map((v) => (
        <g key={v.l}>
          <path d={line([left, v.y!], [right, v.y!])} stroke={v.col} strokeWidth={1} />
          <Note x={left - 6} y={v.y! + 4} anchor="end" text={`${v.l} (${g.price(v.price)})`} color={v.col} bg={g.bg} />
        </g>
      ));
      return {
        picture: <>{fills}{rows}<path d={line(a, b)} stroke={alpha(c, 0.6)} strokeWidth={1} strokeDasharray="4 4" /></>,
        hit: hitStroke(levels.map((v) => line([left, v.y!], [right, v.y!])).join("")), handles: [a, b],
      };
    }
    case "fibext": {
      if (!b) return { picture: null, hit: null, handles: [a] };
      if (!c3) return { picture: <path d={line(a, b)} stroke={c} strokeWidth={1} strokeDasharray="4 4" />, hit: null, handles: [a, b] };
      const move = d.points[1].price - d.points[0].price;
      const left = c3[0];
      const right = c3[0] + Math.max(40, Math.abs(b[0] - a[0]));
      const levels = FIB_EXT_LEVELS.map(([l, col]) => ({ l, col, price: d.points[2].price + move * l })).map((v) => ({ ...v, y: g.y(v.price) }));
      if (levels.some((v) => v.y == null)) return null;
      return {
        picture: <>
          <path d={`M${a.join(",")}L${b.join(",")}L${c3.join(",")}`} stroke={alpha(c, 0.6)} strokeWidth={1} strokeDasharray="4 4" fill="none" />
          {levels.map((v) => (
            <g key={v.l}>
              <path d={line([left, v.y!], [right, v.y!])} stroke={v.col} strokeWidth={1} />
              <Note x={right + 6} y={v.y! + 4} text={`${v.l} (${g.price(v.price)})`} color={v.col} bg={g.bg} />
            </g>
          ))}
        </>,
        hit: hitStroke(levels.map((v) => line([left, v.y!], [right, v.y!])).join("") + line(a, b) + line(b, c3)), handles: [a, b, c3],
      };
    }
    case "rect": {
      if (!b) return { picture: null, hit: null, handles: [a] };
      const r = { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), width: Math.abs(b[0] - a[0]), height: Math.abs(b[1] - a[1]) };
      return { picture: hitFill(<rect {...r} fill={alpha(c, 0.15)} stroke={c} strokeWidth={1.5} />), hit: null, handles: [a, b] };
    }
    case "ellipse": {
      if (!b) return { picture: null, hit: null, handles: [a] };
      return {
        picture: hitFill(<ellipse cx={(a[0] + b[0]) / 2} cy={(a[1] + b[1]) / 2} rx={Math.abs(b[0] - a[0]) / 2} ry={Math.abs(b[1] - a[1]) / 2} fill={alpha(c, 0.15)} stroke={c} strokeWidth={1.5} />),
        hit: null, handles: [a, b],
      };
    }
    case "triangle": {
      if (!b) return { picture: null, hit: null, handles: [a] };
      if (!c3) return { picture: <path d={line(a, b)} {...stroke} />, hit: null, handles: [a, b] };
      return { picture: hitFill(<path d={`M${a.join(",")}L${b.join(",")}L${c3.join(",")}Z`} fill={alpha(c, 0.15)} stroke={c} strokeWidth={1.5} />), hit: null, handles: [a, b, c3] };
    }
    case "brush": {
      const path = pts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join("");
      return { picture: <path d={path} stroke={c} strokeWidth={2} fill="none" />, hit: hitStroke(path), handles: [] };
    }
    case "text": {
      const text = d.text ?? "";
      const w = Math.max(20, text.length * 7.5);
      return {
        picture: <Note x={a[0]} y={a[1]} text={text} color={c} bg={g.bg} size={13} />,
        hit: <rect x={a[0] - 4} y={a[1] - 16} width={w + 8} height={22} fill="transparent" pointerEvents="all" />,
        handles: [],
      };
    }
    case "arrowup":
    case "arrowdown": {
      const up = d.kind === "arrowup";
      const s = up ? 1 : -1;
      // The tip touches the clicked price, the arrow sits under it (up) or above it (down)
      const [x, y] = a;
      const path = `M${x},${y}L${x + 8},${y + 9 * s}L${x + 3},${y + 9 * s}L${x + 3},${y + 20 * s}L${x - 3},${y + 20 * s}L${x - 3},${y + 9 * s}L${x - 8},${y + 9 * s}Z`;
      return { picture: hitFill(<path d={path} fill={c} stroke="none" />), hit: null, handles: [] };
    }
    case "long":
    case "short": {
      if (!b || !c3) return { picture: null, hit: null, handles: [a] };
      const [entry, target, stop] = d.points;
      const left = Math.min(a[0], b[0]);
      const right = Math.max(a[0], b[0], left + 30);
      const width = right - left;
      const profitTop = Math.min(a[1], b[1]);
      const lossTop = Math.min(a[1], c3[1]);
      const reward = Math.abs(target.price - entry.price);
      const risk = Math.abs(entry.price - stop.price);
      const rr = risk ? new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(reward / risk) : "–";
      const targetAbove = b[1] < a[1];
      return {
        picture: <>
          {hitFill(<rect x={left} y={profitTop} width={width} height={Math.abs(b[1] - a[1])} fill={alpha(TV.up, 0.2)} />)}
          {hitFill(<rect x={left} y={lossTop} width={width} height={Math.abs(c3[1] - a[1])} fill={alpha(TV.down, 0.2)} />)}
          <path d={line([left, a[1]], [right, a[1]])} stroke="#787B86" strokeWidth={1.5} />
          <Label x={(left + right) / 2} y={targetAbove ? b[1] - 26 : b[1] + 6} bg={TV.up}
            text={[tr("Target: {g} ({price})", { g: g.price(target.price), price: pctText(entry.price, target.price) })]} />
          <Label x={(left + right) / 2} y={targetAbove ? c3[1] + 6 : c3[1] - 26} bg={TV.down}
            text={[tr("Batas rugi: {g} ({price})", { g: g.price(stop.price), price: pctText(entry.price, stop.price) })]} />
          <Label x={(left + right) / 2} y={a[1] + (targetAbove ? 4 : -24)} bg="#787B86" text={[tr("Rasio imbalan/risiko {rr}", { rr: rr })]} />
        </>,
        hit: null, handles: [a, [right, b[1]], [right, c3[1]]],
      };
    }
    case "pricerange":
    case "daterange":
    case "measure": {
      if (!b) return { picture: null, hit: null, handles: [a] };
      const [p1, p2] = d.points;
      const diff = p2.price - p1.price;
      const up = diff >= 0;
      const col = d.kind === "measure" ? (up ? TV.blue : TV.down) : c;
      const r = { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), width: Math.max(1, Math.abs(b[0] - a[0])), height: Math.max(1, Math.abs(b[1] - a[1])) };
      const midX = (a[0] + b[0]) / 2;
      const midY = (a[1] + b[1]) / 2;
      const bars = g.bars(p1.time, p2.time);
      const priceText = `${signed(diff, g.price)} (${pctText(p1.price, p2.price)})`;
      const timeText = tr("{bars} bar, {duration}", { bars: bars, duration: duration(p2.time - p1.time) });
      const text = d.kind === "pricerange" ? [priceText] : d.kind === "daterange" ? [timeText] : [priceText, timeText];
      const vArrow = d.kind !== "daterange"
        ? <path d={`${line([midX, a[1]], [midX, b[1]])}M${midX - 5},${b[1] + (up ? 6 : -6)}L${midX},${b[1]}L${midX + 5},${b[1] + (up ? 6 : -6)}`} stroke={col} strokeWidth={1.5} fill="none" />
        : null;
      const right = b[0] >= a[0];
      const hArrow = d.kind !== "pricerange"
        ? <path d={`${line([a[0], midY], [b[0], midY])}M${b[0] + (right ? -6 : 6)},${midY - 5}L${b[0]},${midY}L${b[0] + (right ? -6 : 6)},${midY + 5}`} stroke={col} strokeWidth={1.5} fill="none" />
        : null;
      const labelBelow = d.kind === "daterange" ? true : !up;
      return {
        picture: <>
          {hitFill(<rect {...r} fill={alpha(col, 0.16)} />)}
          {d.kind === "pricerange" && <path d={line([r.x, a[1]], [r.x + r.width, a[1]]) + line([r.x, b[1]], [r.x + r.width, b[1]])} stroke={col} strokeWidth={1} />}
          {d.kind === "daterange" && <path d={line([a[0], r.y], [a[0], r.y + r.height]) + line([b[0], r.y], [b[0], r.y + r.height])} stroke={col} strokeWidth={1} />}
          {vArrow}{hArrow}
          <Label x={midX} y={labelBelow ? r.y + r.height + 6 : r.y - 6 - text.length * 15 - 6} bg={col} text={text} />
        </>,
        hit: null, handles: [a, b],
      };
    }
  }
}
