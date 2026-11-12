"use client";

import React, { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, ChevronDown, Handshake, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDayMonth, formatRupiah } from "@/lib/format";
import { Button, Card, CardHeader, EmptyState, IconButton, SegmentedControl, focusRing } from "../../common/ui";
import type { DebtPreset } from "../dialogs";
import { usePrivacy } from "../shared/privacy";

export interface DebtEntry {
  id: string;
  type: "EXPENSE" | "INCOME";
  amount: number;
  category: string;
  subcategory?: string | null;
  counterparty?: string | null;
  fromAccountId?: string | null;
  toAccountId?: string | null;
  fromAccount?: { name: string } | null;
  toAccount?: { name: string } | null;
  createdAt: string;
}

export interface DebtPerson {
  /** "" = transactions without a person */
  name: string;
  out: number;
  in: number;
  /** out − in: above 0 they still owe you, below 0 you owe them */
  balance: number;
  count: number;
  lastAt: string;
}

export interface DebtSummary {
  people: DebtPerson[];
  owedToYou: number;
  youOwe: number;
  entries: DebtEntry[];
}

interface DebtsViewProps {
  data: DebtSummary | null;
  onRecord: (preset: DebtPreset) => void;
  onEdit: (tx: DebtEntry) => void;
  onDelete: (tx: DebtEntry) => void;
}

const NO_NAME = "Tanpa nama";
const personKey = (name: string | null | undefined) => (name ?? "").trim().toLowerCase();

function StatusLine({ person }: { person: DebtPerson }) {
  if (person.balance > 0) return <>Belum bayar ke kamu</>;
  if (person.balance < 0) return <>Kamu belum bayar</>;
  return <>Lunas</>;
}

