"use client";

import React, { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SPENDING_CATEGORIES, categoryLabel, formatRupiah } from "@/lib/format";
import type { DebtInput, DebtParticipant, DebtRecord, DebtType } from "@/lib/api";
import { Alert, Button, IconButton, SegmentedControl, SelectField, TextField, inputBase } from "../common/ui";
import { AmountField, AppDialog, DialogActions, useSubmit, type AccountLike } from "./dialogs";

export const DEBT_TYPE_LABEL: Record<DebtType, string> = { RECEIVABLE: "Piutang / Talangan", PAYABLE: "Utang" };

const todayInput = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dateInput = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/** Noon local time, so the date is the same in every time zone */
const fromDateInput = (value: string) => new Date(`${value}T12:00:00`).toISOString();

const digitsOf = (v: string) => v.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
const showDigits = (d: string) => (d ? Number(d).toLocaleString("id-ID") : "");

function Check({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/70 px-3.5 py-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-foreground" />
      <span className="min-w-0">
        <span className="block text-sm text-foreground">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

type Row = { key: string; id?: string; personName: string; expected: string; isPaid: boolean };
let rowKey = 0;
const newRow = (p?: DebtParticipant): Row => ({
  key: p?.id ?? `new-${rowKey++}`,
  id: p?.id,
  personName: p?.personName ?? "",
  expected: p?.expectedAmount ? String(p.expectedAmount) : "",
  isPaid: p?.isPaid ?? false,
});

// ---------- Add / edit a record ----------

export function DebtRecordDialog({ record, defaultType = "RECEIVABLE", accounts, onClose, onSave, onDelete, onAddAccount }: {
  record: DebtRecord | null;
  defaultType?: DebtType;
  accounts: AccountLike[];
  onClose: () => void;
  onSave: (input: DebtInput) => Promise<void>;
  onDelete?: () => void;
  onAddAccount: () => void;
}) {
  const editing = !!record;
  const [type, setType] = useState<DebtType>(record?.type ?? defaultType);
  const [title, setTitle] = useState(record?.title ?? "");
  const [total, setTotal] = useState(record ? String(record.totalAmount) : "");
  const [category, setCategory] = useState(record?.category ?? "FOOD");
  const [accountId, setAccountId] = useState(record?.accountId ?? accounts[0]?.id ?? "");
  const [addToBalance, setAddToBalance] = useState(record?.addToBalance ?? false);
  const [recordExpense, setRecordExpense] = useState(record?.recordExpense ?? true);
  const [expenseTouched, setExpenseTouched] = useState(editing);
  const [date, setDate] = useState(record ? dateInput(record.date) : todayInput());
  const [notes, setNotes] = useState(record?.notes ?? "");
  const [rows, setRows] = useState<Row[]>(record?.participants.length ? record.participants.map(newRow) : [newRow()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { busy, error, submit } = useSubmit();

  const receivable = type === "RECEIVABLE";
  const usesAccount = receivable || addToBalance;
  const totalNum = Number(total) || 0;
  const expectedSum = rows.reduce((s, r) => s + (Number(r.expected) || 0), 0);
  const named = rows.filter((r) => r.personName.trim());

  if (accounts.length === 0) {
    return (
      <AppDialog open onClose={onClose} title="Catat utang-piutang" description="Talangan selalu keluar dari sebuah rekening.">
        <Alert tone="info">Belum ada rekening. Tambahkan rekening terlebih dahulu, misalnya BCA atau Tunai.</Alert>
        <DialogActions>
          <Button variant="secondary" onClick={onClose}>Batal</Button>
          <Button onClick={onAddAccount}>Tambah rekening</Button>
        </DialogActions>
      </AppDialog>
    );
  }

  const setRow = (key: string, patch: Partial<Row>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  // Equal shares between everyone listed and me (talangan) or between everyone listed (utang)
  const splitEvenly = () => {
    const people = named.length || rows.length;
    if (!totalNum || !people) return;
    const share = Math.floor(totalNum / (people + (receivable ? 1 : 0)));
    setRows((list) => list.map((r) => (r.personName.trim() || !named.length ? { ...r, expected: String(share) } : r)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = "Isi judulnya, misalnya Makan malam bareng.";
    if (!totalNum) errs.total = "Masukkan total lebih dari 0.";
    if (usesAccount && !accountId) errs.account = "Pilih rekening.";
    if (expectedSum > totalNum && totalNum) errs.people = `Total estimasi (${formatRupiah(expectedSum)}) melebihi total ${formatRupiah(totalNum)}.`;
    if (rows.some((r) => !r.personName.trim() && (r.expected || r.id))) errs.people = "Isi nama setiap orang, atau hapus barisnya.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const ok = await submit(() =>
      onSave({
        title: title.trim(),
        type,
        totalAmount: totalNum,
        category,
        accountId: usesAccount ? accountId : null,
        addToBalance: receivable ? false : addToBalance,
        recordExpense: receivable ? true : recordExpense,
        date: fromDateInput(date),
        notes: notes.trim(),
        participants: rows.filter((r) => r.personName.trim()).map((r) => ({ id: r.id, personName: r.personName.trim(), expectedAmount: Number(r.expected) || 0 })),
      }),
    );
    if (ok) onClose();
  };

  return (
    <AppDialog open onClose={onClose} title={editing ? "Ubah catatan" : "Catat utang-piutang"}
      description={receivable
        ? "Saldo rekening langsung berkurang, tapi belum dihitung sebagai pengeluaran sampai catatan diselesaikan."
        : "Belum dihitung sebagai pengeluaran sampai catatan diselesaikan."}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {!editing && (
          <SegmentedControl<DebtType> label="Tipe" value={type} onChange={setType} className="flex w-full"
            options={[{ value: "RECEIVABLE", label: "Piutang / Talangan" }, { value: "PAYABLE", label: "Utang" }]} />
        )}
        <TextField label="Judul" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} autoFocus={!editing}
          placeholder={receivable ? "Makan malam bareng" : "Ditalangin tiket konser"} error={errors.title} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AmountField label="Total awal" digits={total} onChange={setTotal} error={errors.total} />
          <SelectField label="Kategori pengeluaran" value={category} onChange={(e) => setCategory(e.target.value)}
            hint="Dipakai saat dicatat ke laporan">
            {SPENDING_CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
          </SelectField>
        </div>

        {!receivable && (
          <Check checked={addToBalance} label="Uang pinjaman masuk ke rekening saya"
            hint="Centang kalau kamu meminjam uang tunai. Kosongkan kalau temanmu yang membayari (saldo tidak berubah)."
            onChange={(v) => {
              setAddToBalance(v);
              // Paying back a cash loan is not spending; paying back what was covered for you is
              if (!expenseTouched) setRecordExpense(!v);
            }} />
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {usesAccount && (
            <SelectField label={receivable ? "Ditalangi pakai" : "Masuk ke rekening"} value={accountId}
              onChange={(e) => setAccountId(e.target.value)} error={errors.account}>
              <option value="">Pilih rekening</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </SelectField>
          )}
          <TextField label="Tanggal" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        {/* People */}
        <fieldset className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <legend className="text-sm font-medium text-foreground">{receivable ? "Yang harus membayar" : "Kamu utang ke"}</legend>
            {totalNum > 0 && rows.length > 0 && (
              <button type="button" onClick={splitEvenly} className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                {receivable ? "Bagi rata (termasuk aku)" : "Bagi rata"}
              </button>
            )}
          </div>
          {rows.map((r, i) => (
            // Phones: the name on its own line, the estimate and the delete button below it
            <div key={r.key} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
              <input aria-label={`Nama orang ${i + 1}`} value={r.personName} maxLength={60} placeholder="Nama"
                onChange={(e) => setRow(r.key, { personName: e.target.value })} autoComplete="off"
                className={cn(inputBase, "w-full min-w-0 border-border sm:w-auto sm:flex-[3]")} />
              <div className="relative min-w-0 flex-1 sm:flex-[2]">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs text-muted-foreground">Rp</span>
                <input aria-label={`Estimasi bagian orang ${i + 1}`} inputMode="numeric" placeholder="Estimasi" value={showDigits(r.expected)}
                  onChange={(e) => setRow(r.key, { expected: digitsOf(e.target.value) })} autoComplete="off"
                  className={cn(inputBase, "border-border pl-8")} />
              </div>
              <IconButton label={r.isPaid ? `${r.personName} sudah bayar, batalkan centangnya dulu` : `Hapus orang ${i + 1}`} disabled={r.isPaid}
                onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))} className="shrink-0 hover:text-destructive">
                <Trash2 className="size-4" />
              </IconButton>
            </div>
          ))}
          {errors.people && <p className="text-xs text-destructive">{errors.people}</p>}
          <Button variant="ghost" size="sm" onClick={() => setRows((list) => [...list, newRow()])}><Plus className="size-4" aria-hidden /> Tambah orang</Button>
        </fieldset>

        {!receivable && (
          <Check checked={recordExpense} onChange={(v) => { setRecordExpense(v); setExpenseTouched(true); }}
            label="Catat yang kubayar sebagai pengeluaran saat selesai"
            hint="Matikan untuk pinjaman uang tunai: mengembalikannya bukan belanja." />
        )}
        <TextField label="Catatan (opsional)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={300} />

        {totalNum > 0 && (
          <dl className="space-y-1 rounded-xl bg-muted px-3.5 py-2.5 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Total awal</dt><dd className="tabular-nums text-foreground">{formatRupiah(totalNum)}</dd></div>
            {expectedSum > 0 && (
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Estimasi dibayar {receivable ? "orang lain" : "olehku"}</dt><dd className="tabular-nums text-foreground">{formatRupiah(expectedSum)}</dd></div>
            )}
            {receivable && expectedSum > 0 && (
              <div className="flex justify-between gap-3 font-medium"><dt className="text-foreground">Porsimu (jadi pengeluaran)</dt><dd className="tabular-nums text-foreground">{formatRupiah(Math.max(0, totalNum - expectedSum))}</dd></div>
            )}
          </dl>
        )}

        <DialogActions>
          {editing && onDelete && <Button variant="danger" onClick={onDelete} className="sm:mr-auto" disabled={busy}>Hapus</Button>}
          <Button variant="secondary" onClick={onClose} disabled={busy}>Batal</Button>
          <Button type="submit" loading={busy}>{editing ? "Simpan" : "Catat"}</Button>
        </DialogActions>
      </form>
    </AppDialog>
  );
}

// ---------- Tick a person: amount, account, date ----------

export function PayDialog({ record, participant, accounts, onClose, onSave }: {
  record: DebtRecord;
  participant: DebtParticipant;
  accounts: AccountLike[];
  onClose: () => void;
  onSave: (input: { amount: number; accountId: string; paidAt: string }) => Promise<void>;
}) {
  const receivable = record.type === "RECEIVABLE";
  const suggested = participant.isPaid ? participant.paidAmount : participant.expectedAmount;
  const [amount, setAmount] = useState(suggested ? String(suggested) : "");
  const [accountId, setAccountId] = useState(participant.paidAccountId ?? record.accountId ?? accounts[0]?.id ?? "");
  const [date, setDate] = useState(participant.paidAt ? dateInput(participant.paidAt) : todayInput());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { busy, error, submit } = useSubmit();
  const account = accounts.find((a) => a.id === accountId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!Number(amount)) errs.amount = "Masukkan nominal yang dibayar.";
    if (!accountId) errs.account = "Pilih rekening.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    if (await submit(() => onSave({ amount: Number(amount), accountId, paidAt: fromDateInput(date) }))) onClose();
  };

  return (
    <AppDialog open onClose={onClose} title={receivable ? `${participant.personName} bayar` : `Bayar ke ${participant.personName}`}
      description={`${record.title}${participant.expectedAmount ? `, estimasi ${formatRupiah(participant.expectedAmount)}` : ""}`}>
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <AmountField label="Nominal yang dibayar" digits={amount} onChange={setAmount} error={errors.amount} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SelectField label={receivable ? "Masuk ke rekening" : "Dibayar dari rekening"} value={accountId} onChange={(e) => setAccountId(e.target.value)} error={errors.account}>
            <option value="">Pilih rekening</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </SelectField>
          <TextField label="Tanggal bayar" type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayInput()} />
        </div>
        {account && Number(amount) > 0 && (
          <p className="rounded-xl bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">
            Saldo {account.name} langsung {receivable ? "bertambah" : "berkurang"} {formatRupiah(Number(amount))}. Tidak dihitung sebagai {receivable ? "pemasukan" : "pengeluaran"}.
          </p>
        )}
        <DialogActions>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Batal</Button>
          <Button type="submit" loading={busy}>{participant.isPaid ? "Simpan" : "Tandai sudah bayar"}</Button>
        </DialogActions>
      </form>
    </AppDialog>
  );
}

// ---------- Settle ----------

export function SettleDialog({ record, onClose, onConfirm }: {
  record: DebtRecord;
  onClose: () => void;
  onConfirm: (input: { recordExcessAsIncome?: boolean; recordExpense?: boolean }) => Promise<void>;
}) {
  const receivable = record.type === "RECEIVABLE";
  const { total, paid, difference } = record.progress;
  const [excessAsIncome, setExcessAsIncome] = useState(false);
  const [recordExpense, setRecordExpense] = useState(record.recordExpense);
  const { busy, error, submit } = useSubmit();
  const unpaid = record.participants.filter((p) => !p.isPaid);
  const category = categoryLabel(record.category);

  let result: React.ReactNode;
  if (receivable) {
    result = difference > 0
      ? <>Selisih <b className="text-foreground">{formatRupiah(difference)}</b> akan dicatat ke laporan Pengeluaran kategori <b className="text-foreground">{category}</b>, tanpa mengubah saldo rekening.</>
      : difference === 0
        ? <>Lunas pas, tidak ada pengeluaran yang dicatat.</>
        : <>Orang lain membayar <b className="text-foreground">{formatRupiah(-difference)}</b> lebih dari total.</>;
  } else {
    result = recordExpense && paid > 0
      ? <><b className="text-foreground">{formatRupiah(paid)}</b> yang kamu bayar akan dicatat ke laporan Pengeluaran kategori <b className="text-foreground">{category}</b>, tanpa mengubah saldo rekening.</>
      : <>Tidak ada pengeluaran yang dicatat.</>;
  }

  return (
    <AppDialog open onClose={onClose} title="Tandai selesai?" description={record.title}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <dl className="space-y-1 rounded-xl bg-muted px-3.5 py-2.5 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Total awal</dt><dd className="tabular-nums text-foreground">{formatRupiah(total)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Total dibayar</dt><dd className="tabular-nums text-foreground">{formatRupiah(paid)}</dd></div>
          <div className="flex justify-between gap-3 font-medium"><dt className="text-foreground">Selisih</dt><dd className="tabular-nums text-foreground">{formatRupiah(difference)}</dd></div>
        </dl>
        <p className="text-sm text-muted-foreground">{result}</p>
        {receivable && difference < 0 && (
          <Check checked={excessAsIncome} onChange={setExcessAsIncome} label={`Catat kelebihan ${formatRupiah(-difference)} sebagai pemasukan`}
            hint="Hanya ke laporan; saldo sudah bertambah saat pembayaran dicentang." />
        )}
        {!receivable && paid > 0 && (
          <Check checked={recordExpense} onChange={setRecordExpense} label="Catat sebagai pengeluaran"
            hint="Matikan kalau ini pengembalian pinjaman uang tunai." />
        )}
        {unpaid.length > 0 && (
          <Alert tone="info">
            {unpaid.map((p) => p.personName).join(", ")} belum dicentang. Kalau diselesaikan sekarang, {unpaid.length === 1 ? "bagiannya" : "bagian mereka"} {receivable ? "ikut jadi pengeluaranmu" : "tidak tercatat sebagai pengeluaran"}.
          </Alert>
        )}
        <DialogActions>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Batal</Button>
          <Button loading={busy} onClick={async () => {
            const ok = await submit(() => onConfirm(receivable ? { recordExcessAsIncome: excessAsIncome } : { recordExpense }));
            if (ok) onClose();
          }}>Konfirmasi selesai</Button>
        </DialogActions>
      </div>
    </AppDialog>
  );
}
