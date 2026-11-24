"use client";

import React, { useSyncExternalStore } from "react";
import { ChartCandlestick, ChartLine, ChevronLeft, ChevronRight, Handshake, Inbox, LayoutGrid, MessagesSquare, PanelLeftClose, PanelLeftOpen, Plus, ReceiptText, Settings, Target, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMonth } from "@/lib/format";
import { pick, tr } from "@/lib/i18n";
import { Button, IconButton, Menu, focusRing } from "../../common/ui";

export type Tab = "dashboard" | "transactions" | "debts" | "investments" | "chart" | "chat" | "inbox" | "settings";

/**
 * Labels are Indonesian sources, translated with tr() where they are shown.
 * `phone: false`: not in the phone's bottom tabs (six fit); reached from another page there.
 */
export const NAV_ITEMS: { id: Tab; label: string; short?: string; enShort?: string; icon: React.ElementType; phone?: false }[] = [
  { id: "dashboard", label: "Dashboard", enShort: "Home", icon: LayoutGrid },
  { id: "transactions", label: "Transaksi", enShort: "Activity", icon: ReceiptText },
  { id: "debts", label: "Utang-piutang", short: "Utang", enShort: "Debts", icon: Handshake },
  { id: "investments", label: "Investasi", enShort: "Invest", icon: ChartLine },
  { id: "chart", label: "Chart", icon: ChartCandlestick, phone: false },
  { id: "chat", label: "Chat", icon: MessagesSquare },
  { id: "inbox", label: "Perlu ditinjau", short: "Tinjau", enShort: "Review", icon: Inbox },
];
/** At the foot of the sidebar; on phones the gear in the top bar */
export const SETTINGS_ITEM = { id: "settings" as const, label: "Pengaturan", icon: Settings };
export const ALL_TABS: Tab[] = [...NAV_ITEMS.map((n) => n.id), SETTINGS_ITEM.id];

// ---------- Sidebar width (icons only or with names), remembered per kind of page ----------

/** The chart page starts narrow (it needs the width), the other pages wide; each remembers its own choice */
const SIDEBAR_KEYS = { normal: "wmt-sidebar-collapsed", chart: "wmt-sidebar-collapsed-chart" } as const;
const sidebarListeners = new Set<() => void>();
const sidebarMemory: Partial<Record<keyof typeof SIDEBAR_KEYS, boolean>> = {};

function readCollapsed(kind: keyof typeof SIDEBAR_KEYS): boolean {
  if (sidebarMemory[kind] !== undefined) return sidebarMemory[kind]!;
  try {
    const v = localStorage.getItem(SIDEBAR_KEYS[kind]);
    if (v !== null) return v === "1";
  } catch { /* storage unavailable: the default */ }
  return kind === "chart";
}

export function setSidebarCollapsed(kind: keyof typeof SIDEBAR_KEYS, collapsed: boolean) {
  sidebarMemory[kind] = collapsed;
  try { localStorage.setItem(SIDEBAR_KEYS[kind], collapsed ? "1" : "0"); } catch { /* this visit only */ }
  sidebarListeners.forEach((l) => l());
}

/** Whether the sidebar shows icons only. Server render: the default of that page. */
export function useSidebarCollapsed(kind: keyof typeof SIDEBAR_KEYS): boolean {
  return useSyncExternalStore(
    (l) => { sidebarListeners.add(l); return () => sidebarListeners.delete(l); },
    () => readCollapsed(kind),
    () => kind === "chart",
  );
}

// ---------- Pieces ----------

function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span className={cn("min-w-5 rounded-full bg-[#FF3B30] px-1.5 text-center text-[11px] font-semibold leading-5 text-white dark:bg-[#FF453A]", className)}>
      {count > 99 ? "99+" : count}
      <span className="sr-only"> {tr("perlu ditinjau")}</span>
    </span>
  );
}

function AlertDot({ label, className }: { label: string; className?: string }) {
  return (
    <span className={cn("size-2.5 rounded-full bg-[#FF3B30] ring-2 ring-[#F6F6F8] dark:bg-[#FF453A] dark:ring-[#1C1C1E]", className)}>
      <span className="sr-only">{label}</span>
    </span>
  );
}

interface SidebarProps {
  active: Tab;
  onNavigate: (tab: Tab) => void;
  reviewCount: number;
  /** Icons only (w-16); names show as tooltips and to screen readers */
  collapsed: boolean;
  onToggle: () => void;
  /** Shown as a red dot on Pengaturan (e.g. the WhatsApp bot is offline) */
  settingsAlert?: string | null;
}

