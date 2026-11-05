"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, Button, SegmentedControl, SelectField, TextField } from "../common/ui";
import { CATEGORIES, categoryLabel, TX_TYPE_LABEL, type TxType } from "@/lib/format";

// ---------- Shared shell ----------

export function AppDialog({ open, onClose, title, description, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] grid-cols-1 gap-5 overflow-y-auto overflow-x-hidden rounded-2xl bg-card p-5 sm:max-w-md sm:p-6">
        <DialogHeader className="pr-8">
          <DialogTitle className="text-lg font-semibold">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function DialogActions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">{children}</div>;
}

function apiError(err: unknown, fallback: string) {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(". ");
  return msg || fallback;
}

/** Runs an async save, keeps the dialog open and shows the error if it fails. */
function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (action: () => Promise<void>, fallback = "Gagal menyimpan. Coba lagi.") => {
    setBusy(true);
    setError("");
    try {
      await action();
      return true;
    } catch (err) {
      setError(apiError(err, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, submit };
}

// ---------- Amount input: digits only, shown with thousand separators ----------

const toDigits = (v: string) => v.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
const showDigits = (digits: string) => (digits ? Number(digits).toLocaleString("id-ID") : "");

function AmountField({ label, digits, onChange, error, hint, allowNegative }: {
  label: string;
  digits: string;
  onChange: (digits: string) => void;
  error?: string;
  hint?: string;
  allowNegative?: boolean;
}) {
  const negative = allowNegative && digits.startsWith("-");
  const raw = negative ? digits.slice(1) : digits;
  return (
    <TextField
      label={label}
      prefix="Rp"
      inputMode="numeric"
      autoComplete="off"
      value={(negative ? "-" : "") + showDigits(raw)}
      onChange={(e) => {
        const v = e.target.value.trim();
        const neg = allowNegative && v.startsWith("-");
        onChange((neg ? "-" : "") + toDigits(v));
      }}
      placeholder="0"
      error={error}
      hint={hint}
    />
  );
}

// ---------- Confirm ----------

export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = "Hapus", destructive = true }: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
}) {
  const { busy, error, submit } = useSubmit();
  return (
    <AppDialog open={open} onClose={onClose} title={title} description={description}>
      {error && <Alert>{error}</Alert>}
      <DialogActions>
        <Button variant="secondary" onClick={onClose} disabled={busy}>Batal</Button>
        <Button
          variant={destructive ? "danger" : "primary"}
          loading={busy}
          onClick={async () => {
            if (await submit(onConfirm, "Gagal. Coba lagi.")) onClose();
          }}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </AppDialog>
  );
}

// ---------- Account ----------

export interface AccountLike {
  id: string;
  name: string;
  balance: number;
  /** Transactions that use this account (as source or destination) */
  transactionCount?: number;
}

