"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  confirmTransaction, createAccount, createTransaction, deleteAccount, deleteBudget, deleteTransaction,
  fetchAccounts, fetchBudgets, fetchPhoneStatus, fetchTransactions, fetchWhatsAppStatus, setBudget,
  updateAccount, updateTransaction, type PhoneStatus, type WhatsAppStatus,
} from "@/lib/api";
import { categoryLabel, formatRupiah } from "@/lib/format";
import type { SessionUser } from "./AuthWrapper";
import { PageSkeleton } from "./dashboard/skeletons";
import { AddMenu, BottomTabs, MobileAccountMenu, MonthSwitcher, NAV_ITEMS, Sidebar, type Tab } from "./dashboard/shared/Navigation";
import HomeView from "./dashboard/views/HomeView";
import LedgerView, { type LedgerTx } from "./dashboard/views/LedgerView";
import InboxView, { type ReviewTx } from "./dashboard/views/InboxView";
import ChatView from "./dashboard/views/ChatView";
import {
  AccountDialog, BudgetDialog, ConfirmDialog, TransactionDialog, categoryOptions,
  type AccountLike, type BudgetLike, type TransactionInput, type TransactionLike,
} from "./dashboard/dialogs";
import WhatsAppStatusModal from "./dashboard/modals/WhatsAppStatusModal";
import LinkWhatsAppModal from "./dashboard/modals/LinkWhatsAppModal";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiTx = any;

type DialogState =
  | { kind: "none" }
  | { kind: "account"; account: AccountLike | null }
  | { kind: "transaction"; tx: TransactionLike | null }
  | { kind: "budget"; budget: BudgetLike | null }
  | { kind: "confirm"; title: string; description: string; confirmLabel: string; action: () => Promise<void> }
  | { kind: "link" }
  | { kind: "bot" };

const PAGE_TITLES: Record<Tab, string> = { dashboard: "Ringkasan", transactions: "Transaksi", chat: "Chat", inbox: "Perlu ditinjau" };
const REFRESH_MS = 15_000;

