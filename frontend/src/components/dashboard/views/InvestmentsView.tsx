"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { CandlestickChart, CircleAlert, LineChart, Pencil, Plus, Search, SearchX } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRupiah, formatTime } from "@/lib/format";
import {
  ASSET_TYPE_BUTTON, ASSET_TYPE_LABEL, ASSET_TYPES, formatMoney, formatPercent, formatQuantity, formatSigned, quantityUnit, valuate,
  type AssetType, type Holding, type MarketPrices, type Valuation,
} from "@/lib/portfolio";
import { Button, Card, EmptyState, IconButton, SegmentedControl, Skeleton, focusRing, inputBase } from "../../common/ui";
import { MASK, MASK_PLAIN, usePrivacy } from "../shared/privacy";
import { LiveBadge } from "../liveBadge";

interface InvestmentsViewProps {
  /** null while loading */
  holdings: Holding[] | null;
  prices: MarketPrices | null;
  /** Opens the chart of a holding */
  onOpen: (h: Holding) => void;
  onAdd: () => void;
  onEdit: (h: Holding) => void;
}

type Row = { h: Holding; v: Valuation };
type TypeFilter = "ALL" | AssetType;

// Categorical slots (validated palette, see globals.css). Color follows the entity: an asset class
// or platform keeps its color whatever the filter or the size order.
const SERIES = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`);
const TYPE_COLOR: Record<AssetType, string> = { IDX_STOCK: SERIES[0], US_STOCK: SERIES[1], CRYPTO: SERIES[2] };
const OTHER_COLOR = "var(--muted-foreground)";

const pnlTone = (n: number | null | undefined) => (n == null || n === 0 ? "text-muted-foreground" : n > 0 ? "text-income" : "text-expense");

/** A live number that briefly lights up green or red when it moves, as on a trading screen */
function Flash({ value, children }: { value: number; children: React.ReactNode }) {
  const previous = useRef(value);
  const [dir, setDir] = useState<"up" | "down" | null>(null);
  useEffect(() => {
    if (value === previous.current) return;
    const next = value > previous.current ? "up" : "down";
    previous.current = value;
    setDir(next);
    const t = setTimeout(() => setDir(null), 1200);
    return () => clearTimeout(t);
  }, [value]);
  return (
    <span className={cn("rounded px-0.5 transition-colors duration-700", dir === "up" && "bg-income/15 text-income", dir === "down" && "bg-expense/15 text-expense")}>
      {children}
    </span>
  );
}

function Tile({ label, children, sub, className }: { label: string; children: React.ReactNode; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("@container min-w-0 rounded-xl border border-border/70 p-3 sm:p-4", className)}>
      <p className="text-xs text-muted-foreground sm:text-sm">{label}</p>
      <p className="mt-2 break-words text-[clamp(0.95rem,10cqi,1.5rem)] font-semibold leading-tight tracking-tight text-foreground tabular-nums">{children}</p>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function AllocationTooltip({ active, payload, hidden }: { active?: boolean; payload?: { payload: Slice }[]; hidden: boolean }) {
  const s = payload?.[0]?.payload;
  if (!active || !s) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="flex items-center gap-1.5 text-muted-foreground">
        <span className="size-2 rounded-full" style={{ background: s.color }} aria-hidden /> {s.label}
      </p>
      <p className="mt-0.5 font-medium text-foreground tabular-nums">{hidden ? MASK : formatRupiah(s.value)}, {formatPercent(s.pct).replace("+", "")}</p>
    </div>
  );
}

interface Slice { key: string; label: string; value: number; pct: number; color: string }

function Allocation({ rows, platforms, hidden, eye }: { rows: Row[]; platforms: string[]; hidden: boolean; eye: React.ReactNode }) {
  const [by, setBy] = useState<"type" | "platform">("type");

  const slices = useMemo<Slice[]>(() => {
    const sums = new Map<string, number>();
    for (const { h, v } of rows) {
      if (v.valueIdr == null || v.valueIdr <= 0) continue;
      const key = by === "type" ? h.assetType : h.platform;
      sums.set(key, (sums.get(key) ?? 0) + v.valueIdr);
    }
    const total = [...sums.values()].reduce((a, b) => a + b, 0);
    // Platforms get colors in alphabetical order of all the user's platforms; past seven they share "Lainnya"
    const colorOf = (key: string) => {
      if (by === "type") return TYPE_COLOR[key as AssetType];
      const i = platforms.indexOf(key);
      return i >= 0 && i < 7 ? SERIES[i] : OTHER_COLOR;
    };
    const list = [...sums.entries()].map(([key, value]) => ({
      key,
      label: by === "type" ? ASSET_TYPE_LABEL[key as AssetType] : key,
      value,
      pct: total ? (value / total) * 100 : 0,
      color: colorOf(key),
    }));
    if (by === "platform") {
      const other = list.filter((s) => s.color === OTHER_COLOR);
      if (other.length > 1) {
        const rest = list.filter((s) => s.color !== OTHER_COLOR);
        const value = other.reduce((a, s) => a + s.value, 0);
        return [...rest, { key: "__other", label: "Lainnya", value, pct: total ? (value / total) * 100 : 0, color: OTHER_COLOR }];
      }
    }
    // Fixed order for asset classes; platforms by size
    return by === "type" ? list.sort((a, b) => ASSET_TYPES.indexOf(a.key as AssetType) - ASSET_TYPES.indexOf(b.key as AssetType)) : list.sort((a, b) => b.value - a.value);
  }, [rows, by, platforms]);

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Alokasi</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Berdasarkan nilai pasar dalam rupiah</p>
        </div>
        <div className="flex items-center gap-1">
          <SegmentedControl label="Kelompokkan" value={by} onChange={setBy}
            options={[{ value: "type", label: "Jenis aset" }, { value: "platform", label: "Platform" }]} />
          {eye}
        </div>
      </div>
      {slices.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Belum ada nilai untuk ditampilkan.</p>
      ) : (
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
          <div className="h-48 w-48 shrink-0" role="img" aria-label={`Alokasi: ${slices.map((s) => `${s.label} ${Math.round(s.pct)}%`).join(", ")}`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                {/* 2px card-colored stroke = the gap between segments */}
                <Pie data={slices} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="100%" stroke="var(--card)" strokeWidth={2}
                  isAnimationActive={false} startAngle={90} endAngle={-270}>
                  {slices.map((s) => <Cell key={s.key} fill={s.color} />)}
                </Pie>
                <Tooltip content={<AllocationTooltip hidden={hidden} />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* The legend doubles as the table view: label, share, and amount for every slice */}
          <ul className="w-full min-w-0 flex-1 divide-y divide-border/70">
            {slices.map((s) => (
              <li key={s.key} className="flex items-center gap-3 py-2 text-sm">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-foreground">{s.label}</span>
                <span className="w-14 text-right tabular-nums text-muted-foreground">{formatPercent(s.pct).replace("+", "")}</span>
                <span className="w-32 text-right font-medium tabular-nums text-foreground sm:w-36">{hidden ? MASK : formatRupiah(s.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

export default function InvestmentsView({ holdings, prices, onOpen, onAdd, onEdit }: InvestmentsViewProps) {
  const privacy = usePrivacy(["portfolio", "allocation", "holdings"] as const);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [platformFilter, setPlatformFilter] = useState("");
  const [query, setQuery] = useState("");

  const rows = useMemo<Row[]>(() => (holdings ?? []).map((h) => ({ h, v: valuate(h, prices) })), [holdings, prices]);
  const open = rows.filter((r) => r.h.quantity > 0);
  const platforms = useMemo(() => [...new Set((holdings ?? []).map((h) => h.platform))].sort((a, b) => a.localeCompare(b, "id")), [holdings]);

  // Totals in rupiah. A USD holding with no exchange rate yet can't be added up; it is left out (and said so).
  const counted = open.filter((r) => r.v.valueIdr != null);
  const value = counted.reduce((s, r) => s + r.v.valueIdr!, 0);
  const cost = counted.reduce((s, r) => s + r.v.costIdr!, 0);
  const pnl = value - cost;
  const uncounted = open.length - counted.length;
  const missingPrices = open.filter((r) => !r.v.hasPrice).length;
  const stale = open.some((r) => r.v.stale) || !!prices?.fx?.stale;
  const fx = prices?.fx;
  const needsFx = open.some((r) => r.h.currency === "USD" || r.h.assetType === "US_STOCK");

  const shown = rows
    .filter((r) => typeFilter === "ALL" || r.h.assetType === typeFilter)
    .filter((r) => !platformFilter || r.h.platform === platformFilter)
    .filter((r) => {
      const q = query.trim().toLowerCase();
      return !q || r.h.symbol.toLowerCase().includes(q) || (r.h.name ?? "").toLowerCase().includes(q);
    })
    // Biggest first; sold-out holdings last
    .sort((a, b) => Number(b.h.quantity > 0) - Number(a.h.quantity > 0) || (b.v.valueIdr ?? 0) - (a.v.valueIdr ?? 0));
  const filtering = typeFilter !== "ALL" || !!platformFilter || !!query.trim();

  const ph = privacy.isHidden("portfolio");
  const hh = privacy.isHidden("holdings");
  const money = (n: number, currency: string) => (hh ? (currency === "IDR" ? MASK : MASK_PLAIN) : formatMoney(n, currency));
  const signed = (n: number, currency: string) => (hh ? (currency === "IDR" ? MASK : MASK_PLAIN) : formatSigned(n, currency));
  // No market price yet: the P&L would be a meaningless 0
  const pnlText = (r: Row) => (r.v.hasPrice ? signed(r.v.pnl, r.h.currency) : "Belum ada harga");
  const qty = (r: Row) => (hh ? MASK_PLAIN : `${formatQuantity(r.h.quantity)} ${quantityUnit(r.h.assetType)}`);

  if (holdings == null) {
    return (
      <div className="space-y-6" aria-busy="true">
        <span role="status" className="sr-only">Memuat investasi</span>
        <Card><Skeleton className="h-4 w-28 rounded-md" /><div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div></Card>
        <Card><Skeleton className="h-48" /></Card>
        <Card><Skeleton className="h-64" /></Card>
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <Card>
        <EmptyState
          className="py-14"
          icon={<LineChart className="size-5" />}
          title="Belum ada aset investasi"
          description="Catat saham Indonesia, saham US, atau crypto dari Stockbit, Pluang, dan lainnya. Harganya diperbarui otomatis."
          action={<Button size="sm" onClick={onAdd}><Plus className="size-4" aria-hidden /> Tambah aset</Button>}
        />
      </Card>
    );
  }

  const priceCell = (r: Row) => (
    <span className="inline-flex items-center gap-1">
      {r.v.hasPrice ? <Flash value={r.v.price}>{formatMoney(r.v.price, r.h.currency)}</Flash> : <span className="text-muted-foreground">Belum ada</span>}
      {r.v.stale && <CircleAlert className="size-3.5 text-warning" aria-label="Harga tersimpan, bukan live" />}
    </span>
  );
  const changeText = (r: Row) => {
    const c = prices?.prices[r.h.priceKey]?.changePct;
    if (c == null || !r.v.hasPrice) return null;
    return <span className={pnlTone(c)} title={r.h.assetType === "CRYPTO" ? "Perubahan 24 jam" : "Perubahan hari ini"}>{formatPercent(c)}</span>;
  };
  const unreachable = prices?.unreachable ?? [];

  return (
    <div className="space-y-6">
      {privacy.unlockDialog}

      {/* ---------- Summary ---------- */}
      <Card>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">Portofolio</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {prices ? <LiveBadge stale={stale} /> : "Mengambil harga terbaru…"}
            </p>
          </div>
          {privacy.eye("portfolio", "size-8")}
        </div>

        {/* One column on the smallest phones, so "Rp 143.041.654" is never split over two lines */}
        <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 lg:grid-cols-4">
          <Tile label="Nilai portofolio">{ph ? MASK : formatRupiah(value)}</Tile>
          <Tile label="Modal">{ph ? MASK : formatRupiah(cost)}</Tile>
          <Tile label="Untung/rugi" sub={<span className={pnlTone(pnl)}>{formatPercent(cost > 0 ? (pnl / cost) * 100 : null)}</span>}>
            <span className={ph ? undefined : pnlTone(pnl)}>{ph ? MASK : formatSigned(pnl, "IDR")}</span>
          </Tile>
          <Tile label="Kurs USD/IDR"
            sub={fx ? (fx.stale ? `Tersimpan ${formatTime(fx.updatedAt)}` : "Live dari Yahoo Finance") : needsFx ? "Belum tersedia" : "Yahoo Finance"}>
            {fx ? formatRupiah(fx.price) : "–"}
          </Tile>
        </div>

        {(stale || missingPrices > 0 || uncounted > 0 || unreachable.length > 0) && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
            <CircleAlert className="mt-px size-3.5 shrink-0 text-warning" aria-hidden />
            <span>
              {unreachable.length > 0
                ? `Server tidak bisa menghubungi ${unreachable.join(" dan ")}${stale ? ", sebagian harga memakai data terakhir yang tersimpan" : ""}. `
                : stale && "Sumber harga sedang tidak bisa dihubungi, sebagian harga memakai data terakhir yang tersimpan. "}
              {missingPrices > 0 && `${missingPrices} aset belum punya harga pasar, dihitung dengan harga beli. `}
              {uncounted > 0 && `${uncounted} aset USD belum masuk total karena kurs belum tersedia.`}
            </span>
          </p>
        )}
      </Card>

      {/* ---------- Allocation ---------- */}
      <Allocation rows={open} platforms={platforms} hidden={privacy.isHidden("allocation")} eye={privacy.eye("allocation", "size-8")} />

      {/* ---------- Holdings ---------- */}
      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <h2 className="text-sm font-semibold text-foreground">Aset <span className="font-normal text-muted-foreground">({open.length})</span></h2>
          <div className="flex items-center gap-1">
            {privacy.eye("holdings", "size-8")}
            <Button size="sm" onClick={onAdd}><Plus className="size-4" aria-hidden /> Tambah aset</Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 px-5 pt-4 pb-4 lg:flex-row lg:items-center">
          <SegmentedControl<TypeFilter> label="Jenis aset" value={typeFilter} onChange={setTypeFilter} className="flex w-full lg:inline-flex lg:w-auto"
            options={[{ value: "ALL", label: "Semua" }, ...ASSET_TYPES.map((t) => ({ value: t, label: ASSET_TYPE_BUTTON[t] }))]} />
          {/* Phones: search and platform stacked, each full width */}
          <div className="grid grid-cols-1 gap-2 sm:flex lg:ml-auto">
            <select aria-label="Platform" value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)}
              className={cn(inputBase, "h-9 border-border pr-8 sm:w-44 sm:shrink-0")}>
              <option value="">Semua platform</option>
              {platforms.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <div className="relative min-w-0 flex-1 lg:w-48 lg:flex-none">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input type="search" aria-label="Cari ticker" placeholder="Cari ticker" value={query} onChange={(e) => setQuery(e.target.value)}
                className={cn(inputBase, "h-9 border-border pl-9")} />
            </div>
          </div>
        </div>

        {shown.length === 0 ? (
          <EmptyState className="border-t border-border/70 pb-10" icon={<SearchX className="size-5" />} title="Tidak ada aset yang cocok"
            action={filtering ? <Button variant="secondary" size="sm" onClick={() => { setTypeFilter("ALL"); setPlatformFilter(""); setQuery(""); }}>Hapus filter</Button> : undefined} />
        ) : (
          <>
            {/* Wide screens: a table */}
            <div className="hidden overflow-x-auto border-t border-border/70 xl:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th scope="col" className="py-2.5 pl-5 pr-3 font-medium">Aset</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Platform</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">Jumlah</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">Harga sekarang<span className="block font-normal">rata-rata beli</span></th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">Nilai</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">Untung/rugi</th>
                    <th scope="col" className="py-2.5 pr-3 pl-1"><span className="sr-only">Aksi</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70 border-t border-border/70">
                  {shown.map((r) => {
                    const closed = r.h.quantity <= 0;
                    return (
                      <tr key={r.h.id} className={cn("align-top", closed && "text-muted-foreground")}>
                        <td className="py-3 pl-5 pr-3">
                          <button type="button" onClick={() => onOpen(r.h)} className={cn("rounded font-semibold text-foreground hover:underline", focusRing)}
                            aria-label={`${r.h.symbol}: buka chart`}>{r.h.symbol}</button>
                          <p className="max-w-36 truncate text-xs text-muted-foreground" title={r.h.name ?? undefined}>
                            {closed ? "Terjual habis" : r.h.name || ASSET_TYPE_LABEL[r.h.assetType]}
                          </p>
                        </td>
                        <td className="px-3 py-3"><PlatformBadge name={r.h.platform} /></td>
                        <td className="px-3 py-3 text-right tabular-nums">{qty(r)}</td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          <p className="flex items-center justify-end gap-2 text-foreground">{priceCell(r)}<span className="text-xs">{changeText(r)}</span></p>
                          <p className="text-xs text-muted-foreground">{formatMoney(r.h.avgPrice, r.h.currency)}</p>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          <p className="font-medium text-foreground">{money(r.v.value, r.h.currency)}</p>
                          {r.h.currency !== "IDR" && <p className="text-xs text-muted-foreground">{r.v.valueIdr == null ? "–" : money(r.v.valueIdr, "IDR")}</p>}
                        </td>
                        <td className={cn("px-3 py-3 text-right tabular-nums", !closed && pnlTone(r.v.pnl))}>
                          {closed || !r.v.hasPrice ? "–" : <><p className="font-medium">{pnlText(r)}</p><p className="text-xs">{formatPercent(r.v.pnlPct)}</p></>}
                        </td>
                        <td className="py-2 pr-3 pl-1">
                          <div className="flex justify-end">
                            <IconButton label={`Chart ${r.h.symbol}`} onClick={() => onOpen(r.h)}><CandlestickChart className="size-4" /></IconButton>
                            <IconButton label={`Ubah ${r.h.symbol}`} onClick={() => onEdit(r.h)}><Pencil className="size-4" /></IconButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Phones and tablets: a list */}
            <ul className="divide-y divide-border/70 border-t border-border/70 xl:hidden">
              {shown.map((r) => {
                const closed = r.h.quantity <= 0;
                return (
                  <li key={r.h.id} className="flex items-start gap-2 py-3 pr-2 pl-4 sm:pl-5">
                    <button type="button" onClick={() => onOpen(r.h)}
                      className={cn("min-w-0 flex-1 rounded-lg text-left", focusRing)} aria-label={`${r.h.symbol}: buka chart`}>
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className={cn("font-semibold", closed ? "text-muted-foreground" : "text-foreground")}>{r.h.symbol}</span>
                          <PlatformBadge name={r.h.platform} />
                        </span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                          {closed ? <span className="font-normal text-muted-foreground">Terjual habis</span> : r.v.valueIdr == null ? money(r.v.value, r.h.currency) : money(r.v.valueIdr, "IDR")}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-baseline justify-between gap-3 text-xs">
                        <span className="min-w-0 truncate text-muted-foreground">{r.h.name || ASSET_TYPE_LABEL[r.h.assetType]}</span>
                        {!closed && <span className={cn("shrink-0 tabular-nums", pnlTone(r.v.pnl))}>{pnlText(r)}</span>}
                      </span>
                      <span className="mt-0.5 flex items-baseline justify-between gap-3 text-xs tabular-nums">
                        <span className="min-w-0 text-muted-foreground">{qty(r)}</span>
                        {!closed && <span className={cn("shrink-0", pnlTone(r.v.pnl))}>{r.v.hasPrice ? formatPercent(r.v.pnlPct) : ""}</span>}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground tabular-nums">
                        rata-rata {formatMoney(r.h.avgPrice, r.h.currency)}, sekarang {priceCell(r)} {changeText(r)}
                      </span>
                    </button>
                    <IconButton label={`Ubah ${r.h.symbol}`} onClick={() => onEdit(r.h)} className="shrink-0"><Pencil className="size-4" /></IconButton>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}

function PlatformBadge({ name }: { name: string }) {
  return (
    <span className="inline-block max-w-28 truncate rounded-md border border-border/70 bg-muted px-1.5 py-0.5 align-middle text-[11px] font-medium text-muted-foreground" title={name}>
      {name}
    </span>
  );
}
