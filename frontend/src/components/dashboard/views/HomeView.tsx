import React from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const INCOME_COLORS = ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0'];

interface HomeViewProps {
  totalBalance: number;
  accounts: any[];
  expenseData: any[];
  incomeData: any[];
  formatRupiah: (val: number) => string;
}

export default function HomeView({ totalBalance, accounts, expenseData, incomeData, formatRupiah }: HomeViewProps) {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Total Net Worth */}
      <div className="flex flex-col">
        <span className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-1">Total Net Worth</span>
        <span className="text-5xl font-heading font-bold tabular-nums tracking-tighter text-foreground">
          {formatRupiah(totalBalance)}
        </span>
      </div>

      {/* Accounts */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <span className="text-sm font-mono text-muted-foreground uppercase tracking-widest">Accounts</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {accounts.map(acc => (
            <div key={acc.id} className="bg-card border border-border/50 rounded-2xl p-4 flex flex-col justify-between h-24 shadow-sm">
              <span className="text-xs text-muted-foreground font-medium">{acc.name}</span>
              <span className="text-lg font-heading font-semibold tabular-nums">{formatRupiah(acc.balance)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Analytics Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
        {/* Expense Breakdown */}
        {expenseData.length > 0 && (
          <div className="bg-card border border-border/50 rounded-3xl p-5 shadow-sm">
            <h3 className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-4">Expense Breakdown</h3>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expenseData}
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
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
            </div>
            <div className="flex flex-col mt-2 space-y-1.5">
              {expenseData.slice(0, 3).map((d: any, i: number) => (
                <div key={i} className="flex justify-between items-center text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                    <span className="font-medium text-foreground">{d.name}</span>
                  </div>
                  <span className="font-mono text-muted-foreground">{formatRupiah(d.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Income Breakdown */}
        {incomeData.length > 0 && (
          <div className="bg-card border border-border/50 rounded-3xl p-5 shadow-sm">
            <h3 className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-4">Income Breakdown</h3>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={incomeData}
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {incomeData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={INCOME_COLORS[index % INCOME_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '8px' }}
                    itemStyle={{ color: 'var(--foreground)', fontFamily: 'var(--font-heading)' }}
                    formatter={(value: any) => formatRupiah(value as number)} 
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col mt-2 space-y-1.5">
              {incomeData.slice(0, 3).map((d: any, i: number) => (
                <div key={i} className="flex justify-between items-center text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: INCOME_COLORS[i % INCOME_COLORS.length] }}></div>
                    <span className="font-medium text-foreground">{d.name}</span>
                  </div>
                  <span className="font-mono text-muted-foreground">{formatRupiah(d.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
