"use client";

import React from "react";
import { ChevronLeft, ChevronRight, Handshake, Inbox, LayoutGrid, LogOut, MessageCircle, MessagesSquare, Plus, ReceiptText, Smartphone, Target, User, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMonth, formatPhone } from "@/lib/format";
import { Button, IconButton, Menu, focusRing, type MenuItem } from "../../common/ui";
import { ThemeSwitcher } from "../../theme";

export type Tab = "dashboard" | "transactions" | "chat" | "inbox";

export const NAV_ITEMS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid },
  { id: "transactions", label: "Transaksi", icon: ReceiptText },
  { id: "chat", label: "Chat", icon: MessagesSquare },
  { id: "inbox", label: "Perlu ditinjau", icon: Inbox },
];

interface StatusProps {
  email: string;
  phoneNumber: string | null;
  isAdmin: boolean;
  botConnected: boolean | null;
  /** The bot was unlinked on purpose by an admin */
  botStopped?: boolean;
  onPhoneClick: () => void;
  onBotClick: () => void;
  onLogout: () => void;
}

function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span className={cn("min-w-5 rounded-full bg-foreground px-1.5 text-center text-[11px] font-semibold leading-5 text-background", className)}>
      {count > 99 ? "99+" : count}
      <span className="sr-only"> perlu ditinjau</span>
    </span>
  );
}

function botLabel(status: { botConnected: boolean | null; botStopped?: boolean }) {
  if (status.botStopped) return "Dicabut";
  return status.botConnected ? "Online" : status.botConnected === false ? "Offline" : "Memeriksa…";
}

function BotDot({ connected }: { connected: boolean | null }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 rounded-full", connected ? "bg-income" : connected === false ? "bg-destructive" : "bg-muted-foreground/40")}
    />
  );
}

/** Persistent sidebar for tablet/desktop: primary navigation stays visible (no hamburger). */
export function Sidebar({ active, onNavigate, reviewCount, ...status }: StatusProps & {
  active: Tab;
  onNavigate: (tab: Tab) => void;
  reviewCount: number;
}) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border/70 bg-card md:flex">
      <div className="px-5 pt-6 pb-8 font-heading text-lg font-semibold tracking-tight">WhatsMonTrack</div>

      <nav aria-label="Navigasi utama" className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const current = active === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              aria-current={current ? "page" : undefined}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                focusRing,
                current ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
              <span className="flex-1 text-left">{label}</span>
              {id === "inbox" && <CountBadge count={reviewCount} />}
            </button>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-border/70 p-3">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <span className="text-xs text-muted-foreground">Tema</span>
          <ThemeSwitcher compact />
        </div>
        <button type="button" onClick={status.onPhoneClick}
          className={cn("flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/60", focusRing)}>
          <Smartphone className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
          <span className="min-w-0">
            <span className="block text-xs text-muted-foreground">WhatsApp</span>
            <span className="block truncate text-sm text-foreground">
              {status.phoneNumber ? formatPhone(status.phoneNumber) : "Hubungkan nomor"}
            </span>
          </span>
        </button>
        {status.isAdmin && (
          <button type="button" onClick={status.onBotClick}
            className={cn("flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/60", focusRing)}>
            <MessageCircle className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
            <span className="min-w-0">
              <span className="block text-xs text-muted-foreground">Bot WhatsApp</span>
              <span className="flex items-center gap-2 text-sm text-foreground">
                <BotDot connected={status.botConnected} />
                {botLabel(status)}
              </span>
            </span>
          </button>
        )}
        <div className="flex items-center gap-3 rounded-lg px-3 py-2">
          <User className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm text-foreground" title={status.email}>{status.email}</span>
          <IconButton label="Keluar" onClick={status.onLogout} className="size-8">
            <LogOut className="size-4" />
          </IconButton>
        </div>
      </div>
    </aside>
  );
}