/**
 * Persistent sidebar for tablet/desktop, translucent as in macOS (Finder, Mail): rows tinted gray when
 * chosen, icons in the system blue. It collapses to a rail of icons or expands with the names.
 */
export function Sidebar({ active, onNavigate, reviewCount, collapsed, onToggle, settingsAlert }: SidebarProps) {
  const row = (current: boolean) => cn(
    "relative flex items-center rounded-lg text-sm text-foreground transition-colors",
    focusRing,
    collapsed ? "size-10 justify-center" : "w-full gap-3 px-3 py-[7px]",
    current ? "bg-black/[0.07] font-medium dark:bg-white/[0.1]" : "hover:bg-black/[0.035] dark:hover:bg-white/[0.05]",
  );
  const item = (id: Tab, label: string, Icon: React.ElementType, extra?: React.ReactNode) => {
    const current = active === id;
    return (
      <button key={id} type="button" onClick={() => onNavigate(id)} aria-current={current ? "page" : undefined}
        aria-label={collapsed ? label : undefined} title={collapsed ? label : undefined} className={row(current)}>
        <Icon className="size-[18px] shrink-0 text-[#0071E3] dark:text-[#0A84FF]" aria-hidden strokeWidth={current ? 2.25 : 1.75} />
        {!collapsed && <span className="min-w-0 flex-1 truncate text-left">{label}</span>}
        {extra}
      </button>
    );
  };

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-black/[0.06] bg-[#F6F6F8]/80 backdrop-blur-2xl backdrop-saturate-150 transition-[width] duration-200 motion-reduce:transition-none md:flex dark:border-white/[0.08] dark:bg-[#1C1C1E]/80",
        collapsed ? "w-16 items-center" : "w-60",
      )}
    >
      <div className={cn("flex h-14 shrink-0 items-center", collapsed ? "justify-center" : "justify-between pl-5 pr-2")}>
        {!collapsed && <span className="truncate font-heading text-[17px] font-semibold tracking-tight">WhatsMonTrack</span>}
        <IconButton label={collapsed ? tr("Lebarkan sidebar") : tr("Ciutkan sidebar")} onClick={onToggle} aria-expanded={!collapsed}
          title={collapsed ? tr("Lebarkan sidebar") : tr("Ciutkan sidebar")} className="size-9 text-muted-foreground">
          {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
        </IconButton>
      </div>

      <nav aria-label={tr("Navigasi utama")} className={cn("flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden pt-2", collapsed ? "items-center px-0" : "px-3")}>
        {NAV_ITEMS.map(({ id, label, icon }) =>
          item(id, tr(label), icon, id === "inbox" && reviewCount > 0
            ? <CountBadge count={reviewCount} className={collapsed ? "absolute -right-1 -top-1" : undefined} />
            : null))}
      </nav>

      <div className={cn("border-t border-black/[0.06] py-3 dark:border-white/[0.08]", collapsed ? "flex w-full justify-center" : "px-3")}>
        {item(SETTINGS_ITEM.id, tr(SETTINGS_ITEM.label), SETTINGS_ITEM.icon, settingsAlert
          ? <AlertDot label={settingsAlert} className={collapsed ? "absolute right-1.5 top-1.5" : undefined} />
          : null)}
      </div>
    </aside>
  );
}

/** Phones: the gear in the top bar opens Pengaturan (the sidebar is hidden there). */
export function SettingsButton({ onClick, alert }: { onClick: () => void; alert?: string | null }) {
  return (
    <IconButton label={tr("Pengaturan")} onClick={onClick} className="relative">
      <Settings className="size-5 text-[#0071E3] dark:text-[#0A84FF]" />
      {alert && <AlertDot label={alert} className="absolute right-1.5 top-1.5" />}
    </IconButton>
  );
}

