"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchTransactions, fetchAccounts, confirmTransaction, createAccount, updateTransaction, fetchBudgets, setBudget, createTransaction, deleteTransaction, updateAccount, deleteAccount, deleteBudget, fetchWhatsAppStatus } from "@/lib/api";

import DashboardHeader from "./dashboard/shared/DashboardHeader";
import BottomNav from "./dashboard/shared/BottomNav";
import HomeView from "./dashboard/views/HomeView";
import LedgerView from "./dashboard/views/LedgerView";
import InboxView from "./dashboard/views/InboxView";
import AddAccountModal from "./dashboard/modals/AddAccountModal";
import EditTransactionModal from "./dashboard/modals/EditTransactionModal";
import EditAccountModal from "./dashboard/modals/EditAccountModal";
import SetBudgetModal from "./dashboard/modals/SetBudgetModal";
import AddTransactionModal from "./dashboard/modals/AddTransactionModal";
import ConfirmModal from "./dashboard/modals/ConfirmModal";
import AlertModal from "./dashboard/modals/AlertModal";
import WhatsAppStatusModal from "./dashboard/modals/WhatsAppStatusModal";
import FloatingActionMenu from "./dashboard/shared/FloatingActionMenu";

export default function Dashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') || 'dashboard';

  const setActiveTab = (tab: string) => {
    router.push(`/?tab=${tab}`);
  };

  const [monthlyTxs, setMonthlyTxs] = useState<any[]>([]);
  const [tableTxs, setTableTxs] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [waStatus, setWaStatus] = useState<{ connected: boolean; qr: string } | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters and Pagination
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [totalPages, setTotalPages] = useState(1);

  // Add Account State
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountBalance, setNewAccountBalance] = useState("");
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);

  // Edit Transaction State
  const [editingTx, setEditingTx] = useState<any>(null);
  const [editTxData, setEditTxData] = useState<any>({});
  const [isEditTxOpen, setIsEditTxOpen] = useState(false);

  // Edit Account State
  const [accountToEdit, setAccountToEdit] = useState<any>(null);
  const [isEditAccountOpen, setIsEditAccountOpen] = useState(false);

  // Budget State
  const [budgetToEdit, setBudgetToEdit] = useState<any>(null);
  const [isSetBudgetOpen, setIsSetBudgetOpen] = useState(false);
  const [isAddTxOpen, setIsAddTxOpen] = useState(false);

  // Global Confirm/Alert State
  const [confirmState, setConfirmState] = useState<{isOpen: boolean, txId: string, type?: 'single' | 'inbox'}>({isOpen: false, txId: '', type: 'single'});
  const [alertState, setAlertState] = useState<{isOpen: boolean, message: string}>({isOpen: false, message: ''});

  // WA Status Modal
  const [isWaModalOpen, setIsWaModalOpen] = useState(false);

  const loadData = async () => {
    try {
      const [monthlyData, tableData, accs, budgs, wa] = await Promise.all([
        fetchTransactions(undefined, { month: selectedMonth, year: selectedYear, page: 1, limit: 1000 }),
        fetchTransactions(undefined, { month: selectedMonth, year: selectedYear, day: selectedDay || undefined, page, limit }),
        fetchAccounts(),
        fetchBudgets(),
        fetchWhatsAppStatus().catch(() => null)
      ]);
      setMonthlyTxs(monthlyData.data || monthlyData);
      setTableTxs(tableData.data || tableData);
      setTotalPages(tableData.totalPages || 1);
      setAccounts(accs);
      setBudgets(budgs);
      if (wa) setWaStatus(wa);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [selectedMonth, selectedYear, selectedDay, page, limit]);

  useEffect(() => {
    setSelectedDay(null);
    setPage(1);
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    const handleOpenBudget = () => { setBudgetToEdit(null); setIsSetBudgetOpen(true); };
    const handleOpenAddTx = () => setIsAddTxOpen(true);
    const handleOpenAddAcc = () => setIsAddAccountOpen(true);
    
    document.addEventListener('openSetBudgetModal', handleOpenBudget);
    document.addEventListener('openAddTransactionModal', handleOpenAddTx);
    document.addEventListener('openAddAccountModal', handleOpenAddAcc);
    
    return () => {
      document.removeEventListener('openSetBudgetModal', handleOpenBudget);
      document.removeEventListener('openAddTransactionModal', handleOpenAddTx);
      document.removeEventListener('openAddAccountModal', handleOpenAddAcc);
    };
  }, []);

  const handleConfirm = async (id: string) => {
    await confirmTransaction(id);
    loadData();
  };

  const handleAddAccount = async () => {
    try {
      await createAccount(newAccountName, "BANK", Number(newAccountBalance));
      setNewAccountName("");
      setNewAccountBalance("");
      setIsAddAccountOpen(false);
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleEditAccountClick = (acc: any) => {
    setAccountToEdit(acc);
    setIsEditAccountOpen(true);
  };

  const handleUpdateAccount = async (id: string, name: string, balance: number) => {
    try {
      await updateAccount(id, { name, balance });
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteAccount = async (id: string) => {
    try {
      await deleteAccount(id);
      loadData();
    } catch (e: any) {
      setAlertState({
        isOpen: true,
        message: e.response?.data?.message || 'Failed to delete account. Ensure it has no transactions.'
      });
    }
  };

  const handleEditBudgetClick = (budget: any) => {
    setBudgetToEdit(budget);
    setIsSetBudgetOpen(true);
  };

  const handleEditClick = (tx: any) => {
    setEditingTx(tx);
    setEditTxData({
      type: tx.type,
      category: tx.category,
      subcategory: tx.subcategory || '',
      amount: tx.amount,
      fromAccountId: tx.fromAccountId || '',
      toAccountId: tx.toAccountId || ''
    });
    setIsEditTxOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingTx) return;
    try {
      await updateTransaction(editingTx.id, {
        ...editTxData,
        amount: Number(editTxData.amount),
        fromAccountId: editTxData.fromAccountId || null,
        toAccountId: editTxData.toAccountId || null
      });
      setIsEditTxOpen(false);
      setEditingTx(null);
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveBudget = async (cat: string, limit: number) => {
    try {
      await setBudget(cat, limit);
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteBudget = async (id: string) => {
    try {
      await deleteBudget(id);
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveNewTx = async (data: any) => {
    try {
      await createTransaction(data);
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteClick = (id: string) => {
    setConfirmState({ isOpen: true, txId: id, type: 'single' });
  };

  const handleDeleteAllInboxClick = () => {
    setConfirmState({ isOpen: true, txId: 'ALL_INBOX', type: 'inbox' });
  };

  const confirmDeleteTransaction = async () => {
    try {
      if (confirmState.type === 'inbox') {
        const needsReviewIds = needsReviewTxs.map(t => t.id);
        // Delete sequentially to avoid overwhelming the database/Prisma
        for (const id of needsReviewIds) {
          await deleteTransaction(id);
        }
      } else {
        await deleteTransaction(confirmState.txId);
      }
      setConfirmState({isOpen: false, txId: '', type: 'single'});
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  // Derive data from MONTHLY transactions for Analytics, Inbox, and Calendar
  const monthlyConfirmedTxs = monthlyTxs.filter(t => t.status === "CONFIRMED");
  const needsReviewTxs = monthlyTxs.filter(t => t.status === "NEEDS_REVIEW");

  // Derive table transactions from TABLE data
  const tableConfirmedTxs = tableTxs.filter(t => t.status === "CONFIRMED");

  const totalBalance = accounts.reduce((acc, a) => acc + a.balance, 0);

  const formatRupiah = (val: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(val);

  if (loading && monthlyTxs.length === 0) {
    return (
      <div className="flex flex-col h-screen bg-background items-center justify-center animate-pulse">
        <div className="w-12 h-12 rounded-full border-4 border-muted border-t-primary animate-spin mb-4"></div>
        <p className="text-muted-foreground font-mono text-sm">Syncing Ledger...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden font-sans antialiased">
      <DashboardHeader
        selectedMonth={selectedMonth}
        selectedYear={selectedYear}
        setSelectedMonth={setSelectedMonth}
        setSelectedYear={setSelectedYear}
        waStatus={waStatus}
        onWaStatusClick={() => setIsWaModalOpen(true)}
      />

      <main className="flex-1 overflow-y-auto px-6 pb-28">
        {activeTab === "dashboard" && (
          <HomeView
            monthlyTxs={monthlyTxs}
            budgets={budgets}
            selectedMonth={selectedMonth}
            selectedYear={selectedYear}
            totalBalance={totalBalance}
            accounts={accounts}
            formatRupiah={formatRupiah}
            onEditAccount={handleEditAccountClick}
            onEditBudget={handleEditBudgetClick}
          />
        )}

        {activeTab === "inbox" && (
          <InboxView
            needsReviewTxs={needsReviewTxs}
            handleConfirm={handleConfirm}
            handleEditClick={handleEditClick}
            handleDeleteClick={handleDeleteClick}
            handleDeleteAllClick={handleDeleteAllInboxClick}
            formatRupiah={formatRupiah}
          />
        )}

        {activeTab === "transactions" && (
          <LedgerView
            selectedMonth={selectedMonth}
            selectedYear={selectedYear}
            monthlyConfirmedTxs={monthlyConfirmedTxs}
            tableConfirmedTxs={tableConfirmedTxs}
            selectedDay={selectedDay}
            setSelectedDay={setSelectedDay}
            limit={limit}
            page={page}
            totalPages={totalPages}
            setLimit={setLimit}
            setPage={setPage}
            handleEditClick={handleEditClick}
            handleDeleteClick={handleDeleteClick}
            formatRupiah={formatRupiah}
          />
        )}
      </main>

      <BottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        needsReviewCount={needsReviewTxs.length}
      />

      <FloatingActionMenu />

      <AddAccountModal
        isOpen={isAddAccountOpen}
        setIsOpen={setIsAddAccountOpen}
        newAccountName={newAccountName}
        setNewAccountName={setNewAccountName}
        newAccountBalance={newAccountBalance}
        setNewAccountBalance={setNewAccountBalance}
        handleAddAccount={handleAddAccount}
      />

      <EditTransactionModal
        isOpen={isEditTxOpen}
        setIsOpen={setIsEditTxOpen}
        editTxData={editTxData}
        setEditTxData={setEditTxData}
        accounts={accounts}
        handleSaveEdit={handleSaveEdit}
      />

      <SetBudgetModal
        isOpen={isSetBudgetOpen}
        onClose={() => setIsSetBudgetOpen(false)}
        onSave={handleSaveBudget}
        initialBudget={budgetToEdit}
        onDelete={handleDeleteBudget}
      />

      <EditAccountModal
        isOpen={isEditAccountOpen}
        setIsOpen={setIsEditAccountOpen}
        account={accountToEdit}
        onSave={handleUpdateAccount}
        onDelete={handleDeleteAccount}
      />

      <AddTransactionModal
        isOpen={isAddTxOpen}
        onClose={() => setIsAddTxOpen(false)}
        onSave={handleSaveNewTx}
        accounts={accounts}
      />

      <ConfirmModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState({ isOpen: false, txId: '', type: 'single' })}
        onConfirm={confirmDeleteTransaction}
        title={confirmState.type === 'inbox' ? "Delete All Inbox Items" : "Delete Transaction"}
        description={confirmState.type === 'inbox' ? "Are you sure you want to delete all items in the inbox? This action cannot be undone." : "Are you sure you want to delete this transaction? This will reverse its balance impact."}
        confirmText="Delete"
      />

      <AlertModal
        isOpen={alertState.isOpen}
        onClose={() => setAlertState({ isOpen: false, message: '' })}
        title="Action Failed"
        description={alertState.message}
      />

      <WhatsAppStatusModal
        isOpen={isWaModalOpen}
        onClose={() => setIsWaModalOpen(false)}
        status={waStatus}
        onResetComplete={() => {
          // It will poll automatically, but we can fast-track a reload
          loadData();
        }}
      />
    </div>
  );
}
