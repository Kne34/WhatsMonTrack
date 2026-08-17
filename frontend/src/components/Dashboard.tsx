"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchTransactions, fetchAccounts, confirmTransaction, createAccount, updateTransaction } from "@/lib/api";

import DashboardHeader from "./dashboard/shared/DashboardHeader";
import BottomNav from "./dashboard/shared/BottomNav";
import HomeView from "./dashboard/views/HomeView";
import LedgerView from "./dashboard/views/LedgerView";
import InboxView from "./dashboard/views/InboxView";
import AddAccountModal from "./dashboard/modals/AddAccountModal";
import EditTransactionModal from "./dashboard/modals/EditTransactionModal";

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

  const loadData = async () => {
    try {
      const [monthlyData, tableData, accs] = await Promise.all([
        fetchTransactions(undefined, { month: selectedMonth, year: selectedYear, page: 1, limit: 1000 }),
        fetchTransactions(undefined, { month: selectedMonth, year: selectedYear, day: selectedDay || undefined, page, limit }),
        fetchAccounts()
      ]);
      setMonthlyTxs(monthlyData.data || monthlyData);
      setTableTxs(tableData.data || tableData);
      setTotalPages(tableData.totalPages || 1);
      setAccounts(accs);
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

  // Derive data from MONTHLY transactions for Analytics, Inbox, and Calendar
  const monthlyConfirmedTxs = monthlyTxs.filter(t => t.status === "CONFIRMED");
  const needsReviewTxs = monthlyTxs.filter(t => t.status === "NEEDS_REVIEW");
  
  // Derive table transactions from TABLE data
  const tableConfirmedTxs = tableTxs.filter(t => t.status === "CONFIRMED");

  const totalBalance = accounts.reduce((acc, a) => acc + a.balance, 0);

  const expenseData = monthlyTxs
    .filter(t => t.type === 'EXPENSE')
    .reduce((acc, t) => {
      const cat = t.category || 'UNCATEGORIZED';
      const existing = acc.find((x: any) => x.name === cat);
      if (existing) existing.value += t.amount;
      else acc.push({ name: cat, value: t.amount });
      return acc;
    }, [] as any[])
    .sort((a: any, b: any) => b.value - a.value);

  const incomeData = monthlyTxs
    .filter(t => t.type === 'INCOME')
    .reduce((acc, t) => {
      const cat = t.category || 'UNCATEGORIZED';
      const existing = acc.find((x: any) => x.name === cat);
      if (existing) existing.value += t.amount;
      else acc.push({ name: cat, value: t.amount });
      return acc;
    }, [] as any[])
    .sort((a: any, b: any) => b.value - a.value);

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
      />

      <main className="flex-1 overflow-y-auto px-6 pb-28">
        {activeTab === "dashboard" && (
          <HomeView 
            totalBalance={totalBalance} 
            accounts={accounts} 
            expenseData={expenseData} 
            incomeData={incomeData} 
            formatRupiah={formatRupiah} 
          />
        )}

        {activeTab === "inbox" && (
          <InboxView 
            needsReviewTxs={needsReviewTxs} 
            handleConfirm={handleConfirm} 
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
            formatRupiah={formatRupiah}
          />
        )}
      </main>

      <BottomNav 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        needsReviewCount={needsReviewTxs.length} 
      />

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
    </div>
  );
}