/** Bottom tab bar for phones: 6 equal destinations within thumb reach. */
export function BottomTabs({ active, onNavigate, reviewCount }: { active: Tab; onNavigate: (tab: Tab) => void; reviewCount: number }) {
  return (
    <nav aria-label={tr("Navigasi utama")}
      // Hidden while the keyboard is open (see useKeyboardOpen): it shrinks the page, the tabs would sit on top of it
      className="fixed inset-x-0 bottom-0 z-30 border-t border-black/[0.08] bg-[#F9F9F9]/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl backdrop-saturate-150 md:hidden dark:border-white/[0.08] dark:bg-[#1C1C1E]/80 [html[data-keyboard=open]_&]:hidden">
      <div className="grid grid-cols-6">
        {NAV_ITEMS.filter((n) => n.phone !== false).map(({ id, label, short, enShort, icon: Icon }) => {
          const current = active === id;
          // Apple HIG: tab bar titles are short single words; six tabs fit a 320 px phone only that way
          const title = pick(short ?? label, enShort ?? tr(label));
          return (
            <button key={id} type="button" onClick={() => onNavigate(id)} aria-current={current ? "page" : undefined}
              aria-label={title !== tr(label) ? tr(label) : undefined}
              // iOS tab bar: the chosen tab in the system blue, the others gray
              className={cn("flex h-[52px] min-w-0 flex-col items-center justify-center gap-0.5 text-[10px] font-medium tracking-tight transition-colors max-[359px]:tracking-tighter", focusRing,
                current ? "text-[#0071E3] dark:text-[#0A84FF]" : "text-[#8E8E93] active:opacity-60")}>
              <span className="relative">
                <Icon className="size-5" aria-hidden strokeWidth={current ? 2.25 : 1.75} />
                {id === "inbox" && <CountBadge count={reviewCount} className="absolute -top-1.5 left-3.5" />}
              </span>
              <span className="max-w-full truncate px-0.5" aria-hidden={title !== tr(label) ? true : undefined}>{title}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** Previous/next month. Future months stay reachable: a transaction can be dated ahead (e.g. a planned payment). */
export function MonthSwitcher({ month, year, onChange }: { month: number; year: number; onChange: (month: number, year: number) => void }) {
  const now = new Date();
  const isCurrent = month === now.getMonth() + 1 && year === now.getFullYear();
  // Same range the API accepts (year 2000-2100)
  const atEnd = month === 12 && year >= 2100;
  const atStart = month === 1 && year <= 2000;
  const shift = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    onChange(d.getMonth() + 1, d.getFullYear());
  };
  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center rounded-xl border border-border/70 bg-card">
        <IconButton label={tr("Bulan sebelumnya")} onClick={() => shift(-1)} disabled={atStart}><ChevronLeft className="size-4" /></IconButton>
        <span className="min-w-32 text-center text-sm font-medium capitalize tabular-nums" aria-live="polite">{formatMonth(month, year)}</span>
        <IconButton label={tr("Bulan berikutnya")} onClick={() => shift(1)} disabled={atEnd}><ChevronRight className="size-4" /></IconButton>
      </div>
      {!isCurrent && (
        <Button variant="ghost" size="sm" onClick={() => onChange(now.getMonth() + 1, now.getFullYear())}>{tr("Bulan ini")}</Button>
      )}
    </div>
  );
}

/** Single primary action, with the things a user can add. */
export function AddMenu({ onAddTransaction, onAddDebt, onAddInvestment, onAddAccount, onAddBudget }: {
  onAddTransaction: () => void;
  onAddDebt: () => void;
  onAddInvestment: () => void;
  onAddAccount: () => void;
  onAddBudget: () => void;
}) {
  return (
    <Menu
      items={[
        { label: tr("Transaksi"), description: tr("Pengeluaran, pemasukan, atau transfer"), icon: <ReceiptText className="size-4" />, onSelect: onAddTransaction },
        { label: tr("Utang-piutang"), description: tr("Talangan atau utang ke teman"), icon: <Handshake className="size-4" />, onSelect: onAddDebt },
        { label: tr("Aset investasi"), description: tr("Saham Indonesia, saham US, atau crypto"), icon: <ChartLine className="size-4" />, onSelect: onAddInvestment },
        { label: tr("Rekening"), description: tr("Bank, e-wallet, atau tunai"), icon: <Wallet className="size-4" />, onSelect: onAddAccount },
        { label: tr("Anggaran"), description: tr("Batas pengeluaran per kategori"), icon: <Target className="size-4" />, onSelect: onAddBudget },
      ]}
      trigger={({ triggerProps }) => (
        <Button {...triggerProps} aria-label={tr("Tambah")}>
          <Plus className="size-4" aria-hidden />
          <span className="hidden sm:inline">{tr("Tambah")}</span>
        </Button>
      )}
    />
  );
}
