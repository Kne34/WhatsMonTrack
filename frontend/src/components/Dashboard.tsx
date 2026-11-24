"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  confirmTransaction, createAccount, createDebt, createTransaction, deleteAccount, deleteBudget, deleteDebt, deleteTransaction,
  fetchAccounts, fetchBudgets, fetchDebtSummary, fetchDebts, fetchPhoneStatus, fetchTransactions, fetchWhatsAppStatus, payDebtParticipant,
  reopenDebt, setBudget, settleDebt, unpayDebtParticipant, updateAccount, updateDebt, updateTransaction,
  type DebtInput, type DebtParticipant, type DebtRecord, type DebtSummary, type DebtType, type PhoneStatus, type WhatsAppStatus,
  addTrade, createHolding, deleteHolding, fetchHoldings, fetchMarketPrices, updateHolding, type HoldingInput,
} from "@/lib/api";
import { currentPrice, portfolioValueIdr, type Holding, type MarketPrices, type TradeSide } from "@/lib/portfolio";
import { categoryLabel, formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useKeyboardOpen } from "@/lib/useKeyboardOpen";
import { filterParams, NO_FILTERS, type TxFilters } from "@/lib/txFilters";
import type { SessionUser } from "./AuthWrapper";
import { PageSkeleton } from "./dashboard/skeletons";
import { AddMenu, BottomTabs, MobileAccountMenu, MonthSwitcher, NAV_ITEMS, Sidebar, type Tab } from "./dashboard/shared/Navigation";
import HomeView from "./dashboard/views/HomeView";
import LedgerView, { type LedgerTx } from "./dashboard/views/LedgerView";
import DebtsView, { DEFAULT_DEBT_FILTERS, type DebtFilters } from "./dashboard/views/DebtsView";
import { DebtRecordDialog, PayDialog, SettleDialog } from "./dashboard/debtDialogs";
import InvestmentsView from "./dashboard/views/InvestmentsView";
import { InvestmentDialog, TradeDialog } from "./dashboard/investmentDialogs";
import { ChartPage } from "./dashboard/chart/ChartPage";
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
  | { kind: "debt"; record: DebtRecord | null; type?: DebtType }
  | { kind: "pay"; record: DebtRecord; participant: DebtParticipant }
  | { kind: "settle"; record: DebtRecord }
  | { kind: "holding"; holding: Holding | null }
  | { kind: "trade"; holding: Holding; side: TradeSide }
  | { kind: "budget"; budget: BudgetLike | null }
  | { kind: "confirm"; title: string; description: string; confirmLabel: string; action: () => Promise<void>; destructive?: boolean }
  | { kind: "link" }
  | { kind: "bot" };

const PAGE_TITLES: Record<Tab, string> = { dashboard: "Dashboard", transactions: "Transaksi", debts: "Utang-piutang", investments: "Investasi", chat: "Chat", inbox: "Perlu ditinjau" };
const REFRESH_MS = 15_000;
/** Live prices on the Investasi page and in "Saldo total"; the server shares one 10-second cache between everyone */
const PRICES_REFRESH_MS = 10_000;

