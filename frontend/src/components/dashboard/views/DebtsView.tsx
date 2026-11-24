"use client";

import React, { useEffect, useState } from "react";
import { Check, CheckCheck, Handshake, Pencil, Plus, RotateCcw, Search, SearchX, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { categoryLabel, formatDayMonth, formatRupiah } from "@/lib/format";
import type { DebtParticipant, DebtRecord, DebtStatus, DebtSummary, DebtType } from "@/lib/api";
import { Button, Card, EmptyState, IconButton, SegmentedControl, Skeleton, focusRing, inputBase } from "../../common/ui";
import { usePrivacy } from "../shared/privacy";

import { tr } from "@/lib/i18n";
export interface DebtFilters {
  status: DebtStatus;
  type: "" | DebtType;
  q: string;
}
export const DEFAULT_DEBT_FILTERS: DebtFilters = { status: "OPEN", type: "", q: "" };

interface DebtsViewProps {
  /** null while loading */
  data: { records: DebtRecord[]; summary: DebtSummary } | null;
  filters: DebtFilters;
  onFiltersChange: (f: DebtFilters) => void;
  onAdd: () => void;
  onEdit: (r: DebtRecord) => void;
  onDelete: (r: DebtRecord) => void;
  /** Tick (or edit the payment of) a person */
  onPay: (r: DebtRecord, p: DebtParticipant) => void;
  onUnpay: (r: DebtRecord, p: DebtParticipant) => void;
  onSettle: (r: DebtRecord) => void;
  onReopen: (r: DebtRecord) => void;
}

/** Utang-piutang: talangan and debts. Balances move when money moves; reports only when settled. */
export default function DebtsView({ data, filters, onFiltersChange, onAdd, onEdit, onDelete, onPay, onUnpay, onSettle, onReopen }: DebtsViewProps) {
  const privacy = usePrivacy(["debtSummary", "debtList"] as const);
  const [query, setQuery] = useState(filters.q);
  // Search after a short pause, not on every key
  useEffect(() => {
    const t = setTimeout(() => query !== filters.q && onFiltersChange({ ...filters, q: query }), 350);
    return () => clearTimeout(t);
  }, [query, filters, onFiltersChange]);

  const money = (v: number) => privacy.show("debtList", formatRupiah(v));
  const summary = data?.summary;

  return (
    <div className="space-y-6">
      {privacy.unlockDialog}

      <Card>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">{tr("Belum selesai")}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{tr("Saldo rekening sudah ikut bergerak; pengeluaran dicatat saat selesai.")}</p>
          </div>
          {privacy.eye("debtSummary", "size-8")}
        </div>
        <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-3 min-[400px]:gap-3">
          {[
            [tr("Piutang aktif"), summary ? privacy.show("debtSummary", formatRupiah(summary.receivable)) : null, tr("Orang utang ke kamu")],
            [tr("Utang aktif"), summary ? privacy.show("debtSummary", formatRupiah(summary.payable)) : null, tr("Kamu utang")],
            [tr("Belum selesai"), summary ? tr("{openCount} catatan", { openCount: summary.openCount }) : null, tr("Status Open")],
          ].map(([label, value, sub]) => (
            // Smallest phones: one compact row each (label left, amount right) instead of three tall tiles
            <div key={label} className="@container flex min-w-0 items-baseline justify-between gap-3 rounded-xl border border-border/70 p-3 min-[400px]:block sm:p-4">
              <p className="text-xs text-muted-foreground sm:text-sm">{label}</p>
              {value == null ? <Skeleton className="h-6 w-24 rounded-md min-[400px]:mt-2" /> : (
                <p className="break-words text-base font-semibold leading-tight tracking-tight text-foreground tabular-nums min-[400px]:mt-2 min-[400px]:text-[clamp(0.95rem,10cqi,1.4rem)]">{value}</p>
              )}
              <p className="mt-1 hidden text-xs text-muted-foreground min-[400px]:block">{sub}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="space-y-3">
        {/* Filters */}
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl<DebtStatus> label={tr("Status")} value={filters.status} onChange={(status) => onFiltersChange({ ...filters, status })}
              options={[{ value: "OPEN", label: tr("Belum selesai") }, { value: "SETTLED", label: tr("Selesai") }]} />
            <SegmentedControl<"" | DebtType> label={tr("Tipe")} value={filters.type} onChange={(type) => onFiltersChange({ ...filters, type })}
              options={[{ value: "", label: tr("Semua") }, { value: "RECEIVABLE", label: tr("Piutang") }, { value: "PAYABLE", label: tr("Utang") }]} />
          </div>
          <div className="flex items-center gap-2 lg:ml-auto">
            <div className="relative min-w-0 flex-1 lg:w-56 lg:flex-none">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input type="search" aria-label={tr("Cari judul atau nama orang")} placeholder={tr("Cari judul atau nama")} value={query}
                onChange={(e) => setQuery(e.target.value)} className={cn(inputBase, "h-9 border-border pl-9")} />
            </div>
            {privacy.eye("debtList", "size-9 shrink-0")}
            <Button size="sm" onClick={onAdd} className="shrink-0"><Plus className="size-4" aria-hidden /> {tr("Catat")}</Button>
          </div>
        </div>

        {data == null ? (
          <div className="space-y-3" aria-busy="true">
            <span role="status" className="sr-only">{tr("Memuat utang-piutang")}</span>
            {[0, 1].map((i) => <Card key={i}><Skeleton className="h-4 w-40 rounded-md" /><Skeleton className="mt-4 h-2 rounded-full" /><Skeleton className="mt-4 h-16" /></Card>)}
          </div>
        ) : data.records.length === 0 ? (
          <Card>
            {filters.q || filters.type ? (
              <EmptyState icon={<SearchX className="size-5" />} title={tr("Tidak ada catatan yang cocok")}
                action={<Button variant="secondary" size="sm" onClick={() => { setQuery(""); onFiltersChange({ ...filters, q: "", type: "" }); }}>{tr("Hapus filter")}</Button>} />
            ) : filters.status === "SETTLED" ? (
              <EmptyState icon={<CheckCheck className="size-5" />} title={tr("Belum ada catatan yang selesai")} />
            ) : (
              <EmptyState icon={<Handshake className="size-5" />} title={tr("Tidak ada utang-piutang yang berjalan")}
                description={tr("Menalangi teman? Catat di sini: saldo langsung berkurang, dan hanya porsimu yang jadi pengeluaran saat selesai.")}
                action={<Button size="sm" onClick={onAdd}><Plus className="size-4" aria-hidden /> {tr("Catat utang-piutang")}</Button>} />
            )}
          </Card>
        ) : (
          data.records.map((r) => (
            <RecordCard key={r.id} record={r} money={money} onEdit={onEdit} onDelete={onDelete} onPay={onPay} onUnpay={onUnpay} onSettle={onSettle} onReopen={onReopen} />
          ))
        )}
      </div>
    </div>
  );
}

function RecordCard({ record: r, money, onEdit, onDelete, onPay, onUnpay, onSettle, onReopen }: {
  record: DebtRecord;
  money: (v: number) => string;
} & Pick<DebtsViewProps, "onEdit" | "onDelete" | "onPay" | "onUnpay" | "onSettle" | "onReopen">) {
  const open = r.status === "OPEN";
  const receivable = r.type === "RECEIVABLE";
  const { total, paid, difference } = r.progress;
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;

  return (
    <Card className="p-0">
      <div className="flex items-start gap-3 px-4 pt-4 sm:px-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 break-words text-sm font-semibold text-foreground">{r.title}</h3>
            <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-medium",
              receivable ? "bg-income/10 text-income" : "bg-muted text-muted-foreground")}>
              {receivable ? tr("Piutang") : tr("Utang")}
            </span>
            {!open && <span className="rounded-md bg-foreground px-1.5 py-0.5 text-[11px] font-medium text-background">{tr("Selesai")}</span>}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDayMonth(r.date)} {new Date(r.date).getFullYear()}, {categoryLabel(r.category)}
            {r.account && <>, {receivable ? tr("dari {account}", { account: r.account.name }) : tr("ke {account}", { account: r.account.name })}</>}
          </p>
          {r.notes && <p className="mt-1 break-words text-xs text-foreground/80">{r.notes}</p>}
        </div>
        <div className="flex shrink-0 items-start gap-0.5">
          {/* Phones: the total is in the progress line, so the title keeps its width */}
          <span className="hidden pt-1.5 pr-1 text-sm font-semibold tabular-nums text-foreground sm:inline">{money(total)}</span>
          {open && <IconButton label={tr("Ubah {title}", { title: r.title })} onClick={() => onEdit(r)} className="size-8"><Pencil className="size-4" /></IconButton>}
          <IconButton label={tr("Hapus {title}", { title: r.title })} onClick={() => onDelete(r)} className="size-8 hover:text-destructive"><Trash2 className="size-4" /></IconButton>
        </div>
      </div>

      {/* Progress: paid / total */}
      <div className="px-4 pt-3 sm:px-5">
        <div className="flex justify-between gap-3 text-xs text-muted-foreground">
          <span>{tr("Terbayar")} {money(paid)} <span className="sm:hidden">{tr("dari")} {money(total)}</span></span>
          <span className="tabular-nums">{pct}%</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
          aria-label={tr("Terbayar {pct}% dari total", { pct: pct })}>
          <div className="h-full rounded-full bg-foreground transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* People */}
      {r.participants.length > 0 && (
        <ul className="mt-3 divide-y divide-border/70 border-t border-border/70">
          {r.participants.map((p) => (
            <li key={p.id} className="flex items-start gap-3 px-4 py-2.5 sm:px-5">
              <button type="button" role="checkbox" aria-checked={p.isPaid} disabled={!open}
                aria-label={p.isPaid ? tr("{personName}: batalkan pembayaran", { personName: p.personName }) : tr("{personName}: tandai sudah bayar", { personName: p.personName })}
                onClick={() => (p.isPaid ? onUnpay(r, p) : onPay(r, p))}
                className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-60", focusRing,
                  p.isPaid ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/60")}>
                {p.isPaid && <Check className="size-4" aria-hidden />}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                  <p className="min-w-0 break-words text-sm text-foreground">{p.personName}</p>
                  {p.isPaid ? (
                    <button type="button" disabled={!open} onClick={() => onPay(r, p)}
                      className={cn("text-left text-sm font-medium tabular-nums text-foreground enabled:hover:underline sm:text-right", focusRing)}>
                      {money(p.paidAmount)}
                    </button>
                  ) : (
                    <span className="text-sm tabular-nums text-muted-foreground">{p.expectedAmount ? money(p.expectedAmount) : "–"}</span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {p.isPaid
                    ? <>{tr("Sudah bayar")}{p.paidAccount && <>, {receivable ? tr("ke {account}", { account: p.paidAccount.name }) : tr("dari {account}", { account: p.paidAccount.name })}</>}{p.paidAt && <>, {formatDayMonth(p.paidAt)}</>}</>
                    : <span className="text-warning">{tr("Belum bayar")}</span>}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Result and actions */}
      <div className="mt-3 flex flex-col gap-3 border-t border-border/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="text-xs text-muted-foreground">
          {open ? (
            receivable
              ? difference >= 0
                ? <>{tr("Estimasi selisih")} <b className="font-medium text-foreground">{money(difference)}</b> {tr("akan jadi pengeluaran")}</>
                : <>{tr("Kelebihan bayar")} <b className="font-medium text-foreground">{money(-difference)}</b></>
              : <>{tr("Sisa utang")} <b className="font-medium text-foreground">{money(r.progress.remaining)}</b>{r.recordExpense && <>{tr(", yang dibayar jadi pengeluaran")}</>}</>
          ) : (
            <>{tr("Selesai")} {r.settledAt ? formatDayMonth(r.settledAt) : ""}{r.linkedTransactionId ? tr(", dicatat ke laporan") : tr(", tidak ada yang dicatat")}</>
          )}
        </p>
        {open ? (
          <Button size="sm" variant={difference <= 0 || r.participants.every((p) => p.isPaid) ? "primary" : "secondary"} onClick={() => onSettle(r)}>
            <CheckCheck className="size-4" aria-hidden /> {tr("Selesaikan")}
          </Button>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => onReopen(r)}><RotateCcw className="size-4" aria-hidden /> {tr("Buka kembali")}</Button>
        )}
      </div>
    </Card>
  );
}
