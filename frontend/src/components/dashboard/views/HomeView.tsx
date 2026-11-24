"use client";

import React, { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartLine, Check, ReceiptText, Target, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { categoryLabel, formatCompact, formatMonth, formatRupiah, inReports } from "@/lib/format";
import type { DebtSummary } from "@/lib/api";
import { Button, Card, CardHeader, EmptyState, SegmentedControl, focusRing } from "../../common/ui";
import { usePrivacy } from "../shared/privacy";

interface Tx {
  id: string;
  type: "EXPENSE" | "INCOME" | "TRANSFER";
  amount: number;
  category: string;
  status: "CONFIRMED" | "NEEDS_REVIEW";
  createdAt: string;
  /** false: a talangan or debt payment (moves money, not income or spending until settled) */
  inReports?: boolean;
}
interface Account { id: string; name: string; balance: number }
interface Budget { id: string; categoryName: string; limit: number }

interface HomeViewProps {
  monthlyTxs: Tx[];
  accounts: Account[];
  budgets: Budget[];
  month: number;
  year: number;
  phoneLinked: boolean;
  /** Any transaction ever recorded (any month); the getting-started steps are hidden after the first one. */
  hasAnyTransaction: boolean;
  /** Open Utang-piutang totals; null while loading */
  debtSummary: DebtSummary | null;
  /** Opens the Utang-piutang page */
  onOpenDebts: () => void;
  /** Market value in rupiah of the investments still held (counted in "Saldo total"); null while loading or none */
  investmentValue: number | null;
  onOpenInvestments: () => void;
  onAddTransaction: () => void;
  onAddAccount: () => void;
  onEditAccount: (account: Account) => void;
  onAddBudget: () => void;
  onEditBudget: (budget: Budget) => void;
  onLinkPhone: () => void;
}

// Chart chrome: recessive, solid hairlines; text in muted ink (dataviz guidelines)
const axisTick = { fontSize: 11, fill: "var(--muted-foreground)" };

function ChartTooltip({ active, payload, label, month, year }: {
  active?: boolean;
  payload?: { value: number | null }[];
  label?: string | number;
  month: number;
  year: number;
}) {
  const value = payload?.[0]?.value;
  if (!active || value == null) return null;
  const date = new Date(year, month - 1, Number(label)).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <p className="text-muted-foreground">{date}</p>
      <p className="mt-0.5 font-medium text-foreground tabular-nums">{formatRupiah(value)}</p>
    </div>
  );
}

function StatTile({ label, value, sub, action }: { label: string; value: string; sub?: string; action?: React.ReactNode }) {
  return (
    <Card className="@container p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        {action}
      </div>
      {/* Proportional figures for standalone numbers. The size follows the tile's width (cqi), so
          "Rp 1.234.567.890" fits a half-width tile on a small phone; very long values still wrap. */}
      <p className="mt-2 break-words text-[clamp(1rem,10.5cqi,1.5rem)] leading-tight font-semibold tracking-tight text-foreground">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </Card>
  );
}

