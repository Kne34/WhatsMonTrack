"use client";

import React, { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Check, Handshake, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDayMonth, formatRupiah } from "@/lib/format";
import type { DebtNote } from "@/lib/api";
import { Button, Card, EmptyState, IconButton, SegmentedControl, focusRing } from "../../common/ui";
import { usePrivacy } from "../shared/privacy";

interface DebtsViewProps {
  /** null while loading */
  notes: DebtNote[] | null;
  onAdd: () => void;
  onEdit: (note: DebtNote) => void;
  /** The checkbox: lunas / belum lunas */
  onToggle: (note: DebtNote) => void;
  onDelete: (note: DebtNote) => void;
}

type Scope = "open" | "settled" | "all";

const isSettled = (n: DebtNote) => n.paid >= n.amount;

/** To-do style list of who owes whom. Notes only: balances never change here. */
export default function DebtsView({ notes, onAdd, onEdit, onToggle, onDelete }: DebtsViewProps) {
  const privacy = usePrivacy(["debtSummary", "debtList"] as const);
  const [scope, setScope] = useState<Scope>("open");

  const all = notes ?? [];
  const open = all.filter((n) => !isSettled(n));
  const shown = scope === "open" ? open : scope === "settled" ? all.filter(isSettled) : all;
  const left = (n: DebtNote) => n.amount - n.paid;
  const owedToYou = open.filter((n) => n.direction === "THEY_OWE").reduce((s, n) => s + left(n), 0);
  const youOwe = open.filter((n) => n.direction === "I_OWE").reduce((s, n) => s + left(n), 0);
  const money = (v: number) => privacy.show("debtList", formatRupiah(v));

  return (
    <div className="space-y-6">
      {privacy.unlockDialog}

      <Card>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">Belum lunas</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Catatan saja, saldo rekening tidak berubah.</p>
          </div>
          {privacy.eye("debtSummary", "size-8")}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="@container rounded-xl border border-border/70 p-3 sm:p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground sm:text-sm">
              <ArrowDownLeft className="size-4 shrink-0" aria-hidden /> Orang utang ke kamu
            </p>
            <p className="mt-2 break-words text-[clamp(0.95rem,10cqi,1.5rem)] font-semibold leading-tight tracking-tight text-foreground">
              {privacy.show("debtSummary", formatRupiah(owedToYou))}
            </p>
          </div>
          <div className="@container rounded-xl border border-border/70 p-3 sm:p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground sm:text-sm">
              <ArrowUpRight className="size-4 shrink-0" aria-hidden /> Kamu utang
            </p>
            <p className="mt-2 break-words text-[clamp(0.95rem,10cqi,1.5rem)] font-semibold leading-tight tracking-tight text-foreground">
              {privacy.show("debtSummary", formatRupiah(youOwe))}
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-4">
          <SegmentedControl<Scope> label="Tampilkan" value={scope} onChange={setScope}
            options={[{ value: "open", label: `Belum lunas (${open.length})` }, { value: "settled", label: "Lunas" }, { value: "all", label: "Semua" }]} />
          <div className="flex items-center gap-1">
            {privacy.eye("debtList", "size-8")}
            <Button size="sm" onClick={onAdd}><Plus className="size-4" aria-hidden /> Catat</Button>
          </div>
        </div>

        {all.length === 0 ? (
          <EmptyState
            className="pb-10"
            icon={<Handshake className="size-5" />}
            title="Belum ada catatan utang-piutang"
            description="Catat siapa utang ke siapa, berapa, dan untuk apa. Centang kalau sudah lunas."
            action={<Button variant="secondary" size="sm" onClick={onAdd}>Catat utang-piutang</Button>}
          />
        ) : shown.length === 0 ? (
          <EmptyState className="pb-10" icon={<Check className="size-5" />}
            title={scope === "open" ? "Semua sudah lunas" : "Belum ada yang lunas"} />
        ) : (
          <ul className="divide-y divide-border/70 border-t border-border/70">
            {shown.map((n) => {
              const done = isSettled(n);
              const theyOwe = n.direction === "THEY_OWE";
              return (
                <li key={n.id} className="flex items-start gap-3 py-3 pl-4 pr-2 sm:pl-5">
                  {/* Checkbox: lunas */}
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={done}
                    aria-label={`${n.person}: ${done ? "lunas" : "tandai lunas"}`}
                    onClick={() => onToggle(n)}
                    className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border transition-colors", focusRing,
                      done ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/60")}
                  >
                    {done && <Check className="size-4" aria-hidden />}
                  </button>

                  <div className="min-w-0 flex-1">
                    {/* Phones: amount under the name; wider screens: on the right */}
                    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                      <p className={cn("min-w-0 break-words text-sm", done ? "text-muted-foreground line-through" : "text-foreground")}>
                        {theyOwe
                          ? <><span className="font-medium">{n.person}</span> utang ke kamu</>
                          : <>Kamu utang ke <span className="font-medium">{n.person}</span></>}
                      </p>
                      <span className={cn("text-sm font-semibold tabular-nums sm:shrink-0",
                        done ? "font-normal text-muted-foreground" : theyOwe ? "text-income" : "text-foreground")}>
                        {done ? "Lunas" : `${theyOwe ? "+" : "−"}${money(left(n))}`}
                      </span>
                    </div>
                    {n.note && <p className="mt-0.5 break-words text-xs text-foreground/80">{n.note}</p>}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDayMonth(n.createdAt)}
                      {n.paid > 0 && !done && <> · dibayar {money(n.paid)} dari {money(n.amount)}</>}
                      {done && <> · {money(n.amount)}</>}
                    </p>
                  </div>

                  <div className="flex shrink-0">
                    <IconButton label="Ubah catatan" onClick={() => onEdit(n)}><Pencil className="size-4" /></IconButton>
                    <IconButton label="Hapus catatan" onClick={() => onDelete(n)} className="hover:text-destructive"><Trash2 className="size-4" /></IconButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