/** Create (account = null) or edit an account. Mount only while open so fields start fresh. */
export function AccountDialog({ account, onClose, onSave, onDelete }: {
  account: AccountLike | null;
  onClose: () => void;
  onSave: (name: string, balance: number) => Promise<void>;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(account?.name ?? "");
  const [balance, setBalance] = useState(account ? String(Math.round(account.balance)) : "");
  const [nameError, setNameError] = useState("");
  const { busy, error, submit } = useSubmit();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setNameError("Beri nama rekening, misalnya BCA atau Tunai.");
    setNameError("");
    if (await submit(() => onSave(name.trim(), Number(balance || 0)))) onClose();
  };

  return (
    <AppDialog
      open
      onClose={onClose}
      title={account ? "Ubah rekening" : "Tambah rekening"}
      description={account ? undefined : "Rekening bank, e-wallet, atau uang tunai yang ingin Anda catat."}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <TextField label="Nama rekening" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="BCA, GoPay, Tunai" autoFocus error={nameError} maxLength={50} />
        <AmountField label={account ? "Saldo" : "Saldo awal"} digits={balance} onChange={setBalance} allowNegative
          hint={account ? "Mengubah saldo langsung tidak membuat transaksi." : "Boleh 0 dan diubah nanti."} />
        <DialogActions>
          {account && onDelete && (
            <Button variant="danger" onClick={onDelete} className="sm:mr-auto" disabled={busy}>Hapus</Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={busy}>Batal</Button>
          <Button type="submit" loading={busy}>{account ? "Simpan" : "Tambah rekening"}</Button>
        </DialogActions>
      </form>
    </AppDialog>
  );
}

// ---------- Budget ----------

export interface BudgetLike { id: string; categoryName: string; limit: number }

export function BudgetDialog({ budget, categories, onClose, onSave, onDelete }: {
  budget: BudgetLike | null;
  /** Category codes to offer (known + used in the user's transactions) */
  categories: string[];
  onClose: () => void;
  onSave: (category: string, limit: number) => Promise<void>;
  onDelete?: () => void;
}) {
  const [category, setCategory] = useState(budget?.categoryName ?? "");
  const [limit, setLimit] = useState(budget ? String(Math.round(budget.limit)) : "");
  const [errors, setErrors] = useState<{ category?: string; limit?: string }>({});
  const { busy, error, submit } = useSubmit();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!category) errs.category = "Pilih kategori.";
    if (!Number(limit)) errs.limit = "Masukkan batas lebih dari 0.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    if (await submit(() => onSave(category, Number(limit)))) onClose();
  };

  return (
    <AppDialog
      open
      onClose={onClose}
      title={budget ? `Anggaran ${categoryLabel(budget.categoryName)}` : "Atur anggaran"}
      description="Batas pengeluaran per bulan untuk satu kategori."
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <SelectField label="Kategori" value={category} onChange={(e) => setCategory(e.target.value)}
          disabled={!!budget} error={errors.category}>
          <option value="">Pilih kategori</option>
          {categories.filter((c) => c !== "INCOME").map((c) => (
            <option key={c} value={c}>{categoryLabel(c)}</option>
          ))}
        </SelectField>
        <AmountField label="Batas per bulan" digits={limit} onChange={setLimit} error={errors.limit} />
        <DialogActions>
          {budget && onDelete && (
            <Button variant="danger" onClick={onDelete} className="sm:mr-auto" disabled={busy}>Hapus</Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={busy}>Batal</Button>
          <Button type="submit" loading={busy}>Simpan</Button>
        </DialogActions>
      </form>
    </AppDialog>
  );
}

// ---------- Transaction ----------

export interface TransactionInput {
  type: TxType;
  amount: number;
  category: string;
  subcategory?: string;
  fromAccountId: string | null;
  toAccountId: string | null;
  createdAt: string;
}

export interface TransactionLike {
  id: string;
  type: TxType;
  amount: number;
  category: string;
  subcategory?: string | null;
  fromAccountId?: string | null;
  toAccountId?: string | null;
  createdAt: string;
}

/** "2026-11-05T14:30" in local time, for <input type="datetime-local"> */
const toLocalInput = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/** Create (transaction = null) or edit. Mount only while open so fields start fresh. */
export function TransactionDialog({ transaction, accounts, categories, onClose, onSave, onAddAccount }: {
  transaction: TransactionLike | null;
  accounts: AccountLike[];
  categories: string[];
  onClose: () => void;
  onSave: (data: TransactionInput) => Promise<void>;
  onAddAccount: () => void;
}) {
  const [type, setType] = useState<TxType>(transaction?.type ?? "EXPENSE");
  const [amount, setAmount] = useState(transaction ? String(Math.round(transaction.amount)) : "");
  const [category, setCategory] = useState(transaction?.category ?? "");
  const [description, setDescription] = useState(transaction?.subcategory ?? "");
  const [fromAccountId, setFromAccountId] = useState(transaction?.fromAccountId ?? "");
  const [toAccountId, setToAccountId] = useState(transaction?.toAccountId ?? "");
  const [when, setWhen] = useState(toLocalInput(transaction ? new Date(transaction.createdAt) : new Date()));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { busy, error, submit } = useSubmit();

  const needsFrom = type !== "INCOME";
  const needsTo = type !== "EXPENSE";

  if (accounts.length === 0) {
    return (
      <AppDialog open onClose={onClose} title="Tambah transaksi" description="Transaksi selalu tercatat pada sebuah rekening.">
        <Alert tone="info">Belum ada rekening. Tambahkan rekening terlebih dahulu, misalnya BCA atau Tunai.</Alert>
        <DialogActions>
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button onClick={onAddAccount}>Tambah rekening</Button>
        </DialogActions>
      </AppDialog>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!Number(amount)) errs.amount = "Masukkan jumlah lebih dari 0.";
    if (needsFrom && !fromAccountId) errs.from = "Pilih rekening.";
    if (needsTo && !toAccountId) errs.to = "Pilih rekening.";
    if (type === "TRANSFER" && fromAccountId && fromAccountId === toAccountId) errs.to = "Rekening tujuan harus berbeda.";
    if (!when) errs.when = "Pilih tanggal.";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const ok = await submit(() =>
      onSave({
        type,
        amount: Number(amount),
        category: category || (type === "INCOME" ? "INCOME" : "UNCATEGORIZED"),
        subcategory: description.trim() || undefined,
        fromAccountId: needsFrom ? fromAccountId : null,
        toAccountId: needsTo ? toAccountId : null,
        createdAt: new Date(when).toISOString(),
      }),
    );
    if (ok) onClose();
  };

  const accountOptions = accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>);

  return (
    <AppDialog open onClose={onClose} title={transaction ? "Ubah transaksi" : "Tambah transaksi"}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <SegmentedControl<TxType>
          label="Jenis transaksi"
          value={type}
          onChange={setType}
          className="flex w-full"
          options={(["EXPENSE", "INCOME", "TRANSFER"] as TxType[]).map((t) => ({ value: t, label: TX_TYPE_LABEL[t] }))}
        />
        <AmountField label="Jumlah" digits={amount} onChange={setAmount} error={errors.amount} />
        {type !== "TRANSFER" && (
          <SelectField label="Kategori" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{type === "INCOME" ? "Pemasukan" : "Tanpa kategori"}</option>
            {categories.filter((c) => (type === "INCOME" ? true : c !== "INCOME")).map((c) => (
              <option key={c} value={c}>{categoryLabel(c)}</option>
            ))}
          </SelectField>
        )}
        <TextField label="Keterangan (opsional)" value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="Makan siang, bensin, gaji" maxLength={100} />
        <div className={type === "TRANSFER" ? "grid gap-4 sm:grid-cols-2" : "space-y-4"}>
          {needsFrom && (
            <SelectField label={type === "TRANSFER" ? "Dari rekening" : "Rekening"} value={fromAccountId}
              onChange={(e) => setFromAccountId(e.target.value)} error={errors.from}>
              <option value="">Pilih rekening</option>
              {accountOptions}
            </SelectField>
          )}
          {needsTo && (
            <SelectField label={type === "TRANSFER" ? "Ke rekening" : "Rekening"} value={toAccountId}
              onChange={(e) => setToAccountId(e.target.value)} error={errors.to}>
              <option value="">Pilih rekening</option>
              {accountOptions}
            </SelectField>
          )}
        </div>
        <TextField label="Tanggal & waktu" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} error={errors.when} />
        <DialogActions>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Batal</Button>
          <Button type="submit" loading={busy}>{transaction ? "Simpan" : "Tambah transaksi"}</Button>
        </DialogActions>
      </form>
    </AppDialog>
  );
}

/** Known parser categories first, then any other categories the user already has. */
export function categoryOptions(extra: (string | null | undefined)[]) {
  const set = new Set(Object.keys(CATEGORIES).filter((c) => c !== "UNCATEGORIZED"));
  extra.forEach((c) => c && set.add(c.toUpperCase()));
  return [...set];
}
