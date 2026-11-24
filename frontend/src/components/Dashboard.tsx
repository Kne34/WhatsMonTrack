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
import { ALL_TABS, AddMenu, BottomTabs, MonthSwitcher, SettingsButton, Sidebar, setSidebarCollapsed, useSidebarCollapsed, type Tab } from "./dashboard/shared/Navigation";
import SettingsView from "./dashboard/views/SettingsView";
import { tr } from "@/lib/i18n";
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

/** Indonesian sources, shown through tr() */
const PAGE_TITLES: Record<Tab, string> = { dashboard: "Dashboard", transactions: "Transaksi", debts: "Utang-piutang", investments: "Investasi", chart: "Chart", chat: "Chat", inbox: "Perlu ditinjau", settings: "Pengaturan" };
const REFRESH_MS = 15_000;
/** Live prices on the Investasi page and in "Saldo total"; the server shares one 10-second cache between everyone */
const PRICES_REFRESH_MS = 10_000;

export default function Dashboard({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  useKeyboardOpen();
  const tabParam = searchParams.get("tab") as Tab | null;
  const activeTab: Tab = tabParam && ALL_TABS.includes(tabParam) ? tabParam : "dashboard";
  const navigate = (tab: Tab) => router.push(`/?tab=${tab}`);
  /** The Chart page (like TradingView), its own item in the sidebar: /?tab=chart&id=<holding> (no id: the last one viewed) */
  const chartId = activeTab === "chart" ? searchParams.get("id") : null;
  const openChart = (h: Holding) => router.push(`/?tab=chart&id=${h.id}`);
  const selectChart = useCallback((h: Holding) => router.replace(`/?tab=chart&id=${h.id}`), [router]);
  // The first chart page lived at /?tab=investments&chart=<id>
  const legacyChart = activeTab === "investments" ? searchParams.get("chart") : null;
  useEffect(() => {
    if (legacyChart) router.replace(`/?tab=chart&id=${legacyChart}`);
  }, [legacyChart, router]);

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
  const livePrices = activeTab === "investments" || activeTab === "chart" || activeTab === "dashboard";
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
    notify(holding ? tr("{symbol} diperbarui", { symbol: holding.symbol }) : tr("{toUpperCase} ditambahkan", { toUpperCase: input.symbol.toUpperCase() }));
  };
  const saveTrade = (holding: Holding) => async (input: Parameters<typeof addTrade>[1]) => {
    await addTrade(holding.id, input);
    await loadHoldings();
    notify(tr("{v} {symbol} dicatat", { v: input.side === "BUY" ? tr("Pembelian") : tr("Penjualan"), symbol: holding.symbol }));
  };
  const askDeleteHolding = (holding: Holding) =>
    setDialog({
      kind: "confirm",
      title: tr("Hapus {symbol} di {platform}?", { symbol: holding.symbol, platform: holding.platform }),
      description: tr("Aset ini dan seluruh riwayat beli/jualnya dihapus. Saldo rekening tidak berubah."),
      confirmLabel: tr("Hapus aset"),
      action: async () => {
        await deleteHolding(holding.id);
        if (chartId === holding.id) router.replace("/?tab=chart");
        await loadHoldings();
        notify(tr("{symbol} dihapus", { symbol: holding.symbol }));
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
    notify(account ? tr("Rekening diperbarui") : tr("Rekening ditambahkan"));
  };

  /** Asks first; an account that transactions or Utang-piutang records use can only go together with all of them. */
  const askDeleteAccount = (
    account: AccountLike,
    transactionCount = account.transactionCount ?? 0,
    debtCount = account.debtCount ?? 0,
  ) => {
    if (transactionCount > 0 || debtCount > 0) {
      const parts = [
        transactionCount > 0 ? tr("{transactionCount} transaksi", { transactionCount: transactionCount }) : null,
        debtCount > 0 ? tr("{debtCount} catatan utang-piutang", { debtCount: debtCount }) : null,
      ].filter(Boolean).join(tr(" dan "));
      setDialog({
        kind: "confirm",
        title: tr("Hapus rekening {name} beserta {parts}?", { name: account.name, parts: parts }),
        description: [
          tr("Rekening ini dipakai {parts}. Semuanya ikut dihapus.", { parts: parts }),
          transactionCount > 0 ? tr("Untuk transfer dari atau ke rekening lain, saldo rekening tersebut ikut dikembalikan.") : "",
          debtCount > 0 ? tr("Catatan utang-piutang dihapus utuh: pembayaran yang masuk ke rekening lain juga dibatalkan dari saldonya, dan pengeluaran yang sudah dicatat ke laporan ikut hilang.") : "",
          tr("Tindakan ini tidak bisa dibatalkan."),
        ].filter(Boolean).join(" "),
        confirmLabel: tr("Hapus rekening & {parts}", { parts: parts }),
        action: async () => {
          const res = await deleteAccount(account.id, true);
          await Promise.all([loadData(), res.deletedDebts > 0 ? loadDebts() : null]);
          const done = [
            res.deletedTransactions > 0 ? tr("{deletedTransactions} transaksi", { deletedTransactions: res.deletedTransactions }) : null,
            res.deletedDebts > 0 ? tr("{deletedDebts} catatan utang-piutang", { deletedDebts: res.deletedDebts }) : null,
          ].filter(Boolean).join(tr(" dan "));
          notify(done ? tr("Rekening {name} dan {done} dihapus", { name: account.name, done: done }) : tr("Rekening {name} dihapus", { name: account.name }));
        },
      });
      return;
    }
    setDialog({
      kind: "confirm",
      title: tr("Hapus rekening {name}?", { name: account.name }),
      description: tr("Rekening ini belum dipakai transaksi apa pun."),
      confirmLabel: tr("Hapus rekening"),
      action: async () => {
        try {
          await deleteAccount(account.id);
        } catch (err) {
          // Transactions or records were added since the list was loaded: offer to delete them too
          const count = (err as { response?: { status?: number; data?: { transactionCount?: number; debtCount?: number } } }).response;
          if (count?.status === 409 && (count.data?.transactionCount || count.data?.debtCount)) {
            askDeleteAccount(account, count.data.transactionCount ?? 0, count.data.debtCount ?? 0);
            await loadData();
          }
          throw err;
        }
        await loadData();
        notify(tr("Rekening dihapus"));
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
    await afterDebtChange(record ? tr("Catatan diperbarui") : input.type === "RECEIVABLE" ? tr("Talangan dicatat, saldo sudah dikurangi") : tr("Utang dicatat"));
  };
  const savePayment = (record: DebtRecord, participant: DebtParticipant) => async (input: { amount: number; accountId: string; paidAt: string }) => {
    await payDebtParticipant(record.id, participant.id, input);
    await afterDebtChange(tr("{personName}: {amount} dicatat", { personName: participant.personName, amount: formatRupiah(input.amount) }));
  };
  const unpay = (record: DebtRecord, participant: DebtParticipant) =>
    setDialog({
      kind: "confirm",
      title: tr("Batalkan pembayaran {personName}?", { personName: participant.personName }),
      description: tr("{paidAmount} dikembalikan dari saldo {v}.", { paidAmount: formatRupiah(participant.paidAmount), v: participant.paidAccount?.name ?? tr("rekeningnya") }),
      confirmLabel: tr("Batalkan pembayaran"),
      action: async () => {
        await unpayDebtParticipant(record.id, participant.id);
        await afterDebtChange(tr("Pembayaran {personName} dibatalkan", { personName: participant.personName }));
      },
    });
  const askDeleteDebt = (record: DebtRecord) =>
    setDialog({
      kind: "confirm",
      title: tr("Hapus \"{title}\"?", { title: record.title }),
      description: record.status === "OPEN"
        ? tr("Semua pergerakan saldonya dibatalkan: talangan dan pembayaran dikembalikan ke rekening masing-masing.")
        : tr("Semua pergerakan saldonya dibatalkan: talangan dan pembayaran dikembalikan ke rekening masing-masing, dan pengeluaran atau pemasukan yang dicatat saat diselesaikan ikut dihapus dari laporan."),
      confirmLabel: tr("Hapus catatan"),
      action: async () => {
        await deleteDebt(record.id);
        await afterDebtChange(tr("Catatan dihapus, saldo dikembalikan"));
      },
    });
  const settle = (record: DebtRecord) => async (input: { recordExcessAsIncome?: boolean; recordExpense?: boolean }) => {
    const done = await settleDebt(record.id, input);
    await afterDebtChange(done.linkedTransactionId ? tr("Selesai, dicatat ke laporan") : tr("Selesai"));
  };
  const askReopen = (record: DebtRecord) =>
    setDialog({
      kind: "confirm",
      title: tr("Buka kembali \"{title}\"?", { title: record.title }),
      description: tr("Pengeluaran/pemasukan yang dicatat saat selesai dihapus dari laporan. Saldo rekening tidak berubah."),
      confirmLabel: tr("Buka kembali"),
      destructive: false,
      action: async () => {
        await reopenDebt(record.id);
        await afterDebtChange(tr("Catatan dibuka kembali"));
      },
    });

  const saveTransaction = (tx: TransactionLike | null) => async (data: TransactionInput) => {
    if (tx) await updateTransaction(tx.id, data);
    else await createTransaction(data);
    await loadData();
    notify(tx ? tr("Transaksi diperbarui") : tr("Transaksi ditambahkan"));
  };

  const askDeleteTransaction = (tx: { id: string; amount: number; category: string; subcategory?: string | null }) =>
    setDialog({
      kind: "confirm",
      title: tr("Hapus transaksi?"),
      description: tr("{v} sebesar {amount} akan dihapus dan saldo rekening dikembalikan.", { v: tx.subcategory || categoryLabel(tx.category), amount: formatRupiah(tx.amount) }),
      confirmLabel: tr("Hapus"),
      action: async () => {
        await deleteTransaction(tx.id);
        await loadData();
        notify(tr("Transaksi dihapus"));
      },
    });

  const askDeleteAllReview = () =>
    setDialog({
      kind: "confirm",
      title: tr("Hapus {length} transaksi yang perlu ditinjau?", { length: reviewItems.length }),
      description: tr("Transaksi ini belum memengaruhi saldo. Tindakan ini tidak bisa dibatalkan."),
      confirmLabel: tr("Hapus semua"),
      action: async () => {
        for (const t of reviewItems) await deleteTransaction(t.id);
        await loadData();
        notify(tr("Semua transaksi yang perlu ditinjau dihapus"));
      },
    });

  const confirmReview = async (tx: ReviewTx) => {
    try {
      await confirmTransaction(tx.id);
      await loadData();
      notify(tr("Transaksi dikonfirmasi, saldo diperbarui"));
    } catch {
      notify(tr("Gagal mengonfirmasi. Coba lagi."));
    }
  };

  const saveBudget = async (category: string, limitValue: number) => {
    await setBudget(category, limitValue);
    await loadData();
    notify(tr("Anggaran disimpan"));
  };

  const askDeleteBudget = (budget: BudgetLike) =>
    setDialog({
      kind: "confirm",
      title: tr("Hapus anggaran {categoryName}?", { categoryName: categoryLabel(budget.categoryName) }),
      description: tr("Transaksi tidak ikut terhapus."),
      confirmLabel: tr("Hapus anggaran"),
      action: async () => {
        await deleteBudget(budget.id);
        await loadData();
        notify(tr("Anggaran dihapus"));
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

  // The sidebar collapses to icons or expands with names; the chart page remembers its own choice
  const sidebarKind = activeTab === "chart" ? "chart" : "normal";
  const sidebarCollapsed = useSidebarCollapsed(sidebarKind);
  const contentPad = sidebarCollapsed ? "md:pl-16" : "md:pl-60";
  const settingsAlert = statusProps.isAdmin && (statusProps.botConnected === false || statusProps.botStopped) ? tr("Bot WhatsApp offline") : null;
  const sidebar = (
    <Sidebar
      active={activeTab}
      onNavigate={navigate}
      reviewCount={reviewItems.length}
      collapsed={sidebarCollapsed}
      onToggle={() => setSidebarCollapsed(sidebarKind, !sidebarCollapsed)}
      settingsAlert={settingsAlert}
    />
  );

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
      {activeTab === "chart" ? (
        // The chart needs the width: the sidebar starts as icons here
        <>
          {sidebar}
          <div className={cn("transition-[padding] duration-200 motion-reduce:transition-none", contentPad)}>
            <ChartPage
              holdings={holdings}
              prices={prices}
              holdingId={chartId}
              onBack={() => navigate("investments")}
              // replace: switching assets shouldn't fill the back button's history
              onSelect={selectChart}
              onTrade={(h, side) => setDialog({ kind: "trade", holding: h, side })}
              onEdit={(h) => setDialog({ kind: "holding", holding: h })}
              onAdd={addActions.onAddInvestment}
            />
          </div>
        </>
      ) : (
        <>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:shadow">
          {tr("Lewati ke konten")}
        </a>

        {sidebar}

        <div className={cn("transition-[padding] duration-200 motion-reduce:transition-none", contentPad)}>
          {/* Phone top bar */}
          <div className="sticky top-0 z-20 flex h-12 items-center justify-between border-b border-black/[0.08] bg-[#F9F9F9]/80 px-4 backdrop-blur-2xl backdrop-saturate-150 md:hidden dark:border-white/[0.08] dark:bg-[#1C1C1E]/80">
            <span className="font-heading text-[17px] font-semibold tracking-tight">{tr("WhatsMonTrack")}</span>
            {activeTab !== "settings" && <SettingsButton onClick={() => navigate("settings")} alert={settingsAlert} />}
          </div>

          <main id="main" className="mx-auto w-full max-w-6xl px-4 pt-6 pb-28 sm:px-6 md:pt-8 md:pb-12">
            {/* On phones the chat fills the screen like a messaging app, without the page title */}
            <header className={cn("mb-6 flex flex-wrap items-center justify-between gap-3", activeTab === "chat" && "max-md:hidden")}>
              {/* A large title, as at the top of an iOS screen */}
              <h1 className="font-heading text-[28px] font-bold leading-tight tracking-[-0.02em] md:text-[32px]">{tr(PAGE_TITLES[activeTab])}</h1>
              {/* Phones: month switcher left, add button right (its menu opens leftwards and stays on screen) */}
              {/* Pages not tied to a month have no switcher: the add button then sits next to the title */}
              {activeTab !== "settings" && (
                <div className={cn("flex items-center justify-between gap-2 sm:w-auto sm:justify-end", monthly && "w-full")}>
                  {monthly && <MonthSwitcher month={month} year={year} onChange={changeMonth} />}
                  <AddMenu {...addActions} />
                </div>
              )}
            </header>

            {loadError && loaded && (
              <div role="alert" className="mb-6 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {tr("Gagal memuat data terbaru. Kami akan mencoba lagi otomatis.")}
              </div>
            )}

            {activeTab === "settings" ? (
              <SettingsView {...statusProps} notify={notify} />
            ) : activeTab === "chat" ? (
              // Loads its own history; recording refreshes balances and the review badge
              <ChatView
                onRecorded={loadData}
                onAskClear={(clear) =>
                  setDialog({
                    kind: "confirm",
                    title: tr("Hapus riwayat chat?"),
                    description: tr("Semua pesan di chat ini dihapus. Transaksi yang sudah tercatat tetap ada."),
                    confirmLabel: tr("Hapus riwayat"),
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
      <div aria-live="polite" className={cn("pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 md:bottom-6", contentPad)}>
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