function Onboarding({ hasAccount, phoneLinked, hasTransaction, onAddAccount, onLinkPhone, onAddTransaction }: {
  hasAccount: boolean;
  phoneLinked: boolean;
  hasTransaction: boolean;
  onAddAccount: () => void;
  onLinkPhone: () => void;
  onAddTransaction: () => void;
}) {
  const steps = [
    { done: hasAccount, title: "Tambah rekening", text: "Bank, e-wallet, atau tunai beserta saldonya.", action: "Tambah rekening", onClick: onAddAccount },
    { done: phoneLinked, title: "Hubungkan WhatsApp", text: "Agar bisa mencatat lewat WhatsApp. Belum ada bot? Pakai tab Chat di web.", action: "Hubungkan", onClick: onLinkPhone },
    { done: hasTransaction, title: "Catat transaksi pertama", text: 'Kirim chat seperti "makan siang 25rb pakai BCA".', action: "Tambah manual", onClick: onAddTransaction },
  ];
  const done = steps.filter((s) => s.done).length;
  return (
    <Card>
      <CardHeader title="Mulai menggunakan WhatsMonTrack" description={`${done} dari ${steps.length} langkah selesai`} />
      <ol className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3 rounded-xl border border-border/70 p-4">
            <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
              s.done ? "bg-foreground text-background" : "border border-border text-muted-foreground")}>
              {s.done ? <Check className="size-3.5" aria-label="Selesai" /> : i + 1}
            </span>
            <div className="min-w-0">
              <p className={cn("text-sm font-medium", s.done ? "text-muted-foreground line-through" : "text-foreground")}>{s.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{s.text}</p>
              {!s.done && <Button variant="secondary" size="sm" className="mt-3" onClick={s.onClick}>{s.action}</Button>}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export default function HomeView({
  monthlyTxs, accounts, budgets, month, year, phoneLinked, hasAnyTransaction, debtSummary, onOpenDebts, investmentValue, onOpenInvestments,
  onAddTransaction, onAddAccount, onEditAccount, onAddBudget, onEditBudget, onLinkPhone,
}: HomeViewProps) {
  // Each section has its own eye (see usePrivacy); showing a hidden one asks for the password
  const privacy = usePrivacy(["balance", "accounts", "income", "expense", "net", "debt"] as const);
  const [breakdown, setBreakdown] = useState<"EXPENSE" | "INCOME">("EXPENSE");

  // Only the selected month: right after switching months the previous month's data is still loaded,
  // and e.g. a transaction on Oct 31 must not be placed on a non-existent "Nov 31".
  const confirmed = useMemo(
    () =>
      monthlyTxs.filter((t) => {
        const d = new Date(t.createdAt);
        return t.status === "CONFIRMED" && d.getMonth() + 1 === month && d.getFullYear() === year;
      }),
    [monthlyTxs, month, year],
  );
  // Talangan and debt payments move money but are not income or spending until their record is settled:
  // left out of the totals, charts and budgets
  const counted = useMemo(() => confirmed.filter(inReports), [confirmed]);
  const accountsTotal = accounts.reduce((s, a) => s + a.balance, 0);
  // Investments count at their live market value, so "Saldo total" is everything the user owns
  const invested = investmentValue ?? 0;
  const hasInvestments = investmentValue != null && investmentValue > 0;
  const totalBalance = accountsTotal + invested;
  const income = counted.filter((t) => t.type === "INCOME").reduce((s, t) => s + t.amount, 0);
  const expense = counted.filter((t) => t.type === "EXPENSE").reduce((s, t) => s + t.amount, 0);
  const net = income - expense;
  const monthName = formatMonth(month, year);

  // Daily series. In the current month, days after today are left empty so the line stops at today,
  // unless a transaction is dated later this month: then the line runs to that day.
  const daysInMonth = new Date(year, month, 0).getDate();
  const now = new Date();
  const lastTxDay = counted.reduce((m, t) => Math.max(m, new Date(t.createdAt).getDate()), 0);
  const lastDay = month === now.getMonth() + 1 && year === now.getFullYear() ? Math.max(now.getDate(), lastTxDay) : daysInMonth;
  const daily = useMemo(() => {
    const rows = Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, income: 0, expense: 0, net: null as number | null }));
    for (const t of counted) {
      const d = new Date(t.createdAt).getDate() - 1;
      if (t.type === "INCOME") rows[d].income += t.amount;
      if (t.type === "EXPENSE") rows[d].expense += t.amount;
    }
    let running = 0;
    for (const r of rows) {
      running += r.income - r.expense;
      r.net = r.day <= lastDay ? running : null;
    }
    return rows;
  }, [counted, daysInMonth, lastDay]);
  const netGoesNegative = daily.some((r) => (r.net ?? 0) < 0);

  const totalBudget = budgets.reduce((s, b) => s + b.limit, 0);
  const dailyBudget = totalBudget > 0 ? totalBudget / daysInMonth : 0;

  // Ranked categories (top 5 + "Lainnya")
  const categories = useMemo(() => {
    const totals = new Map<string, number>();
    for (const t of counted.filter((x) => x.type === breakdown)) {
      const key = (t.category || "UNCATEGORIZED").toUpperCase();
      totals.set(key, (totals.get(key) ?? 0) + t.amount);
    }
    const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 5).map(([code, value]) => ({ label: categoryLabel(code), value }));
    const rest = sorted.slice(5).reduce((s, [, v]) => s + v, 0);
    if (rest > 0) top.push({ label: "Lainnya", value: rest });
    const sum = top.reduce((s, c) => s + c.value, 0);
    return top.map((c) => ({ ...c, share: sum ? c.value / sum : 0 }));
  }, [counted, breakdown]);

  const budgetRows = budgets.map((b) => {
    const spent = counted
      .filter((t) => t.type === "EXPENSE" && (t.category || "UNCATEGORIZED").toUpperCase() === b.categoryName)
      .reduce((s, t) => s + t.amount, 0);
    const ratio = b.limit > 0 ? spent / b.limit : 0;
    return { budget: b, spent, ratio, status: ratio >= 1 ? "over" : ratio >= 0.8 ? "warn" : "ok" };
  });

  const hasTransactions = confirmed.length > 0;
  const showOnboarding = !hasAnyTransaction && (accounts.length === 0 || !phoneLinked);
  const noTxState = (
    <EmptyState
      icon={<ReceiptText className="size-5" />}
      title={`Belum ada transaksi di ${monthName}`}
      description="Catat lewat chat WhatsApp ke bot, atau tambahkan secara manual."
      action={<Button variant="secondary" size="sm" onClick={onAddTransaction}>Tambah transaksi</Button>}
    />
  );

  return (
    <div className="space-y-6">
      {privacy.unlockDialog}
      {showOnboarding && (
        <Onboarding hasAccount={accounts.length > 0} phoneLinked={phoneLinked} hasTransaction={hasTransactions}
          onAddAccount={onAddAccount} onLinkPhone={onLinkPhone} onAddTransaction={onAddTransaction} />
      )}

      {/* Key numbers */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Saldo total"
          value={privacy.show("balance", formatRupiah(totalBalance))}
          sub={hasInvestments ? `${accounts.length} rekening dan investasi` : `${accounts.length} rekening`}
          action={privacy.eye("balance")}
        />
        <StatTile
          label="Pemasukan"
          value={privacy.show("income", formatRupiah(income))}
          sub={monthName}
          action={privacy.eye("income")}
        />
        <StatTile
          label="Pengeluaran"
          value={privacy.show("expense", formatRupiah(expense))}
          sub={monthName}
          action={privacy.eye("expense")}
        />
        <StatTile
          label="Selisih"
          value={privacy.show("net", `${net > 0 ? "+" : ""}${formatRupiah(net)}`)}
          sub="Pemasukan dikurangi pengeluaran"
          action={privacy.eye("net")}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {hasTransactions ? (
            <>
          <Card>
            <CardHeader title="Arus kas" description={`Akumulasi pemasukan dikurangi pengeluaran, ${monthName}`} />
            {hasTransactions ? (
              <div className="h-56" role="img" aria-label={`Arus kas ${monthName}: akhir periode ${formatRupiah(daily[lastDay - 1]?.net ?? 0)}`}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="day" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--border)" }} interval="preserveStartEnd" minTickGap={20} />
                    <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={formatCompact} width={52} tickCount={4} />
                    {netGoesNegative && <ReferenceLine y={0} stroke="var(--muted-foreground)" />}
                    <Tooltip content={<ChartTooltip month={month} year={year} />} cursor={{ stroke: "var(--border)" }} />
                    <Area type="linear" dataKey="net" stroke="var(--foreground)" strokeWidth={2} fill="var(--foreground)" fillOpacity={0.05}
                      dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} connectNulls={false} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : noTxState}
          </Card>

          <Card>
            <CardHeader
              title="Pengeluaran harian"
              description={dailyBudget > 0 ? `Garis putus-putus: rata-rata anggaran per hari (${formatRupiah(Math.round(dailyBudget))})` : monthName}
            />
            {expense > 0 ? (
              <div className="h-56" role="img" aria-label={`Pengeluaran harian ${monthName}, total ${formatRupiah(expense)}`}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={daily} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="day" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--border)" }} interval="preserveStartEnd" minTickGap={20} />
                    <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={formatCompact} width={52} tickCount={4} />
                    <Tooltip content={<ChartTooltip month={month} year={year} />} cursor={{ fill: "var(--muted)" }} />
                    {dailyBudget > 0 && <ReferenceLine y={dailyBudget} stroke="var(--muted-foreground)" strokeDasharray="4 4" />}
                    <Bar dataKey="expense" fill="var(--foreground)" radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState icon={<ReceiptText className="size-5" />} title={`Belum ada pengeluaran di ${monthName}`} />
            )}
          </Card>

          <Card>
            <CardHeader
              title="Per kategori"
              description={monthName}
              action={
                <SegmentedControl label="Jenis" value={breakdown} onChange={setBreakdown}
                  options={[{ value: "EXPENSE", label: "Pengeluaran" }, { value: "INCOME", label: "Pemasukan" }]} />
              }
            />
            {categories.length > 0 ? (
              <ul className="space-y-3">
                {categories.map((c) => (
                  <li key={c.label}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate text-foreground">{c.label}</span>
                      <span className="shrink-0 tabular-nums text-foreground">
                        {formatRupiah(c.value)} <span className="text-muted-foreground">({Math.round(c.share * 100)}%)</span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-muted">
                      <div className="h-full rounded-full bg-foreground" style={{ width: `${Math.max(c.share * 100, 1)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title={breakdown === "EXPENSE" ? "Belum ada pengeluaran" : "Belum ada pemasukan"} description={`Untuk ${monthName}.`} />
            )}
          </Card>
            </>
          ) : (
            <Card>
              <CardHeader title="Aktivitas bulan ini" description="Arus kas, pengeluaran harian, dan kategori akan tampil di sini." />
              {noTxState}
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Rekening"
              action={accounts.length > 0 && (
                <div className="flex items-center gap-1">
                  {/* Its own eye, independent of "Saldo total" */}
                  {privacy.eye("accounts", "size-8")}
                  <Button variant="ghost" size="sm" onClick={onAddAccount}>Tambah</Button>
                </div>
              )}
            />
            {accounts.length > 0 ? (
              <ul className="-mx-2">
                {accounts.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => onEditAccount(a)}
                      className={cn("flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left text-sm transition-colors hover:bg-muted", focusRing)}>
                      <span className="truncate text-foreground">{a.name}</span>
                      <span className="shrink-0 tabular-nums text-foreground">{privacy.show("accounts", formatRupiah(a.balance))}</span>
                    </button>
                  </li>
                ))}
                {hasInvestments && (
                  <li className="mt-1 border-t border-border/70 pt-1">
                    <button type="button" onClick={onOpenInvestments}
                      className={cn("flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left text-sm transition-colors hover:bg-muted", focusRing)}>
                      <span className="flex min-w-0 items-center gap-2 text-foreground">
                        <ChartLine className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="truncate" title="Nilai pasar saat ini">Investasi</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-foreground">{privacy.show("accounts", formatRupiah(invested))}</span>
                    </button>
                  </li>
                )}
              </ul>
            ) : (
              <EmptyState icon={<Wallet className="size-5" />} title="Belum ada rekening"
                description="Tambahkan rekening bank, e-wallet, atau tunai."
                action={<Button variant="secondary" size="sm" onClick={onAddAccount}>Tambah rekening</Button>} />
            )}
          </Card>

          {!!debtSummary?.openCount && (
            <Card>
              <CardHeader
                title="Utang-piutang"
                description={`${debtSummary.openCount} belum selesai, belum termasuk pengeluaran`}
                action={
                  <div className="flex items-center gap-1">
                    {privacy.eye("debt", "size-8")}
                    <Button variant="ghost" size="sm" onClick={onOpenDebts}>Detail</Button>
                  </div>
                }
              />
              <dl className="space-y-2 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">Orang utang ke kamu</dt>
                  <dd className="shrink-0 tabular-nums text-foreground">{privacy.show("debt", formatRupiah(debtSummary.receivable))}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">Kamu utang</dt>
                  <dd className="shrink-0 tabular-nums text-foreground">{privacy.show("debt", formatRupiah(debtSummary.payable))}</dd>
                </div>
              </dl>
            </Card>
          )}

          <Card>
            <CardHeader title="Anggaran" description={monthName} action={budgets.length > 0 && <Button variant="ghost" size="sm" onClick={onAddBudget}>Tambah</Button>} />
            {budgetRows.length > 0 ? (
              <ul className="-mx-2 space-y-1">
                {budgetRows.map(({ budget, spent, ratio, status }) => (
                  <li key={budget.id}>
                    <button type="button" onClick={() => onEditBudget(budget)}
                      className={cn("w-full rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted", focusRing)}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="truncate text-foreground">{categoryLabel(budget.categoryName)}</span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {formatRupiah(spent)} / {formatRupiah(budget.limit)}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 rounded-full bg-muted">
                        <div
                          className={cn("h-full rounded-full", status === "over" ? "bg-destructive" : status === "warn" ? "bg-warning" : "bg-foreground")}
                          style={{ width: `${Math.min(ratio * 100, 100)}%` }}
                        />
                      </div>
                      {/* Status is never color-only */}
                      {status !== "ok" && (
                        <p className={cn("mt-1 text-xs", status === "over" ? "text-destructive" : "text-foreground")}>
                          {status === "over" ? `Melebihi ${formatRupiah(spent - budget.limit)}` : `Hampir habis, sisa ${formatRupiah(budget.limit - spent)}`}
                        </p>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={<Target className="size-5" />} title="Belum ada anggaran"
                description="Tetapkan batas pengeluaran per kategori, misalnya makanan."
                action={<Button variant="secondary" size="sm" onClick={onAddBudget}>Atur anggaran</Button>} />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