/** Account & WhatsApp menu for phones (the sidebar is hidden there). */
export function MobileAccountMenu(status: StatusProps) {
  const items: MenuItem[] = [
    {
      label: status.phoneNumber ? "Nomor WhatsApp" : "Hubungkan WhatsApp",
      description: status.phoneNumber ? formatPhone(status.phoneNumber) : "Catat transaksi lewat chat",
      icon: <Smartphone className="size-4" />,
      onSelect: status.onPhoneClick,
    },
    ...(status.isAdmin
      ? [{
          label: "Bot WhatsApp",
          description: status.botStopped ? "Dicabut, ketuk untuk menghubungkan" : status.botConnected === false ? "Offline, ketuk untuk scan QR" : botLabel(status),
          icon: <MessageCircle className="size-4" />,
          onSelect: status.onBotClick,
        }]
      : []),
    { label: "Keluar", icon: <LogOut className="size-4" />, onSelect: status.onLogout, danger: true },
  ];
  return (
    <Menu
      items={items}
      header={<p className="truncate text-xs text-muted-foreground">{status.email}</p>}
      footer={
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Tema</p>
          <ThemeSwitcher className="flex w-full" />
        </div>
      }
      trigger={({ triggerProps }) => (
        <IconButton label="Akun" {...triggerProps}>
          <User className="size-5" />
        </IconButton>
      )}
    />
  );
}

/** Bottom tab bar for phones: 4 equal destinations within thumb reach. */
export function BottomTabs({ active, onNavigate, reviewCount }: { active: Tab; onNavigate: (tab: Tab) => void; reviewCount: number }) {
  return (
    <nav aria-label="Navigasi utama"
      // Hidden while the keyboard is open (see useKeyboardOpen): it shrinks the page, the tabs would sit on top of it
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden [html[data-keyboard=open]_&]:hidden">
      <div className="grid grid-cols-4">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const current = active === id;
          return (
            <button key={id} type="button" onClick={() => onNavigate(id)} aria-current={current ? "page" : undefined}
              className={cn("flex h-16 flex-col items-center justify-center gap-1 text-xs transition-colors", focusRing,
                current ? "font-medium text-foreground" : "text-muted-foreground")}>
              <span className="relative">
                <Icon className="size-5" aria-hidden strokeWidth={current ? 2.25 : 1.75} />
                {id === "inbox" && <CountBadge count={reviewCount} className="absolute -top-1.5 left-3.5" />}
              </span>
              {id === "inbox" ? "Tinjau" : label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** Previous/next month. Future months are disabled: they can't contain transactions yet. */
export function MonthSwitcher({ month, year, onChange }: { month: number; year: number; onChange: (month: number, year: number) => void }) {
  const now = new Date();
  const isCurrent = month === now.getMonth() + 1 && year === now.getFullYear();
  const shift = (delta: number) => {
    const d = new Date(year, month - 1 + delta, 1);
    onChange(d.getMonth() + 1, d.getFullYear());
  };
  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center rounded-xl border border-border/70 bg-card">
        <IconButton label="Bulan sebelumnya" onClick={() => shift(-1)}><ChevronLeft className="size-4" /></IconButton>
        <span className="min-w-32 text-center text-sm font-medium capitalize tabular-nums" aria-live="polite">{formatMonth(month, year)}</span>
        <IconButton label="Bulan berikutnya" onClick={() => shift(1)} disabled={isCurrent}><ChevronRight className="size-4" /></IconButton>
      </div>
      {!isCurrent && (
        <Button variant="ghost" size="sm" onClick={() => onChange(now.getMonth() + 1, now.getFullYear())}>Bulan ini</Button>
      )}
    </div>
  );
}

/** Single primary action, with the three things a user can add. */
export function AddMenu({ onAddTransaction, onAddDebt, onAddAccount, onAddBudget }: {
  onAddTransaction: () => void;
  onAddDebt: () => void;
  onAddAccount: () => void;
  onAddBudget: () => void;
}) {
  return (
    <Menu
      items={[
        { label: "Transaksi", description: "Pengeluaran, pemasukan, atau transfer", icon: <ReceiptText className="size-4" />, onSelect: onAddTransaction },
        { label: "Utang-piutang", description: "Talangan, pinjaman, atau dibayar balik", icon: <Handshake className="size-4" />, onSelect: onAddDebt },
        { label: "Rekening", description: "Bank, e-wallet, atau tunai", icon: <Wallet className="size-4" />, onSelect: onAddAccount },
        { label: "Anggaran", description: "Batas pengeluaran per kategori", icon: <Target className="size-4" />, onSelect: onAddBudget },
      ]}
      trigger={({ triggerProps }) => (
        <Button {...triggerProps} aria-label="Tambah">
          <Plus className="size-4" aria-hidden />
          <span className="hidden sm:inline">Tambah</span>
        </Button>
      )}
    />
  );
}