export default function Dashboard({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  useKeyboardOpen();
  const tabParam = searchParams.get("tab") as Tab | null;
  const activeTab: Tab = NAV_ITEMS.some((n) => n.id === tabParam) ? (tabParam as Tab) : "dashboard";
  const navigate = (tab: Tab) => router.push(`/?tab=${tab}`);
  /** The chart page of one holding (full screen, like TradingView): /?tab=investments&chart=<id> */
  const chartId = activeTab === "investments" ? searchParams.get("chart") : null;
  const openChart = (h: Holding) => router.push(`/?tab=investments&chart=${h.id}`);

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
  // Has the user ever recorded a transaction (any month)? Once true it stays true, so it is asked only until then.
  const [hasAnyTransaction, setHasAnyTransaction] = useState(false);
  const knownHasTx = useRef(false);
  // Utang-piutang page data (with its filters), and the open totals for the Dashboard card
  const [debts, setDebts] = useState<{ records: DebtRecord[]; summary: DebtSummary } | null>(null);
  const [debtFilters, setDebtFilters] = useState<DebtFilters>(DEFAULT_DEBT_FILTERS);
  const [debtSummary, setDebtSummary] = useState<DebtSummary | null>(null);
  const [holdings, setHoldings] = useState<Holding[] | null>(null);
  const [prices, setPrices] = useState<MarketPrices | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // Filters the data on screen belongs to. While they differ from the selected filters,
  // the affected part shows a skeleton instead of the previous month's/page's data.
  // Transaksi page filters; `filterKey` identifies them in the request key below
  const [filters, setFilters] = useState<TxFilters>(NO_FILTERS);
  const filterKey = JSON.stringify(filterParams(filters));
  const [shown, setShown] = useState<{ month: number; year: number; day: number | null; page: number; limit: number; filterKey: string } | null>(null);
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
    const key = `${month}/${year}/${selectedDay}/${page}/${limit}/${filterKey}`;
    try {
      const [monthly, table, accs, budgs, wa, phone, any, debtData] = await Promise.all([
        fetchTransactions({ month, year, page: 1, limit: 1000 }),
        fetchTransactions({ month, year, day: selectedDay || undefined, page, limit, status: "CONFIRMED", ...JSON.parse(filterKey) }),
        fetchAccounts(),
        fetchBudgets(),
        fetchWhatsAppStatus().catch(() => null),
        fetchPhoneStatus().catch(() => null),
        knownHasTx.current ? null : fetchTransactions({ page: 1, limit: 1 }).catch(() => null),
        fetchDebtSummary().catch(() => null),
      ]);
      if (debtData) setDebtSummary(debtData);
      if (any && (any.total ?? (any.data ?? any).length) > 0) {
        knownHasTx.current = true;
        setHasAnyTransaction(true);
      }
      // A slower response for filters the user already left must not overwrite newer data
      if (key !== latestRequest.current) return;
      setShown({ month, year, day: selectedDay, page, limit, filterKey });
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
  }, [month, year, selectedDay, page, limit, filterKey]);

  useEffect(() => {
    latestRequest.current = `${month}/${year}/${selectedDay}/${page}/${limit}/${filterKey}`;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount/filter change, then poll
    loadData();
    const interval = setInterval(loadData, REFRESH_MS);
    const onFocus = () => loadData();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadData, month, year, selectedDay, page, limit, filterKey]);

  // ---------- Investasi: holdings, and live prices while the page (or the Dashboard, for "Saldo total") is open ----------
  const loadHoldings = useCallback(async () => {
    try {
      setHoldings(await fetchHoldings());
    } catch {
      setHoldings((h) => h ?? []);
    }
  }, []);
  const loadPrices = useCallback(async () => {
    try {
      setPrices(await fetchMarketPrices());
    } catch {
      // The next tick tries again; the page keeps the last prices meanwhile
    }
  }, []);
  const livePrices = activeTab === "investments" || activeTab === "dashboard";
  const hasHoldings = (holdings?.length ?? 0) > 0;
  useEffect(() => {
    if (!livePrices) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch when the page opens
    loadHoldings();
  }, [livePrices, loadHoldings]);
  useEffect(() => {
    // Nothing to price on the Dashboard without holdings; the Investasi page still shows the exchange rate
    if (!livePrices || (activeTab === "dashboard" && !hasHoldings)) return;
    const tick = () => {
      if (document.visibilityState === "visible") loadPrices();
    };
    tick();
    const interval = setInterval(tick, PRICES_REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [livePrices, activeTab, hasHoldings, loadPrices]);

  const saveHolding = (holding: Holding | null) => async (input: HoldingInput) => {
    if (holding) {
      const { name, platform, currency, quantity, avgPrice, coingeckoId, note } = input;
      await updateHolding(holding.id, { name, platform, currency, quantity, avgPrice, coingeckoId, note });
    } else {
      await createHolding(input);
    }
    await loadHoldings();
    // A new ticker needs its price
    if (!holding) loadPrices();
    notify(holding ? `${holding.symbol} diperbarui` : `${input.symbol.toUpperCase()} ditambahkan`);
  };
  const saveTrade = (holding: Holding) => async (input: Parameters<typeof addTrade>[1]) => {
    await addTrade(holding.id, input);
    await loadHoldings();
    notify(`${input.side === "BUY" ? "Pembelian" : "Penjualan"} ${holding.symbol} dicatat`);
  };
  const askDeleteHolding = (holding: Holding) =>
    setDialog({
      kind: "confirm",
      title: `Hapus ${holding.symbol} di ${holding.platform}?`,
      description: "Aset ini dan seluruh riwayat beli/jualnya dihapus. Saldo rekening tidak berubah.",
      confirmLabel: "Hapus aset",
      action: async () => {
        await deleteHolding(holding.id);
        if (chartId === holding.id) router.push("/?tab=investments");
        await loadHoldings();
        notify(`${holding.symbol} dihapus`);
      },
    });

  // Month/year changed: every page shows other data. Day/page/size changed: only the ledger list.
  const monthPending = !shown || shown.month !== month || shown.year !== year;
  const listPending = monthPending || shown.day !== selectedDay || shown.page !== page || shown.limit !== limit || shown.filterKey !== filterKey;

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

  /** Asks first; an account that transactions use can only go together with all of them. */
  const askDeleteAccount = (account: AccountLike, transactionCount = account.transactionCount ?? 0) => {
    if (transactionCount > 0) {
      setDialog({
        kind: "confirm",
        title: `Hapus rekening ${account.name} beserta transaksinya?`,
        description: `Rekening ini dipakai ${transactionCount} transaksi. Semuanya ikut dihapus. Untuk transfer dari atau ke rekening lain, saldo rekening tersebut ikut dikembalikan. Tindakan ini tidak bisa dibatalkan.`,
        confirmLabel: `Hapus rekening & ${transactionCount} transaksi`,
        action: async () => {
          const res = await deleteAccount(account.id, true);
          await loadData();
          notify(`Rekening ${account.name} dan ${res.deletedTransactions} transaksi dihapus`);
        },
      });
      return;
    }
    setDialog({
      kind: "confirm",
      title: `Hapus rekening ${account.name}?`,
      description: "Rekening ini belum dipakai transaksi apa pun.",
      confirmLabel: "Hapus rekening",
      action: async () => {
        try {
          await deleteAccount(account.id);
        } catch (err) {
          // Transactions were added since the list was loaded: offer to delete them too
          const count = (err as { response?: { status?: number; data?: { transactionCount?: number } } }).response;
          if (count?.status === 409 && count.data?.transactionCount) {
            askDeleteAccount(account, count.data.transactionCount);
            await loadData();
          }
          throw err;
        }
        await loadData();
        notify("Rekening dihapus");
      },
    });
  };

  // ---------- Utang-piutang ----------
  const debtQuery = JSON.stringify(debtFilters);
  const latestDebtQuery = useRef(debtQuery);
  const loadDebts = useCallback(async () => {
    const f: DebtFilters = JSON.parse(debtQuery);
    try {
      const data = await fetchDebts({ status: f.status, type: f.type || undefined, q: f.q.trim() || undefined });
      // A slower answer for filters the user already left must not overwrite newer data
      if (JSON.stringify(f) === latestDebtQuery.current) {
        setDebts(data);
        setDebtSummary(data.summary);
      }
    } catch {
      setDebts((d) => d ?? { records: [], summary: { receivable: 0, payable: 0, openCount: 0 } });
    }
  }, [debtQuery]);
  useEffect(() => {
    latestDebtQuery.current = debtQuery;
    if (activeTab !== "debts") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch when the page opens or the filters change, then poll
    loadDebts();
    const interval = setInterval(loadDebts, REFRESH_MS);
    return () => clearInterval(interval);
  }, [activeTab, debtQuery, loadDebts]);

  /** Every debt action moves balances: refresh the page and the accounts */
  const afterDebtChange = async (message: string) => {
    await Promise.all([loadDebts(), loadData()]);
    notify(message);
  };
  const saveDebt = (record: DebtRecord | null) => async (input: DebtInput) => {
    if (record) {
      const { type: _type, ...rest } = input;
      void _type;
      await updateDebt(record.id, rest);
    } else {
      await createDebt(input);
    }
    await afterDebtChange(record ? "Catatan diperbarui" : input.type === "RECEIVABLE" ? "Talangan dicatat, saldo sudah dikurangi" : "Utang dicatat");
  };
  const savePayment = (record: DebtRecord, participant: DebtParticipant) => async (input: { amount: number; accountId: string; paidAt: string }) => {
    await payDebtParticipant(record.id, participant.id, input);
    await afterDebtChange(`${participant.personName}: ${formatRupiah(input.amount)} dicatat`);
  };
  const unpay = (record: DebtRecord, participant: DebtParticipant) =>
    setDialog({
      kind: "confirm",
      title: `Batalkan pembayaran ${participant.personName}?`,
      description: `${formatRupiah(participant.paidAmount)} dikembalikan dari saldo ${participant.paidAccount?.name ?? "rekeningnya"}.`,
      confirmLabel: "Batalkan pembayaran",
      action: async () => {
        await unpayDebtParticipant(record.id, participant.id);
        await afterDebtChange(`Pembayaran ${participant.personName} dibatalkan`);
      },
    });
  const askDeleteDebt = (record: DebtRecord) =>
    setDialog({
      kind: "confirm",
      title: `Hapus "${record.title}"?`,
      description: "Semua pergerakan saldonya dibatalkan: talangan dan pembayaran dikembalikan ke rekening masing-masing.",
      confirmLabel: "Hapus catatan",
      action: async () => {
        await deleteDebt(record.id);
        await afterDebtChange("Catatan dihapus, saldo dikembalikan");
      },
    });
  const settle = (record: DebtRecord) => async (input: { recordExcessAsIncome?: boolean; recordExpense?: boolean }) => {
    const done = await settleDebt(record.id, input);
    await afterDebtChange(done.linkedTransactionId ? "Selesai, dicatat ke laporan" : "Selesai");
  };
  const askReopen = (record: DebtRecord) =>
    setDialog({
      kind: "confirm",
      title: `Buka kembali "${record.title}"?`,
      description: "Pengeluaran/pemasukan yang dicatat saat selesai dihapus dari laporan. Saldo rekening tidak berubah.",
      confirmLabel: "Buka kembali",
      destructive: false,
      action: async () => {
        await reopenDebt(record.id);
        await afterDebtChange("Catatan dibuka kembali");
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

  /** Pages that show one month at a time (with the month switcher) */
  const monthly = activeTab === "dashboard" || activeTab === "transactions" || activeTab === "inbox";

  const addActions = {
    onAddTransaction: () => setDialog({ kind: "transaction", tx: null }),
    onAddDebt: () => setDialog({ kind: "debt", record: null }),
    onAddInvestment: () => setDialog({ kind: "holding", holding: null }),
    onAddAccount: () => setDialog({ kind: "account", account: null }),
    onAddBudget: () => setDialog({ kind: "budget", budget: null }),
  };

  return (
    // Phones, Chat tab: exactly the visible screen (dvh, not 100vh which ignores the browser's address bar),
    // so nothing behind the full-screen chat can scroll the top bar away
    <div className={cn("min-h-screen bg-background text-foreground", activeTab === "chat" && "max-md:h-dvh max-md:min-h-0 max-md:overflow-hidden")}>
      {chartId ? (
        <ChartPage
          holdings={holdings}
          prices={prices}
          holdingId={chartId}
          onBack={() => navigate("investments")}
          // replace: switching assets shouldn't fill the back button's history
          onSelect={(h) => router.replace(`/?tab=investments&chart=${h.id}`)}
          onTrade={(h, side) => setDialog({ kind: "trade", holding: h, side })}
          onEdit={(h) => setDialog({ kind: "holding", holding: h })}
        />
      ) : (
        <>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:shadow">
          Lewati ke konten
        </a>

        <Sidebar active={activeTab} onNavigate={navigate} reviewCount={reviewItems.length} {...statusProps} />

        <div className="md:pl-60">
          {/* Phone top bar */}
          <div className="flex h-12 items-center justify-between border-b border-border/70 bg-card px-4 md:hidden">
            <span className="font-heading text-base font-semibold tracking-tight">WhatsMonTrack</span>
            <MobileAccountMenu {...statusProps} />
          </div>

          <main id="main" className="mx-auto w-full max-w-6xl px-4 pt-6 pb-28 sm:px-6 md:pt-8 md:pb-12">
            {/* On phones the chat fills the screen like a messaging app, without the page title */}
            <header className={cn("mb-6 flex flex-wrap items-center justify-between gap-3", activeTab === "chat" && "max-md:hidden")}>
              <h1 className="font-heading text-2xl font-semibold tracking-tight">{PAGE_TITLES[activeTab]}</h1>
              {/* Phones: month switcher left, add button right (its menu opens leftwards and stays on screen) */}
              {/* Pages not tied to a month have no switcher: the add button then sits next to the title */}
              <div className={cn("flex items-center justify-between gap-2 sm:w-auto sm:justify-end", monthly && "w-full")}>
                {monthly && <MonthSwitcher month={month} year={year} onChange={changeMonth} />}
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
            ) : activeTab === "investments" ? (
              // Not tied to a month; loads its own data (see loadHoldings/loadPrices)
              <InvestmentsView
                holdings={holdings}
                prices={prices}
                onOpen={openChart}
                onAdd={addActions.onAddInvestment}
                onEdit={(holding) => setDialog({ kind: "holding", holding })}
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
                hasAnyTransaction={hasAnyTransaction || monthlyTxs.length > 0}
                debtSummary={debtSummary}
                investmentValue={portfolioValueIdr(holdings, prices)}
                onOpenInvestments={() => navigate("investments")}
                onOpenDebts={() => navigate("debts")}
                onEditAccount={(account) => setDialog({ kind: "account", account })}
                onEditBudget={(budget) => setDialog({ kind: "budget", budget })}
                onLinkPhone={() => setDialog({ kind: "link" })}
                {...addActions}
              />
            ) : activeTab === "debts" ? (
              <DebtsView
                data={debts}
                filters={debtFilters}
                onFiltersChange={setDebtFilters}
                onAdd={() => setDialog({ kind: "debt", record: null, type: debtFilters.type || undefined })}
                onEdit={(record) => setDialog({ kind: "debt", record })}
                onDelete={askDeleteDebt}
                onPay={(record, participant) => setDialog({ kind: "pay", record, participant })}
                onUnpay={unpay}
                onSettle={(record) => setDialog({ kind: "settle", record })}
                onReopen={askReopen}
              />
            ) : activeTab === "transactions" ? (
              <LedgerView
                onOpenDebts={() => navigate("debts")}
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
                filters={filters}
                onFiltersChange={(f) => { setFilters(f); setPage(1); }}
                categories={categories}
                accounts={accounts}
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
        </>
      )}

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
      {dialog.kind === "debt" && (
        <DebtRecordDialog
          record={dialog.record}
          defaultType={dialog.type}
          accounts={accounts}
          onClose={closeDialog}
          onSave={saveDebt(dialog.record)}
          onDelete={dialog.record ? () => askDeleteDebt(dialog.record!) : undefined}
          onAddAccount={() => setDialog({ kind: "account", account: null })}
        />
      )}
      {dialog.kind === "pay" && (
        <PayDialog record={dialog.record} participant={dialog.participant} accounts={accounts} onClose={closeDialog}
          onSave={savePayment(dialog.record, dialog.participant)} />
      )}
      {dialog.kind === "settle" && <SettleDialog record={dialog.record} onClose={closeDialog} onConfirm={settle(dialog.record)} />}
      {dialog.kind === "holding" && (
        <InvestmentDialog
          holding={dialog.holding}
          platforms={[...new Set((holdings ?? []).map((h) => h.platform))]}
          onClose={closeDialog}
          onSave={saveHolding(dialog.holding)}
          onDelete={dialog.holding ? () => askDeleteHolding(dialog.holding!) : undefined}
        />
      )}
      {dialog.kind === "trade" && (
        <TradeDialog
          holding={dialog.holding}
          initialSide={dialog.side}
          livePrice={currentPrice(dialog.holding, prices?.prices[dialog.holding.priceKey], prices?.fx?.price ?? null)}
          onClose={closeDialog}
          onSave={saveTrade(dialog.holding)}
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
          key={dialog.title + dialog.confirmLabel}
          open
          title={dialog.title}
          description={dialog.description}
          confirmLabel={dialog.confirmLabel}
          onConfirm={dialog.action}
          onClose={closeDialog}
          destructive={dialog.destructive ?? true}
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