export default function Dashboard({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") as Tab | null;
  const activeTab: Tab = NAV_ITEMS.some((n) => n.id === tabParam) ? (tabParam as Tab) : "dashboard";
  const navigate = (tab: Tab) => router.push(`/?tab=${tab}`);

  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);

  const [monthlyTxs, setMonthlyTxs] = useState<ApiTx[]>([]);
  const [pageTxs, setPageTxs] = useState<ApiTx[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [accounts, setAccounts] = useState<AccountLike[]>([]);
  const [budgets, setBudgets] = useState<BudgetLike[]>([]);
  const [waStatus, setWaStatus] = useState<WhatsAppStatus | null>(null);
  const [phoneStatus, setPhoneStatus] = useState<PhoneStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // Filters the data on screen belongs to. While they differ from the selected filters,
  // the affected part shows a skeleton instead of the previous month's/page's data.
  const [shown, setShown] = useState<{ month: number; year: number; day: number | null; page: number; limit: number } | null>(null);
  const latestRequest = useRef("");

  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const closeDialog = () => setDialog({ kind: "none" });

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const loadData = useCallback(async () => {
    const key = `${month}/${year}/${selectedDay}/${page}/${limit}`;
    try {
      const [monthly, table, accs, budgs, wa, phone] = await Promise.all([
        fetchTransactions({ month, year, page: 1, limit: 1000 }),
        fetchTransactions({ month, year, day: selectedDay || undefined, page, limit }),
        fetchAccounts(),
        fetchBudgets(),
        fetchWhatsAppStatus().catch(() => null),
        fetchPhoneStatus().catch(() => null),
      ]);
      // A slower response for filters the user already left must not overwrite newer data
      if (key !== latestRequest.current) return;
      setShown({ month, year, day: selectedDay, page, limit });
      setMonthlyTxs(monthly.data ?? monthly);
      setPageTxs((table.data ?? table).filter((t: ApiTx) => t.status === "CONFIRMED"));
      setTotalPages(table.totalPages || 1);
      setAccounts(accs);
      setBudgets(budgs);
      if (wa) setWaStatus(wa);
      if (phone) setPhoneStatus(phone);
      setLoadError(false);
    } catch (e) {
      console.error(e);
      setLoadError(true);
    } finally {
      setLoaded(true);
    }
  }, [month, year, selectedDay, page, limit]);

  useEffect(() => {
    latestRequest.current = `${month}/${year}/${selectedDay}/${page}/${limit}`;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount/filter change, then poll
    loadData();
    const interval = setInterval(loadData, REFRESH_MS);
    const onFocus = () => loadData();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadData, month, year, selectedDay, page, limit]);

  // Month/year changed: every page shows other data. Day/page/size changed: only the ledger list.
  const monthPending = !shown || shown.month !== month || shown.year !== year;
  const listPending = monthPending || shown.day !== selectedDay || shown.page !== page || shown.limit !== limit;

  const changeMonth = (m: number, y: number) => {
    setMonth(m);
    setYear(y);
    setSelectedDay(null);
    setPage(1);
  };

  const confirmedMonthly = useMemo(() => monthlyTxs.filter((t: ApiTx) => t.status === "CONFIRMED"), [monthlyTxs]);
  const reviewItems = useMemo(() => monthlyTxs.filter((t: ApiTx) => t.status === "NEEDS_REVIEW"), [monthlyTxs]);
  const categories = useMemo(
    () => categoryOptions([...monthlyTxs.map((t: ApiTx) => t.category), ...budgets.map((b) => b.categoryName)]),
    [monthlyTxs, budgets],
  );

  // ---------- Actions (throwing lets dialogs show the error and stay open) ----------

  const saveAccount = (account: AccountLike | null) => async (name: string, balance: number) => {
    if (account) await updateAccount(account.id, { name, balance });
    else await createAccount(name, "BANK", balance);
    await loadData();
    notify(account ? "Rekening diperbarui" : "Rekening ditambahkan");
  };

  const askDeleteAccount = (account: AccountLike) =>
    setDialog({
      kind: "confirm",
      title: `Hapus rekening ${account.name}?`,
      description: "Rekening yang masih memiliki transaksi tidak bisa dihapus. Hapus transaksinya terlebih dahulu.",
      confirmLabel: "Hapus rekening",
      action: async () => {
        await deleteAccount(account.id);
        await loadData();
        notify("Rekening dihapus");
      },
    });

  const saveTransaction = (tx: TransactionLike | null) => async (data: TransactionInput) => {
    if (tx) await updateTransaction(tx.id, data);
    else await createTransaction(data);
    await loadData();
    notify(tx ? "Transaksi diperbarui" : "Transaksi ditambahkan");
  };

  const askDeleteTransaction = (tx: { id: string; amount: number; category: string; subcategory?: string | null }) =>
    setDialog({
      kind: "confirm",
      title: "Hapus transaksi?",
      description: `${tx.subcategory || categoryLabel(tx.category)} sebesar ${formatRupiah(tx.amount)} akan dihapus dan saldo rekening dikembalikan.`,
      confirmLabel: "Hapus",
      action: async () => {
        await deleteTransaction(tx.id);
        await loadData();
        notify("Transaksi dihapus");
      },
    });

  const askDeleteAllReview = () =>
    setDialog({
      kind: "confirm",
      title: `Hapus ${reviewItems.length} transaksi yang perlu ditinjau?`,
      description: "Transaksi ini belum memengaruhi saldo. Tindakan ini tidak bisa dibatalkan.",
      confirmLabel: "Hapus semua",
      action: async () => {
        for (const t of reviewItems) await deleteTransaction(t.id);
        await loadData();
        notify("Semua transaksi yang perlu ditinjau dihapus");
      },
    });

  const confirmReview = async (tx: ReviewTx) => {
    try {
      await confirmTransaction(tx.id);
      await loadData();
      notify("Transaksi dikonfirmasi, saldo diperbarui");
    } catch {
      notify("Gagal mengonfirmasi. Coba lagi.");
    }
  };

  const saveBudget = async (category: string, limitValue: number) => {
    await setBudget(category, limitValue);
    await loadData();
    notify("Anggaran disimpan");
  };

  const askDeleteBudget = (budget: BudgetLike) =>
    setDialog({
      kind: "confirm",
      title: `Hapus anggaran ${categoryLabel(budget.categoryName)}?`,
      description: "Transaksi tidak ikut terhapus.",
      confirmLabel: "Hapus anggaran",
      action: async () => {
        await deleteBudget(budget.id);
        await loadData();
        notify("Anggaran dihapus");
      },
    });

  const statusProps = {
    email: user.email,
    phoneNumber: phoneStatus?.phoneNumber ?? null,
    isAdmin: waStatus?.canManage ?? user.isAdmin,
    botConnected: waStatus ? waStatus.connected : null,
    botStopped: waStatus?.state === "stopped",
    onPhoneClick: () => setDialog({ kind: "link" }),
    onBotClick: () => setDialog({ kind: "bot" }),
    onLogout,
  };

  const addActions = {
    onAddTransaction: () => setDialog({ kind: "transaction", tx: null }),
    onAddAccount: () => setDialog({ kind: "account", account: null }),
    onAddBudget: () => setDialog({ kind: "budget", budget: null }),
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:shadow">
        Lewati ke konten
      </a>

      <Sidebar active={activeTab} onNavigate={navigate} reviewCount={reviewItems.length} {...statusProps} />

      <div className="md:pl-60">
        {/* Phone top bar */}
        <div className="flex items-center justify-between border-b border-border/70 bg-card px-4 py-2 md:hidden">
          <span className="font-heading text-base font-semibold tracking-tight">WhatsMonTrack</span>
          <MobileAccountMenu {...statusProps} />
        </div>

        <main id="main" className="mx-auto w-full max-w-6xl px-4 pt-6 pb-28 sm:px-6 md:pt-8 md:pb-12">
          <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">{PAGE_TITLES[activeTab]}</h1>
            <div className="flex flex-wrap items-center gap-2">
              {/* The chat is not tied to a month */}
              {activeTab !== "chat" && <MonthSwitcher month={month} year={year} onChange={changeMonth} />}
              <AddMenu {...addActions} />
            </div>
          </header>

          {loadError && loaded && (
            <div role="alert" className="mb-6 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              Gagal memuat data terbaru. Kami akan mencoba lagi otomatis.
            </div>
          )}

          {activeTab === "chat" ? (
            // Loads its own history; recording refreshes balances and the review badge
            <ChatView
              onRecorded={loadData}
              onAskClear={(clear) =>
                setDialog({
                  kind: "confirm",
                  title: "Hapus riwayat chat?",
                  description: "Semua pesan di chat ini dihapus. Transaksi yang sudah tercatat tetap ada.",
                  confirmLabel: "Hapus riwayat",
                  action: async () => {
                    await clear();
                    notify("Riwayat chat dihapus");
                  },
                })}
            />
          ) : !loaded || monthPending ? (
            <PageSkeleton tab={activeTab} />
          ) : activeTab === "dashboard" ? (
            <HomeView
              monthlyTxs={monthlyTxs}
              accounts={accounts}
              budgets={budgets}
              month={month}
              year={year}
              phoneLinked={!!phoneStatus?.phoneNumber}
              onEditAccount={(account) => setDialog({ kind: "account", account })}
              onEditBudget={(budget) => setDialog({ kind: "budget", budget })}
              onLinkPhone={() => setDialog({ kind: "link" })}
              {...addActions}
            />
          ) : activeTab === "transactions" ? (
            <LedgerView
              month={month}
              year={year}
              monthlyTxs={confirmedMonthly as LedgerTx[]}
              pageTxs={pageTxs as LedgerTx[]}
              listLoading={listPending}
              selectedDay={selectedDay}
              onSelectDay={(d) => { setSelectedDay(d); setPage(1); }}
              page={page}
              totalPages={totalPages}
              limit={limit}
              onPageChange={setPage}
              onLimitChange={(l) => { setLimit(l); setPage(1); }}
              onAdd={addActions.onAddTransaction}
              onEdit={(tx) => setDialog({ kind: "transaction", tx: tx as unknown as TransactionLike })}
              onDelete={askDeleteTransaction}
            />
          ) : (
            <InboxView
              items={reviewItems as ReviewTx[]}
              onConfirm={confirmReview}
              onEdit={(tx) => setDialog({ kind: "transaction", tx: tx as unknown as TransactionLike })}
              onDelete={askDeleteTransaction}
              onDeleteAll={askDeleteAllReview}
            />
          )}
        </main>
      </div>

      <BottomTabs active={activeTab} onNavigate={navigate} reviewCount={reviewItems.length} />

      {/* Feedback after actions */}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 md:bottom-6 md:pl-60">
        {toast && (
          <div role="status" className="rounded-xl bg-foreground px-4 py-2.5 text-sm text-background shadow-lg">{toast}</div>
        )}
      </div>

      {/* Dialogs (mounted only while open, so their fields always start fresh) */}
      {dialog.kind === "account" && (
        <AccountDialog
          account={dialog.account}
          onClose={closeDialog}
          onSave={saveAccount(dialog.account)}
          onDelete={dialog.account ? () => askDeleteAccount(dialog.account!) : undefined}
        />
      )}
      {dialog.kind === "transaction" && (
        <TransactionDialog
          transaction={dialog.tx}
          accounts={accounts}
          categories={categories}
          onClose={closeDialog}
          onSave={saveTransaction(dialog.tx)}
          onAddAccount={() => setDialog({ kind: "account", account: null })}
        />
      )}
      {dialog.kind === "budget" && (
        <BudgetDialog
          budget={dialog.budget}
          categories={categories}
          onClose={closeDialog}
          onSave={saveBudget}
          onDelete={dialog.budget ? () => askDeleteBudget(dialog.budget!) : undefined}
        />
      )}
      {dialog.kind === "confirm" && (
        <ConfirmDialog
          open
          title={dialog.title}
          description={dialog.description}
          confirmLabel={dialog.confirmLabel}
          onConfirm={dialog.action}
          onClose={closeDialog}
        />
      )}
      {dialog.kind === "link" && (
        <LinkWhatsAppModal isOpen onClose={closeDialog} status={phoneStatus} onChanged={loadData} />
      )}
      {dialog.kind === "bot" && (
        <WhatsAppStatusModal onClose={closeDialog} status={waStatus} onChanged={loadData} />
      )}
    </div>
  );
}
