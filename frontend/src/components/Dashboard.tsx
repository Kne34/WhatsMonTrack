"use client";

import React, { useEffect, useState } from "react";
import { fetchTransactions, fetchAccounts, confirmTransaction } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowDownIcon, ArrowUpIcon, Check, Clock, Home, Inbox, Wallet } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8", "#82ca9d"];

export default function Dashboard() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");

  const loadData = async () => {
    try {
      const [txs, accs] = await Promise.all([fetchTransactions(), fetchAccounts()]);
      setTransactions(txs);
      setAccounts(accs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Poll every 5s for live updates from WA
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleConfirm = async (id: string) => {
    await confirmTransaction(id);
    loadData();
  };

  const confirmedTxs = transactions.filter(t => t.status === "CONFIRMED");
  const needsReviewTxs = transactions.filter(t => t.status === "NEEDS_REVIEW");

  const totalBalance = accounts.reduce((acc, a) => acc + a.balance, 0);

  // Group by category for expenses
  const expenseData = confirmedTxs
    .filter(t => t.type === "EXPENSE")
    .reduce((acc, t) => {
      const existing = acc.find((x: any) => x.name === t.category);
      if (existing) existing.value += t.amount;
      else acc.push({ name: t.category, value: t.amount });
      return acc;
    }, []);

  const formatRupiah = (val: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(val);

  if (loading) return <div className="p-8 text-center animate-pulse">Loading...</div>;

  return (
    <div className="flex flex-col h-screen bg-neutral-950 text-neutral-50 overflow-hidden font-sans">
      {/* Header */}
      <header className="p-6 pb-2">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">WhatsMonTrack</h1>
        <p className="text-neutral-400 text-sm">Welcome back, {process.env.NEXT_PUBLIC_DEFAULT_PHONE_NUMBER}</p>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 pb-24">
        
        {activeTab === "dashboard" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <Card className="bg-neutral-900 border-neutral-800 text-white shadow-xl shadow-emerald-900/10">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-neutral-400">Total Net Worth</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-4xl font-bold">{formatRupiah(totalBalance)}</div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-2 gap-4">
              {accounts.map(acc => (
                <Card key={acc.id} className="bg-neutral-900 border-neutral-800 text-white">
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-xs text-neutral-400">{acc.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="text-lg font-semibold">{formatRupiah(acc.balance)}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {expenseData.length > 0 && (
              <Card className="bg-neutral-900 border-neutral-800 text-white">
                <CardHeader>
                  <CardTitle className="text-sm">Expenses by Category</CardTitle>
                </CardHeader>
                <CardContent className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={expenseData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5}>
                        {expenseData.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: any) => formatRupiah(value as number)} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {activeTab === "inbox" && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500"/>
              Needs Review ({needsReviewTxs.length})
            </h2>
            <p className="text-sm text-neutral-400 mb-4">
              These transactions have low AI confidence. Please confirm them.
            </p>
            {needsReviewTxs.length === 0 ? (
               <div className="text-center p-8 text-neutral-500">Inbox is clean! 🎉</div>
            ) : (
              needsReviewTxs.map(tx => (
                <Card key={tx.id} className="bg-neutral-900 border-amber-900/30 text-white relative overflow-hidden group">
                  <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
                  <CardContent className="p-4 flex flex-col gap-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-lg">{tx.subcategory || tx.category}</h3>
                        <p className="text-sm text-neutral-400">{tx.rawText}</p>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-lg text-amber-400">{formatRupiah(tx.amount)}</div>
                        <Badge variant="outline" className="text-xs bg-neutral-800">{tx.type}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-3 border-t border-neutral-800">
                      <div className="text-xs text-neutral-500">
                        Confidence: {(tx.confidenceScore * 100).toFixed(0)}%
                      </div>
                      <Button onClick={() => handleConfirm(tx.id)} size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1">
                        <Check className="w-4 h-4" /> Confirm
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {activeTab === "transactions" && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-xl font-bold">Recent History</h2>
            {confirmedTxs.map(tx => (
              <div key={tx.id} className="flex items-center justify-between p-4 bg-neutral-900 rounded-xl border border-neutral-800">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${tx.type === 'INCOME' ? 'bg-emerald-500/20 text-emerald-400' : tx.type === 'TRANSFER' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-rose-500/20 text-rose-400'}`}>
                    {tx.type === 'INCOME' ? <ArrowDownIcon className="w-5 h-5"/> : <ArrowUpIcon className="w-5 h-5"/>}
                  </div>
                  <div>
                    <h4 className="font-medium">{tx.subcategory || tx.category}</h4>
                    <p className="text-xs text-neutral-400">{tx.fromAccount?.name || tx.toAccount?.name}</p>
                  </div>
                </div>
                <div className={`font-bold ${tx.type === 'INCOME' ? 'text-emerald-400' : tx.type === 'TRANSFER' ? 'text-cyan-400' : 'text-rose-400'}`}>
                  {tx.type === 'INCOME' ? '+' : '-'}{formatRupiah(tx.amount)}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 w-full bg-neutral-900/90 backdrop-blur-md border-t border-neutral-800 p-2 px-6 pb-6 flex justify-between items-center z-50">
        <button onClick={() => setActiveTab("dashboard")} className={`flex flex-col items-center gap-1 p-2 transition-colors ${activeTab === 'dashboard' ? 'text-emerald-400' : 'text-neutral-500 hover:text-neutral-300'}`}>
          <Home className="w-6 h-6" />
          <span className="text-[10px] font-medium">Home</span>
        </button>
        <button onClick={() => setActiveTab("transactions")} className={`flex flex-col items-center gap-1 p-2 transition-colors ${activeTab === 'transactions' ? 'text-emerald-400' : 'text-neutral-500 hover:text-neutral-300'}`}>
          <Wallet className="w-6 h-6" />
          <span className="text-[10px] font-medium">History</span>
        </button>
        <button onClick={() => setActiveTab("inbox")} className={`relative flex flex-col items-center gap-1 p-2 transition-colors ${activeTab === 'inbox' ? 'text-amber-400' : 'text-neutral-500 hover:text-neutral-300'}`}>
          <div className="relative">
            <Inbox className="w-6 h-6" />
            {needsReviewTxs.length > 0 && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full animate-pulse border border-neutral-900" />
            )}
          </div>
          <span className="text-[10px] font-medium">Inbox</span>
        </button>
      </nav>
    </div>
  );
}
