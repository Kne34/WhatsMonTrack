import React, { useMemo, useState } from "react";
import { 
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area, ReferenceLine, Legend
} from "recharts";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

interface HomeViewProps {
  monthlyTxs: any[];
  budgets: any[];
  selectedMonth: number;
  selectedYear: number;
  totalBalance: number;
  accounts: any[];
  formatRupiah: (val: number) => string;
}

export default function HomeView({ 
  monthlyTxs, budgets, selectedMonth, selectedYear, totalBalance, accounts, formatRupiah 
}: HomeViewProps) {
  
  // 1. Data Parsing
  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
  const [breakdownType, setBreakdownType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  
  // Confirmed transactions only for analytics
  const confirmedTxs = monthlyTxs.filter(t => t.status === "CONFIRMED");

  // A. Cash Flow & Velocity & Net Worth Data
  const dailyData = useMemo(() => {
    let cumulative = 0;
    const days = Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      return { day: day.toString(), income: 0, expense: 0, cumulativeFlow: 0 };
    });

    confirmedTxs.forEach(t => {
      const date = new Date(t.createdAt);
      const dayIdx = date.getDate() - 1;
      if (t.type === 'INCOME') days[dayIdx].income += t.amount;
      if (t.type === 'EXPENSE') days[dayIdx].expense += t.amount;
    });

    // Calculate cumulative
    days.forEach(d => {
      cumulative += (d.income - d.expense);
      d.cumulativeFlow = cumulative;
    });

    return days;
  }, [confirmedTxs, daysInMonth]);

  // B. Expense Breakdown
  const expenseData = useMemo(() => {
    const data = confirmedTxs
      .filter(t => t.type === 'EXPENSE')
      .reduce((acc, t) => {
        const cat = t.category || 'UNCATEGORIZED';
        const existing = acc.find((x: any) => x.name === cat);
        if (existing) existing.value += t.amount;
        else acc.push({ name: cat, value: t.amount });
        return acc;
      }, [] as any[])
      .sort((a: any, b: any) => b.value - a.value);
    
    const total = data.reduce((sum: number, item: any) => sum + item.value, 0);
    return data.map((d: any) => ({ ...d, percent: total > 0 ? (d.value / total) * 100 : 0 }));
  }, [confirmedTxs]);

  const incomeData = useMemo(() => {
    const data = confirmedTxs
      .filter(t => t.type === 'INCOME')
      .reduce((acc, t) => {
        const cat = t.category || 'UNCATEGORIZED';
        const existing = acc.find((x: any) => x.name === cat);
        if (existing) existing.value += t.amount;
        else acc.push({ name: cat, value: t.amount });
        return acc;
      }, [] as any[])
      .sort((a: any, b: any) => b.value - a.value);
    
    const total = data.reduce((sum: number, item: any) => sum + item.value, 0);
    return data.map((d: any) => ({ ...d, percent: total > 0 ? (d.value / total) * 100 : 0 }));
  }, [confirmedTxs]);

  // D. Budget vs Actual
  const budgetData = useMemo(() => {
    return budgets.map(b => {
      const spent = confirmedTxs
        .filter(t => t.type === 'EXPENSE' && (t.category || 'UNCATEGORIZED').toUpperCase() === b.categoryName)
        .reduce((sum, t) => sum + t.amount, 0);
      
      const percent = b.limit > 0 ? Math.min((spent / b.limit) * 100, 100) : 0;
      let status = "SAFE";
      let color = "bg-green-500";
      if (percent >= 100) { status = "OVER"; color = "bg-red-500"; }
      else if (percent >= 80) { status = "WARNING"; color = "bg-orange-500"; }

      return {
        categoryName: b.categoryName,
        limit: b.limit,
        spent,
        percent,
        status,
        color
      };
    });
  }, [budgets, confirmedTxs]);

  // Global Budget for Velocity Reference Line
  const totalBudget = budgets.reduce((sum, b) => sum + b.limit, 0);
  const dailyAverageThreshold = totalBudget > 0 ? totalBudget / daysInMonth : 0;

  // Custom Tooltip components to keep JSX clean
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border p-3 rounded-lg shadow-md font-mono text-xs z-50">
          <p className="font-bold mb-2">Day {label}</p>
          {payload.map((p: any, i: number) => (
            <div key={i} style={{ color: p.color }}>
              {p.name}: {formatRupiah(p.value)}
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      
      {/* 1. Header & Net Worth */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col justify-end">
          <span className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-1">Total Net Worth</span>
          <span className="text-5xl font-heading font-bold tabular-nums tracking-tighter text-foreground">
            {formatRupiah(totalBalance)}
          </span>
        </div>
        
        {/* Accounts Summary */}
        <div className="grid grid-cols-2 gap-3">
          {accounts.map(acc => (
            <div key={acc.id} className="bg-card border border-border/50 rounded-2xl p-4 flex flex-col justify-between h-24 shadow-sm">
              <span className="text-xs text-muted-foreground font-medium">{acc.name}</span>
              <span className="text-lg font-heading font-semibold tabular-nums">{formatRupiah(acc.balance)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Net Worth Growth / Cumulative Flow (Area Chart) */}
      <div className="bg-card border border-border/50 rounded-3xl p-5 shadow-sm">
        <h3 className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-4">Cumulative Net Flow (This Month)</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailyData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="colorFlow" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="step" dataKey="cumulativeFlow" name="Net Flow" stroke="var(--primary)" strokeWidth={2} fillOpacity={1} fill="url(#colorFlow)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* 3. Cash Flow Trend (Grouped Bar Chart) */}
        <div className="bg-card border border-border/50 rounded-3xl p-5 shadow-sm">
          <h3 className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-4">Daily Cash Flow</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={(val) => `${val / 1000}k`} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                <Bar dataKey="income" name="Income" fill="#10b981" radius={[2, 2, 0, 0]} />
                <Bar dataKey="expense" name="Expense" fill="#ef4444" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 4. Daily Spending Velocity (Bar + Reference Line) */}
        <div className="bg-card border border-border/50 rounded-3xl p-5 shadow-sm">
          <h3 className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-4">Spending Velocity</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.5} />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={(val) => `${val / 1000}k`} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                <Tooltip content={<CustomTooltip />} />
                {dailyAverageThreshold > 0 && (
                  <ReferenceLine y={dailyAverageThreshold} stroke="#f59e0b" strokeDasharray="3 3" label={{ position: 'top', value: 'Avg Budget', fill: '#f59e0b', fontSize: 10 }} />
                )}
                <Bar dataKey="expense" name="Expense" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border/50 rounded-3xl p-5 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xs font-mono text-muted-foreground uppercase tracking-widest">Category Breakdown</h3>
            <div className="flex gap-2">
              <button 
                onClick={() => setBreakdownType('EXPENSE')}
                className={`text-[10px] px-2 py-1 rounded-md font-mono transition-colors ${breakdownType === 'EXPENSE' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-secondary'}`}
              >
                EXPENSE
              </button>
              <button 
                onClick={() => setBreakdownType('INCOME')}
                className={`text-[10px] px-2 py-1 rounded-md font-mono transition-colors ${breakdownType === 'INCOME' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-secondary'}`}
              >
                INCOME
              </button>
            </div>
          </div>
          
          {(breakdownType === 'EXPENSE' ? expenseData : incomeData).length > 0 ? (
            <div className="flex items-center h-48">
              <div className="w-1/2 h-full relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={breakdownType === 'EXPENSE' ? expenseData : incomeData} innerRadius="60%" outerRadius="80%" paddingAngle={2} dataKey="value" stroke="none">
                      {(breakdownType === 'EXPENSE' ? expenseData : incomeData).map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', borderRadius: '8px' }}
                      itemStyle={{ color: 'var(--foreground)', fontFamily: 'var(--font-heading)', fontSize: '12px' }}
                      formatter={(value: any, name: any, props: any) => [`${formatRupiah(value as number)} (${props.payload.percent.toFixed(1)}%)`, name]} 
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center Label */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[10px] text-muted-foreground font-mono">TOTAL</span>
                  <span className="text-sm font-bold">{formatRupiah((breakdownType === 'EXPENSE' ? expenseData : incomeData).reduce((a:any, b:any) => a + b.value, 0) / 1000)}k</span>
                </div>
              </div>
              <div className="w-1/2 flex flex-col pl-4 space-y-2 overflow-y-auto max-h-full">
                {(breakdownType === 'EXPENSE' ? expenseData : incomeData).map((d: any, i: number) => (
                  <div key={i} className="flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div className="w-2 h-2 shrink-0 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></div>
                      <span className="font-medium text-foreground truncate">{d.name}</span>
                    </div>
                    <span className="font-mono text-muted-foreground shrink-0 pl-2">{d.percent.toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
             <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">No data for {breakdownType.toLowerCase()}.</div>
          )}
        </div>

        {/* 6. Budget vs Actual (Progress Bars) */}
        <div className="bg-card border border-border/50 rounded-3xl p-5 shadow-sm">
          <h3 className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-4">Budget vs Actual</h3>
          {budgetData.length > 0 ? (
            <div className="space-y-4 overflow-y-auto max-h-48 pr-2">
              {budgetData.map((b, i) => (
                <div key={i} className="flex flex-col space-y-1">
                  <div className="flex justify-between items-end">
                    <span className="text-xs font-medium">{b.categoryName}</span>
                    <span className="text-xs font-mono text-muted-foreground">
                      {formatRupiah(b.spent)} / {formatRupiah(b.limit)}
                    </span>
                  </div>
                  <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                    <div className={`h-full ${b.color} transition-all duration-500`} style={{ width: `${b.percent}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-48 flex flex-col items-center justify-center text-xs text-muted-foreground text-center">
              No budgets set. <br /> Use the backend API to define limits for categories.
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
