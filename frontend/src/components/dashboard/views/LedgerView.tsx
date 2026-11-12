"use client";

import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, ReceiptText, Search, SearchX, SlidersHorizontal, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { categoryLabel, formatDayMonth, formatMonth, formatRupiah, formatTime, TX_TYPE_LABEL, type TxType } from "@/lib/format";
import { Button, Card, EmptyState, IconButton, focusRing, inputBase } from "../../common/ui";
import { activeFilterCount, matchesFilters, NO_FILTERS, type TxFilters } from "@/lib/txFilters";
import { LedgerRowsSkeleton } from "../skeletons";

export interface LedgerTx {
  id: string;
  type: TxType;
  amount: number;
  category: string;
  subcategory?: string | null;
  rawText?: string | null;
  fromAccountId?: string | null;
  toAccountId?: string | null;
  createdAt: string;
  fromAccount?: { name: string } | null;
  toAccount?: { name: string } | null;
}

interface LedgerViewProps {
  month: number;
  year: number;
  monthlyTxs: LedgerTx[];
  pageTxs: LedgerTx[];
  /** The list is being fetched for a new day, page or page size */
  listLoading?: boolean;
  selectedDay: number | null;
  onSelectDay: (day: number | null) => void;
  page: number;
  totalPages: number;
  limit: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  onAdd: () => void;
  onEdit: (tx: LedgerTx) => void;
  onDelete: (tx: LedgerTx) => void;
  filters: TxFilters;
  onFiltersChange: (filters: TxFilters) => void;
  /** Category codes for the filter (known ones plus the user's own) */
  categories: string[];
  accounts: { id: string; name: string }[];
}

