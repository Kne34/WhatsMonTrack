import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowDownIcon, ArrowUpIcon, ChevronLeft, ChevronRight, Pencil } from "lucide-react";

interface LedgerViewProps {
  selectedMonth: number;
  selectedYear: number;
  monthlyConfirmedTxs: any[];
  tableConfirmedTxs: any[];
  selectedDay: number | null;
  setSelectedDay: (day: number | null) => void;
  limit: number;
  page: number;
  totalPages: number;
  setLimit: (l: number) => void;
  setPage: React.Dispatch<React.SetStateAction<number>>;
  handleEditClick: (tx: any) => void;
  formatRupiah: (val: number) => string;
}

export default function LedgerView({
  selectedMonth,
  selectedYear,
  monthlyConfirmedTxs,
  tableConfirmedTxs,
  selectedDay,
  setSelectedDay,
  limit,
  page,
  totalPages,
  setLimit,
  setPage,
  handleEditClick,
  formatRupiah
}: LedgerViewProps) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <h2 className="text-xl font-heading font-bold mb-2">Ledger History</h2>
      
      {/* Calendar View Always Visible */}
      <div className="mb-8 border border-border/50 rounded-3xl p-4 bg-card/30">
        <div className="grid grid-cols-7 gap-2 text-center" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <div key={i} className="text-xs font-mono text-muted-foreground">{d}</div>)}
          
          {/* Blank days */}
          {Array.from({ length: new Date(selectedYear, selectedMonth - 1, 1).getDay() === 0 ? 6 : new Date(selectedYear, selectedMonth - 1, 1).getDay() - 1 }).map((_, i) => (
            <div key={`blank-${i}`} className="p-2"></div>
          ))}

          {/* Calendar Days */}
          {Array.from({ length: new Date(selectedYear, selectedMonth, 0).getDate() }, (_, i) => i + 1).map(day => {
            const txs = monthlyConfirmedTxs.filter(t => new Date(t.createdAt).getDate() === day);
            const income = txs.filter(t => t.type === 'INCOME').reduce((a, b) => a + b.amount, 0);
            const expense = txs.filter(t => t.type === 'EXPENSE').reduce((a, b) => a + b.amount, 0);
            
            const isSelected = selectedDay === day;
            
            return (
              <button 
                key={day} 
                onClick={() => {
                  setSelectedDay(isSelected ? null : day);
                  setPage(1); // Reset page on filter change
                }}
                className={`p-1.5 sm:p-2 rounded-xl border flex flex-col items-center justify-center min-h-[50px] relative transition-all active:scale-95 cursor-pointer outline-none ${
                  isSelected 
                    ? 'bg-foreground text-background border-foreground shadow-md'
                    : txs.length > 0 
                      ? 'bg-card border-border/50 shadow-sm hover:border-foreground/30 hover:shadow-md' 
                      : 'border-transparent opacity-50 hover:bg-muted/50 hover:opacity-100'
                }`}
              >
                <span className={`text-[10px] sm:text-xs font-heading font-medium`}>{day}</span>
                <div className="flex gap-1 mt-1">
                  {income > 0 && <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-background' : 'bg-income'}`} />}
                  {expense > 0 && <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-background' : 'bg-expense'}`} />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Pagination Limit & Table Header */}
      <div className="flex items-center justify-between mt-8 mb-4">
        <h3 className="font-heading font-semibold text-lg">Transactions</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground">Show</span>
          <select 
            className="bg-secondary/50 border border-border/50 rounded-lg text-xs font-mono px-2 py-1 outline-none focus:ring-1 focus:ring-ring"
            value={limit}
            onChange={(e) => {
              setLimit(Number(e.target.value));
              setPage(1); // Reset to page 1 on limit change
            }}
          >
            <option value={10}>10</option>
            <option value={15}>15</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-card border border-border/50 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-secondary/30 font-mono tracking-widest">
              <tr>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Account</th>
                <th className="px-4 py-3 font-medium text-right">Amount</th>
                <th className="px-4 py-3 font-medium text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {tableConfirmedTxs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No recorded transactions.</td>
                </tr>
              ) : (
                tableConfirmedTxs.map(tx => (
                  <tr key={tx.id} className="hover:bg-muted/10 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground">{new Date(tx.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}</span>
                        <span className="text-[10px] font-mono text-muted-foreground">{new Date(tx.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${tx.type === 'INCOME' ? 'bg-income/10 text-income' : tx.type === 'TRANSFER' ? 'bg-blue-500/10 text-blue-500' : 'bg-expense/10 text-expense'}`}>
                          {tx.type === 'INCOME' ? <ArrowDownIcon className="w-3 h-3"/> : tx.type === 'TRANSFER' ? <ArrowUpIcon className="w-3 h-3 rotate-45"/> : <ArrowUpIcon className="w-3 h-3"/>}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{tx.category}</span>
                          <span className={`text-[10px] font-mono ${tx.type === 'INCOME' ? 'text-income' : tx.type === 'TRANSFER' ? 'text-blue-500' : 'text-expense'}`}>{tx.type}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-foreground">{tx.subcategory || '-'}</span>
                    </td>
                    <td className="px-4 py-3">
                      {tx.type === 'TRANSFER' ? (
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className="font-mono text-[10px] bg-secondary/50">{tx.fromAccount?.name}</Badge>
                          <span className="text-muted-foreground text-xs">→</span>
                          <Badge variant="outline" className="font-mono text-[10px] bg-secondary/50">{tx.toAccount?.name}</Badge>
                        </div>
                      ) : (
                        <Badge variant="outline" className="font-mono text-[10px] bg-secondary/50">{tx.fromAccount?.name || tx.toAccount?.name}</Badge>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-right font-heading font-bold tabular-nums tracking-tight whitespace-nowrap ${tx.type === 'INCOME' ? 'text-income' : tx.type === 'TRANSFER' ? 'text-blue-500' : 'text-foreground'}`}>
                      {tx.type === 'INCOME' ? '+' : tx.type === 'EXPENSE' ? '-' : ''}{formatRupiah(tx.amount)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleEditClick(tx)} className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
          
      {/* Pagination Controls */}
      {tableConfirmedTxs.length > 0 && (
        <div className="flex items-center justify-between pt-2">
          <Button 
            variant="outline" 
            size="sm" 
            disabled={page === 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            className="font-mono text-xs h-8 rounded-lg"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Prev
          </Button>
          <span className="text-xs font-mono text-muted-foreground">
            Page {page} of {Math.max(1, totalPages)}
          </span>
          <Button 
            variant="outline" 
            size="sm" 
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            className="font-mono text-xs h-8 rounded-lg"
          >
            Next <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
