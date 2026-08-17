"use client";

import React, { useEffect, useState } from "react";
import { fetchTransactions, fetchAccounts, confirmTransaction } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowDownIcon, ArrowUpIcon, Check, Clock, Home, Inbox, Wallet, MessageCircle, AlertCircle } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

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

  // Helper for Segmented Bar
  const renderConfidenceBar = (score: number) => {
    const dots = 5;
    const filled = Math.round(score * dots);
    return (
      <div className="flex gap-1 items-center">
        {Array.from({ length: dots }).map((_, i) => (
          <div 
            key={i} 
            className={`w-4 h-1.5 rounded-full ${i < filled ? (score > 0.8 ? 'bg-income' : 'bg-warning') : 'bg-muted-foreground/30'}`}
          />
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col h-screen bg-background items-center justify-center animate-pulse">
        <div className="w-12 h-12 rounded-full border-4 border-muted border-t-primary animate-spin mb-4"></div>
        <p className="text-muted-foreground font-mono text-sm">Syncing Ledger...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden font-sans antialiased">
      {/* Header */}
      <header className="p-6 pb-4">
        <h1 className="text-2xl font-heading font-semibold tracking-tight">Ledger</h1>
        <p className="text-muted-foreground font-mono text-xs mt-1 opacity-70">{process.env.NEXT_PUBLIC_DEFAULT_PHONE_NUMBER}</p>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto px-6 pb-28">
        
        {/* DASHBOARD TAB */}
        {activeTab === "dashboard" && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Total Net Worth - Cardless, Typography focused */}
            <div className="flex flex-col">
              <span className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-1">Total Net Worth</span>
              <span className="text-5xl font-heading font-bold tabular-nums tracking-tighter text-foreground">
                {formatRupiah(totalBalance)}
              </span>
            </div>

            {/* Accounts */}
            <div className="grid grid-cols-2 gap-3">
              {accounts.map(acc => (
                <div key={acc.id} className="bg-card border border-border/50 rounded-2xl p-4 flex flex-col justify-between h-24 shadow-sm">
                  <span className="text-xs text-muted-foreground font-medium">{acc.name}</span>
                  <span className="text-lg font-heading font-semibold tabular-nums">{formatRupiah(acc.balance)}</span>
                </div>
              ))}
            </div>

            {/* Chart */}
            {expenseData.length > 0 && (
              <div className="bg-card border border-border/50 rounded-3xl p-5 shadow-sm">
                <h3 className="text-sm font-medium text-muted-foreground mb-4">Expense Breakdown</h3>
                <div className="h-48 w-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={expenseData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={2} stroke="none">
                        {expenseData.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '8px' }}
                        itemStyle={{ color: 'var(--foreground)', fontFamily: 'var(--font-heading)' }}
                        formatter={(value: any) => formatRupiah(value as number)} 
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none flex-col">
                    <span className="text-xs text-muted-foreground">Total</span>
                    <span className="text-sm font-heading font-bold tabular-nums">
                      {formatRupiah(expenseData.reduce((acc: number, curr: any) => acc + curr.value, 0))}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* INBOX TAB */}
        {activeTab === "inbox" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-heading font-bold">Needs Review</h2>
              {needsReviewTxs.length > 0 && (
                <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 font-mono">
                  {needsReviewTxs.length} items
                </Badge>
              )}
            </div>

            {needsReviewTxs.length === 0 ? (
               <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                 <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4">
                   <MessageCircle className="w-8 h-8 opacity-50" />
                 </div>
                 <p className="font-medium text-foreground">Inbox is clean</p>
                 <p className="text-sm opacity-70">No new messages to parse.</p>
               </div>
            ) : (
              <div className="space-y-8">
                {needsReviewTxs.map(tx => (
                  <div key={tx.id} className="relative pl-6 before:absolute before:left-2 before:top-4 before:bottom-0 before:w-px before:bg-border/50">
                    {/* Node Dot */}
                    <div className="absolute left-[3px] top-1.5 w-2.5 h-2.5 rounded-full bg-warning ring-4 ring-background z-10" />
                    
                    <div className="flex flex-col gap-4">
                      {/* WhatsApp Bubble (Raw Text) */}
                      <div className="self-end max-w-[85%] bg-whatsapp text-[#0B101E] px-4 py-2.5 rounded-2xl rounded-tr-sm relative shadow-sm">
                        <p className="text-sm font-medium">{tx.rawText}</p>
                        <span className="text-[10px] opacity-70 block text-right mt-1 font-mono">from WhatsApp</span>
                      </div>

                      {/* Parsed Data Card */}
                      <div className="bg-card border border-border rounded-2xl p-4 shadow-sm relative ml-4">
                        {/* Connector line from bubble to card visually represented by margin/padding flow */}
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <p className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">Parsed Output</p>
                            <h3 className="font-bold text-lg font-heading">{tx.subcategory || tx.category}</h3>
                          </div>
                          <Badge variant="outline" className="font-mono bg-secondary">{tx.type}</Badge>
                        </div>

                        <div className="text-3xl font-heading font-bold tabular-nums tracking-tighter text-foreground mb-4">
                          {formatRupiah(tx.amount)}
                        </div>

                        <div className="flex items-center justify-between border-t border-border pt-4 mt-2">
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[10px] font-mono text-muted-foreground">CONFIDENCE</span>
                            {renderConfidenceBar(tx.confidenceScore)}
                          </div>
                          <Button 
                            onClick={() => handleConfirm(tx.id)} 
                            size="default" 
                            className="bg-foreground text-background hover:bg-foreground/90 rounded-full font-heading font-medium active:scale-95 transition-transform"
                          >
                            Confirm
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TRANSACTIONS TAB */}
        {activeTab === "transactions" && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h2 className="text-xl font-heading font-bold mb-6">Ledger History</h2>
            {confirmedTxs.length === 0 ? (
               <p className="text-center text-muted-foreground py-8">No recorded transactions.</p>
            ) : (
              <div className="flex flex-col">
                {confirmedTxs.map(tx => (
                  <div key={tx.id} className="flex items-center justify-between py-4 border-b border-border/40 last:border-0 group">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${tx.type === 'INCOME' ? 'bg-income/10 text-income' : tx.type === 'TRANSFER' ? 'bg-blue-500/10 text-blue-500' : 'bg-expense/10 text-expense'}`}>
                        {tx.type === 'INCOME' ? <ArrowDownIcon className="w-5 h-5"/> : <ArrowUpIcon className="w-5 h-5"/>}
                      </div>
                      <div className="flex flex-col">
                        <h4 className="font-medium text-foreground">{tx.subcategory || tx.category}</h4>
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">{tx.fromAccount?.name || tx.toAccount?.name}</p>
                      </div>
                    </div>
                    <div className={`text-right font-heading font-bold tabular-nums tracking-tight ${tx.type === 'INCOME' ? 'text-income' : tx.type === 'TRANSFER' ? 'text-blue-500' : 'text-foreground'}`}>
                      {tx.type === 'INCOME' ? '+' : tx.type === 'EXPENSE' ? '-' : ''}{formatRupiah(tx.amount)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 w-full bg-background/80 backdrop-blur-xl border-t border-border/50 pb-safe pt-2 px-6 flex justify-between items-center z-50">
        <button 
          onClick={() => setActiveTab("dashboard")} 
          className={`flex-1 flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all ${activeTab === 'dashboard' ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground/70'}`}
        >
          <Home className={`w-6 h-6 ${activeTab === 'dashboard' ? 'fill-foreground/10' : ''}`} strokeWidth={activeTab === 'dashboard' ? 2.5 : 2} />
          <span className="text-[10px] uppercase tracking-widest font-mono">Home</span>
        </button>
        <button 
          onClick={() => setActiveTab("transactions")} 
          className={`flex-1 flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all ${activeTab === 'transactions' ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground/70'}`}
        >
          <Wallet className={`w-6 h-6 ${activeTab === 'transactions' ? 'fill-foreground/10' : ''}`} strokeWidth={activeTab === 'transactions' ? 2.5 : 2} />
          <span className="text-[10px] uppercase tracking-widest font-mono">Ledger</span>
        </button>
        <button 
          onClick={() => setActiveTab("inbox")} 
          className={`flex-1 flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all relative ${activeTab === 'inbox' ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground/70'}`}
        >
          <div className="relative">
            <Inbox className={`w-6 h-6 ${activeTab === 'inbox' ? 'fill-foreground/10' : ''}`} strokeWidth={activeTab === 'inbox' ? 2.5 : 2} />
            {needsReviewTxs.length > 0 && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-warning rounded-full border-[2px] border-background" />
            )}
          </div>
          <span className={`text-[10px] uppercase tracking-widest font-mono ${activeTab === 'inbox' && needsReviewTxs.length > 0 ? 'text-warning' : ''}`}>Inbox</span>
        </button>
      </nav>
    </div>
  );
}