/** Search box, type, category and account. The search is sent after a short pause in typing. */
function FilterBar({ filters, onChange, categories, accounts }: {
  filters: TxFilters;
  onChange: (filters: TxFilters) => void;
  categories: string[];
  accounts: { id: string; name: string }[];
}) {
  const [search, setSearch] = useState(filters.q);
  // Cleared from outside ("Hapus filter"): show the empty box
  // eslint-disable-next-line react-hooks/set-state-in-effect -- keep the box in sync with the applied filter
  useEffect(() => { if (filters.q === "") setSearch(""); }, [filters.q]);
  useEffect(() => {
    if (search === filters.q) return;
    const t = setTimeout(() => onChange({ ...filters, q: search }), 350);
    return () => clearTimeout(t);
  }, [search, filters, onChange]);

  // Phones: the three selects fold away behind a "Filter" button; from md they are always shown
  const [open, setOpen] = useState(false);
  const selectCount = [filters.type, filters.category, filters.accountId].filter(Boolean).length;
  const select = cn(inputBase, "h-10 border-border pr-8", focusRing);
  const set = (patch: Partial<TxFilters>) => onChange({ ...filters, ...patch });
  return (
    <div className="space-y-2 border-b border-border/70 px-5 py-3 md:grid md:grid-cols-4 md:gap-2 md:space-y-0">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari"
            aria-label="Cari transaksi" maxLength={100} className={cn(inputBase, "h-10 border-border pl-9")} />
        </div>
        <Button variant="secondary" className="h-10 shrink-0 md:hidden" aria-expanded={open} aria-controls="ledger-filters" onClick={() => setOpen((o) => !o)}>
          <SlidersHorizontal className="size-4" aria-hidden /> Filter{selectCount > 0 && ` (${selectCount})`}
        </Button>
      </div>
      <div id="ledger-filters" className={cn("grid-cols-1 gap-2 md:col-span-3 md:grid md:grid-cols-3", open ? "grid" : "hidden")}>
      <select aria-label="Jenis" value={filters.type} onChange={(e) => set({ type: e.target.value as TxFilters["type"] })} className={select}>
        <option value="">Semua jenis</option>
        {(["EXPENSE", "INCOME", "TRANSFER"] as TxType[]).map((t) => <option key={t} value={t}>{TX_TYPE_LABEL[t]}</option>)}
      </select>
      <select aria-label="Kategori" value={filters.category} onChange={(e) => set({ category: e.target.value })} className={select}>
        <option value="">Semua kategori</option>
        {categories.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
      </select>
      <select aria-label="Rekening" value={filters.accountId} onChange={(e) => set({ accountId: e.target.value })} className={select}>
        <option value="">Semua rekening</option>
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      </div>
    </div>
  );
}

const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

const accountLabel = (tx: LedgerTx) =>
  tx.type === "TRANSFER" ? `${tx.fromAccount?.name ?? "?"} → ${tx.toAccount?.name ?? "?"}` : tx.fromAccount?.name ?? tx.toAccount?.name ?? "-";

function Amount({ tx }: { tx: LedgerTx }) {
  const sign = tx.type === "INCOME" ? "+" : tx.type === "EXPENSE" ? "−" : "";
  return (
    <span className={cn("tabular-nums font-medium", tx.type === "INCOME" ? "text-income" : "text-foreground")}>
      {sign}{formatRupiah(tx.amount)}
    </span>
  );
}

function Title({ tx }: { tx: LedgerTx }) {
  return tx.type === "TRANSFER" ? "Transfer" : tx.subcategory || categoryLabel(tx.category);
}

function Meta({ tx }: { tx: LedgerTx }) {
  const parts = [tx.type === "TRANSFER" ? null : tx.subcategory ? categoryLabel(tx.category) : TX_TYPE_LABEL[tx.type], accountLabel(tx)];
  return <>{parts.filter(Boolean).join(" · ")}</>;
}

export default function LedgerView({
  month, year, monthlyTxs, pageTxs, listLoading = false, selectedDay, onSelectDay,
  page, totalPages, limit, onPageChange, onLimitChange, onAdd, onEdit, onDelete,
  filters, onFiltersChange, categories, accounts,
}: LedgerViewProps) {
  const filterCount = activeFilterCount(filters);
  // The month's transactions that match the filters: calendar dots and the totals of the selection
  const matching = monthlyTxs.filter((t) => matchesFilters(t, filters));
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7; // Monday = 0
  const today = new Date();

  const perDay = new Map<number, { income: number; expense: number; count: number }>();
  for (const t of matching) {
    const date = new Date(t.createdAt);
    if (date.getMonth() + 1 !== month || date.getFullYear() !== year) continue; // stale data from the previous month
    const d = date.getDate();
    const v = perDay.get(d) ?? { income: 0, expense: 0, count: 0 };
    // Dots mark money going out / coming in (lending and debt included, so a debt filter still shows them)
    if (t.type === "INCOME") v.income += t.amount;
    if (t.type === "EXPENSE") v.expense += t.amount;
    v.count++;
    perDay.set(d, v);
  }

  // Totals of what the list shows (selected day, if any), so e.g. "all food this month" is one glance
  const selection = matching.filter((t) => !selectedDay || new Date(t.createdAt).getDate() === selectedDay);
  const selOut = selection.filter((t) => t.type === "EXPENSE").reduce((s, t) => s + t.amount, 0);
  const selIn = selection.filter((t) => t.type === "INCOME").reduce((s, t) => s + t.amount, 0);

  const period = selectedDay
    ? new Date(year, month - 1, selectedDay).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
    : formatMonth(month, year);

  return (
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
      {/* Day filter */}
      <Card className="p-4 xl:sticky xl:top-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">Pilih tanggal</p>
          {selectedDay && (
            <Button variant="ghost" size="sm" onClick={() => onSelectDay(null)}>
              <X className="size-3.5" aria-hidden /> Semua tanggal
            </Button>
          )}
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((d) => (
            <div key={d} className="pb-1 text-xs text-muted-foreground" aria-hidden>{d}</div>
          ))}
          {Array.from({ length: firstWeekday }).map((_, i) => <div key={`b${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
            const info = perDay.get(day);
            const selected = selectedDay === day;
            const isToday = day === today.getDate() && month === today.getMonth() + 1 && year === today.getFullYear();
            return (
              <button
                key={day}
                type="button"
                onClick={() => onSelectDay(selected ? null : day)}
                aria-pressed={selected}
                aria-label={`${day} ${formatMonth(month, year)}${info ? `, ${info.count} transaksi` : ", tidak ada transaksi"}`}
                className={cn(
                  "flex h-11 flex-col items-center justify-center rounded-lg text-sm transition-colors",
                  focusRing,
                  selected ? "bg-foreground text-background" : info ? "text-foreground hover:bg-muted" : "text-muted-foreground/70 hover:bg-muted",
                  isToday && !selected && "ring-1 ring-border",
                )}
              >
                <span className="tabular-nums">{day}</span>
                <span className="mt-0.5 flex h-1.5 gap-0.5" aria-hidden>
                  {info && info.expense > 0 && <span className={cn("size-1.5 rounded-full", selected ? "bg-background" : "bg-foreground")} />}
                  {info && info.income > 0 && <span className={cn("size-1.5 rounded-full", selected ? "bg-background" : "bg-income")} />}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-foreground" /> Pengeluaran</span>
          <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-income" /> Pemasukan</span>
        </p>
      </Card>

      <Card className="p-0">
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Daftar transaksi</h2>
            <p className="mt-0.5 text-xs capitalize text-muted-foreground">{period}</p>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Per halaman
            <select
              value={limit}
              onChange={(e) => onLimitChange(Number(e.target.value))}
              className={cn("h-8 rounded-lg border border-border bg-card px-2 text-base text-foreground sm:text-sm", focusRing)}
            >
              {[10, 15, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>

        <FilterBar filters={filters} onChange={onFiltersChange} categories={categories} accounts={accounts} />
        {filterCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border/70 px-5 py-2.5 text-xs text-muted-foreground">
            <p className="tabular-nums">
              {selection.length} transaksi
              {selOut > 0 && <> · Keluar <span className="text-foreground">{formatRupiah(selOut)}</span></>}
              {selIn > 0 && <> · Masuk <span className="text-income">{formatRupiah(selIn)}</span></>}
            </p>
            <Button variant="ghost" size="sm" onClick={() => onFiltersChange(NO_FILTERS)}>
              <X className="size-3.5" aria-hidden /> Hapus filter
            </Button>
          </div>
        )}

        {listLoading ? (
          <LedgerRowsSkeleton rows={Math.min(limit, 8)} />
        ) : pageTxs.length === 0 && filterCount > 0 ? (
          <EmptyState
            className="py-12"
            icon={<SearchX className="size-5" />}
            title="Tidak ada transaksi yang cocok"
            description={`Coba ubah atau hapus filter untuk ${period}.`}
            action={<Button variant="secondary" size="sm" onClick={() => onFiltersChange(NO_FILTERS)}>Hapus filter</Button>}
          />
        ) : pageTxs.length === 0 ? (
          <EmptyState
            className="py-12"
            icon={<ReceiptText className="size-5" />}
            title={`Tidak ada transaksi pada ${period}`}
            description="Transaksi dari WhatsApp yang belum yakin dibaca ada di menu Perlu ditinjau."
            action={<Button variant="secondary" size="sm" onClick={onAdd}>Tambah transaksi</Button>}
          />
        ) : (
          <>
            {/* Wide screens: table (scrolls inside its card if it still does not fit) */}
            <div className="hidden overflow-x-auto lg:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-2.5 font-medium">Tanggal</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Keterangan</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Rekening</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Jumlah</th>
                  <th scope="col" className="w-24 px-4 py-2.5"><span className="sr-only">Aksi</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {pageTxs.map((tx) => (
                  <tr key={tx.id} className="hover:bg-muted/40">
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="text-foreground">{formatDayMonth(tx.createdAt)}</span>
                      <span className="ml-2 text-xs tabular-nums text-muted-foreground">{formatTime(tx.createdAt)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-foreground"><Title tx={tx} /></p>
                      <p className="text-xs text-muted-foreground">
                        {tx.type === "TRANSFER" ? "Transfer antar rekening" : tx.subcategory ? categoryLabel(tx.category) : TX_TYPE_LABEL[tx.type]}
                      </p>
                    </td>
                    <td className="max-w-40 break-words px-4 py-3 text-muted-foreground">{accountLabel(tx)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right"><Amount tx={tx} /></td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <IconButton label="Ubah transaksi" onClick={() => onEdit(tx)}><Pencil className="size-4" /></IconButton>
                        <IconButton label="Hapus transaksi" onClick={() => onDelete(tx)} className="hover:text-destructive"><Trash2 className="size-4" /></IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

            {/* Phone: stacked list */}
            <ul className="divide-y divide-border/70 lg:hidden">
              {pageTxs.map((tx) => (
                <li key={tx.id} className="flex items-center gap-2 py-3 pl-5 pr-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-sm text-foreground"><Title tx={tx} /></p>
                      <span className="shrink-0 text-sm"><Amount tx={tx} /></span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {formatDayMonth(tx.createdAt)}, {formatTime(tx.createdAt)} · <Meta tx={tx} />
                    </p>
                  </div>
                  <IconButton label="Ubah transaksi" onClick={() => onEdit(tx)}><Pencil className="size-4" /></IconButton>
                  <IconButton label="Hapus transaksi" onClick={() => onDelete(tx)}><Trash2 className="size-4" /></IconButton>
                </li>
              ))}
            </ul>

            {/* Small phones: icon-only buttons so the row fits 320px */}
            <div className="flex items-center justify-between gap-2 border-t border-border/70 px-3 py-3 sm:px-5">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Halaman sebelumnya">
                <ChevronLeft className="size-4" aria-hidden /> <span className="hidden sm:inline">Sebelumnya</span>
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">Halaman {page} dari {Math.max(1, totalPages)}</span>
              <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} aria-label="Halaman berikutnya">
                <span className="hidden sm:inline">Berikutnya</span> <ChevronRight className="size-4" aria-hidden />
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