export default function DebtsView({ data, onRecord, onEdit, onDelete }: DebtsViewProps) {
  const privacy = usePrivacy(["debtSummary", "debtPeople"] as const);
  const [scope, setScope] = useState<"open" | "all">("open");
  const [expanded, setExpanded] = useState<string | null>(null);

  const people = data?.people ?? [];
  const openPeople = people.filter((p) => p.balance !== 0);
  const shownPeople = scope === "open" ? openPeople : people;
  const owedCount = people.filter((p) => p.balance > 0).length;
  const oweCount = people.filter((p) => p.balance < 0).length;
  const amount = (v: number) => privacy.show("debtPeople", formatRupiah(v));

  return (
    <div className="space-y-6">
      {privacy.unlockDialog}

      <Card>
        <CardHeader
          title="Ringkasan"
          description="Semua waktu · tidak termasuk pemasukan & pengeluaran"
          action={privacy.eye("debtSummary", "size-8")}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="@container rounded-xl border border-border/70 p-4">
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <ArrowUpRight className="size-4" aria-hidden /> Orang lain berutang ke kamu
            </p>
            <p className="mt-2 break-words text-[clamp(1rem,9cqi,1.5rem)] font-semibold leading-tight tracking-tight text-foreground">
              {privacy.show("debtSummary", formatRupiah(data?.owedToYou ?? 0))}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{owedCount} orang belum lunas</p>
          </div>
          <div className="@container rounded-xl border border-border/70 p-4">
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <ArrowDownLeft className="size-4" aria-hidden /> Utang kamu
            </p>
            <p className="mt-2 break-words text-[clamp(1rem,9cqi,1.5rem)] font-semibold leading-tight tracking-tight text-foreground">
              {privacy.show("debtSummary", formatRupiah(data?.youOwe ?? 0))}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">ke {oweCount} orang</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
          <Button onClick={() => onRecord({ type: "EXPENSE" })}>
            <ArrowUpRight className="size-4" aria-hidden /> Talangin / pinjamkan
          </Button>
          <Button variant="secondary" onClick={() => onRecord({ type: "INCOME" })}>
            <ArrowDownLeft className="size-4" aria-hidden /> Dibayar balik / pinjam
          </Button>
        </div>
      </Card>

      <Card className="p-0">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">Per orang</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Ketuk nama untuk melihat riwayat dan mencatat pembayaran.</p>
          </div>
          <div className="flex items-center gap-2">
            {privacy.eye("debtPeople", "size-8")}
            <SegmentedControl label="Tampilkan" value={scope} onChange={setScope}
              options={[{ value: "open", label: "Belum lunas" }, { value: "all", label: "Semua" }]} />
          </div>
        </div>

        {people.length === 0 ? (
          <EmptyState
            className="pb-10"
            icon={<Handshake className="size-5" />}
            title="Belum ada utang-piutang"
            description='Catat saat kamu menalangi teman atau dibayar balik. Lewat chat juga bisa: "talangin makan Budi 50rb pakai BCA" atau "Budi bayar utang 50rb ke BCA".'
          />
        ) : shownPeople.length === 0 ? (
          <EmptyState className="pb-10" icon={<Handshake className="size-5" />} title="Semua sudah lunas"
            action={<Button variant="secondary" size="sm" onClick={() => setScope("all")}>Lihat semua</Button>} />
        ) : (
          <ul className="divide-y divide-border/70 border-t border-border/70">
            {shownPeople.map((p) => {
              const key = personKey(p.name);
              const open = expanded === key;
              const label = p.name || NO_NAME;
              const history = (data?.entries ?? []).filter((e) => personKey(e.counterparty) === key);
              return (
                <li key={key || "_none"}>
                  <button type="button" onClick={() => setExpanded(open ? null : key)} aria-expanded={open}
                    className={cn("flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-muted/40", focusRing)}>
                    <div className="min-w-0 flex-1">
                      <p className={cn("truncate text-sm font-medium", p.name ? "text-foreground" : "text-muted-foreground")}>{label}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        Keluar {amount(p.out)} · Masuk {amount(p.in)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={cn("text-sm font-semibold tabular-nums", p.balance === 0 ? "text-muted-foreground" : "text-foreground")}>
                        {p.balance === 0 ? "Lunas" : amount(Math.abs(p.balance))}
                      </p>
                      {p.balance !== 0 && <p className="text-xs text-muted-foreground"><StatusLine person={p} /></p>}
                    </div>
                    <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
                  </button>

                  {open && (
                    <div className="bg-muted/30 px-5 pb-4 pt-1">
                      {!p.name && (
                        <p className="mb-2 text-xs text-muted-foreground">
                          Transaksi ini belum punya nama orang. Ubah lalu isi <span className="text-foreground">Nama orang</span> supaya terhitung per orang.
                        </p>
                      )}
                      <div className="mb-2 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
                        {p.balance > 0 && (
                          <Button size="sm" onClick={() => onRecord({ type: "INCOME", counterparty: p.name, amount: p.balance, description: `${label} bayar utang` })}>
                            Catat pembayaran
                          </Button>
                        )}
                        {p.balance < 0 && (
                          <Button size="sm" onClick={() => onRecord({ type: "EXPENSE", counterparty: p.name, amount: -p.balance, description: `Bayar utang ke ${label}` })}>
                            Bayar utang
                          </Button>
                        )}
                        <Button variant="secondary" size="sm" onClick={() => onRecord({ type: "EXPENSE", counterparty: p.name })}>
                          Talangin lagi
                        </Button>
                      </div>
                      <ul className="divide-y divide-border/70">
                        {history.map((e) => (
                          <li key={e.id} className="flex items-center gap-2 py-2.5">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm text-foreground">{e.subcategory || (e.type === "EXPENSE" ? "Uang keluar" : "Uang masuk")}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {formatDayMonth(e.createdAt)} · {e.type === "EXPENSE" ? `dari ${e.fromAccount?.name ?? "-"}` : `ke ${e.toAccount?.name ?? "-"}`}
                              </p>
                            </div>
                            <span className={cn("shrink-0 text-sm tabular-nums", e.type === "INCOME" ? "text-income" : "text-foreground")}>
                              {e.type === "INCOME" ? "+" : "−"}{amount(e.amount)}
                            </span>
                            <IconButton label="Ubah transaksi" onClick={() => onEdit(e)}><Pencil className="size-4" /></IconButton>
                            <IconButton label="Hapus transaksi" onClick={() => onDelete(e)}><Trash2 className="size-4" /></IconButton>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
