"use client";

import React, { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { categoryLabel, formatDayMonth, formatRupiah, formatTime, TX_TYPE_LABEL, type TxType } from "@/lib/format";
import { Button, Card, EmptyState } from "../../common/ui";

export interface ReviewTx {
  id: string;
  type: TxType;
  amount: number;
  category: string;
  subcategory?: string | null;
  rawText?: string | null;
  confidenceScore: number;
  createdAt: string;
  fromAccount?: { name: string } | null;
  toAccount?: { name: string } | null;
}

interface InboxViewProps {
  items: ReviewTx[];
  onConfirm: (tx: ReviewTx) => Promise<void>;
  onEdit: (tx: ReviewTx) => void;
  onDelete: (tx: ReviewTx) => void;
  onDeleteAll: () => void;
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm text-foreground">{children}</dd>
    </div>
  );
}

export default function InboxView({ items, onConfirm, onEdit, onDelete, onDeleteAll }: InboxViewProps) {
  const [confirming, setConfirming] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <Card>
        <EmptyState
          className="py-14"
          icon={<CheckCircle2 className="size-5" />}
          title="Tidak ada yang perlu ditinjau"
          description="Transaksi dari WhatsApp yang belum yakin dibaca bot akan muncul di sini untuk Anda periksa."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted-foreground">
          Bot belum yakin membaca {items.length} pesan berikut. Periksa, ubah jika perlu, lalu konfirmasi agar saldo diperbarui.
        </p>
        <Button variant="danger" size="sm" onClick={onDeleteAll}>Hapus semua</Button>
      </div>

      <ul className="space-y-3">
        {items.map((tx) => {
          const account = tx.type === "TRANSFER"
            ? `${tx.fromAccount?.name ?? "?"} → ${tx.toAccount?.name ?? "?"}`
            : tx.fromAccount?.name ?? tx.toAccount?.name ?? "Belum diketahui";
          return (
            <li key={tx.id}>
              <Card className="p-0">
                <div className="border-b border-border/70 px-5 py-3">
                  <p className="text-xs text-muted-foreground">
                    Pesan WhatsApp · {formatDayMonth(tx.createdAt)}, {formatTime(tx.createdAt)}
                  </p>
                  <blockquote className="mt-1 text-sm text-foreground">&ldquo;{tx.rawText || "-"}&rdquo;</blockquote>
                </div>
                <div className="px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-xl font-semibold tracking-tight text-foreground">{formatRupiah(tx.amount)}</p>
                    <p className="text-xs text-muted-foreground">Keyakinan bot {Math.round(tx.confidenceScore * 100)}%</p>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <Detail label="Jenis">{TX_TYPE_LABEL[tx.type]}</Detail>
                    <Detail label="Kategori">{tx.subcategory ? `${categoryLabel(tx.category)} · ${tx.subcategory}` : categoryLabel(tx.category)}</Detail>
                    <Detail label="Rekening">{account}</Detail>
                  </dl>
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => onDelete(tx)} className="hover:text-destructive">Hapus</Button>
                    <Button variant="secondary" size="sm" onClick={() => onEdit(tx)}>Ubah</Button>
                    <Button
                      size="sm"
                      loading={confirming === tx.id}
                      onClick={async () => {
                        setConfirming(tx.id);
                        try { await onConfirm(tx); } finally { setConfirming(null); }
                      }}
                    >
                      Konfirmasi
                    </Button>
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
