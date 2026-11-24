"use client";

import React from "react";
import { Card, Skeleton } from "../common/ui";
import { useSidebarCollapsed, type Tab } from "./shared/Navigation";
import { cn } from "@/lib/utils";

import { tr } from "@/lib/i18n";
/**
 * Loading placeholders that mirror the real layout of each page, so nothing jumps when the data
 * arrives. The blocks are hidden from screen readers; the wrapper announces what is loading.
 */
function Loading({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className} aria-busy="true">
      <span role="status" className="sr-only">{label}</span>
      {children}
    </div>
  );
}

function CardHeaderSkeleton({ action }: { action?: boolean }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="space-y-2">
        <Skeleton className="h-4 w-28 rounded-md" />
        <Skeleton className="h-3 w-44 rounded-md" />
      </div>
      {action && <Skeleton className="h-8 w-24 rounded-lg" />}
    </div>
  );
}

function ListRowsSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-3 py-2.5">
          <Skeleton className="h-4 w-24 rounded-md" />
          <Skeleton className="h-4 w-20 rounded-md" />
        </div>
      ))}
    </div>
  );
}

export function HomeSkeleton() {
  return (
    <Loading label={tr("Memuat ringkasan")} className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-4 w-20 rounded-md" />
            <Skeleton className="mt-3 h-7 w-32 rounded-md" />
            <Skeleton className="mt-2 h-3 w-16 rounded-md" />
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {[0, 1].map((i) => (
            <Card key={i}>
              <CardHeaderSkeleton />
              <Skeleton className="h-56" />
            </Card>
          ))}
          <Card>
            <CardHeaderSkeleton action />
            <div className="space-y-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="flex justify-between gap-3">
                    <Skeleton className="h-4 w-24 rounded-md" />
                    <Skeleton className="h-4 w-28 rounded-md" />
                  </div>
                  <Skeleton className="h-1.5 rounded-full" />
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeaderSkeleton />
            <ListRowsSkeleton rows={4} />
          </Card>
          <Card>
            <CardHeaderSkeleton />
            <div className="space-y-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="flex justify-between gap-3">
                    <Skeleton className="h-4 w-20 rounded-md" />
                    <Skeleton className="h-3 w-28 rounded-md" />
                  </div>
                  <Skeleton className="h-1.5 rounded-full" />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </Loading>
  );
}

/** Rows of the transaction list; also used alone when only the day or page changes. */
export function LedgerRowsSkeleton({ rows }: { rows: number }) {
  return (
    <Loading label={tr("Memuat transaksi")}>
      <ul className="divide-y divide-border/70">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="flex items-center gap-4 px-5 py-3.5">
            <Skeleton className="hidden h-4 w-20 rounded-md lg:block" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-36 max-w-full rounded-md" />
              <Skeleton className="h-3 w-24 rounded-md" />
            </div>
            <Skeleton className="hidden h-4 w-16 rounded-md lg:block" />
            <Skeleton className="h-4 w-20 rounded-md" />
          </li>
        ))}
      </ul>
    </Loading>
  );
}

export function LedgerSkeleton() {
  return (
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
      <Card className="p-4" aria-hidden>
        <Skeleton className="mb-4 h-4 w-24 rounded-md" />
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }, (_, i) => <Skeleton key={i} className="h-11 rounded-lg" />)}
        </div>
        <Skeleton className="mt-3 h-3 w-40 rounded-md" />
      </Card>
      <Card className="p-0">
        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-28 rounded-md" />
            <Skeleton className="h-3 w-20 rounded-md" />
          </div>
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
        <LedgerRowsSkeleton rows={6} />
      </Card>
    </div>
  );
}

export function InboxSkeleton() {
  return (
    <Loading label={tr("Memuat transaksi yang perlu ditinjau")} className="space-y-4">
      <Skeleton className="h-4 w-80 max-w-full rounded-md" />
      {[0, 1].map((i) => (
        <Card key={i} className="p-0">
          <div className="space-y-2 border-b border-border/70 px-5 py-3">
            <Skeleton className="h-3 w-40 rounded-md" />
            <Skeleton className="h-4 w-56 max-w-full rounded-md" />
          </div>
          <div className="px-5 py-4">
            <Skeleton className="h-6 w-32 rounded-md" />
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[0, 1, 2].map((j) => (
                <div key={j} className="space-y-1.5">
                  <Skeleton className="h-3 w-12 rounded-md" />
                  <Skeleton className="h-4 w-20 rounded-md" />
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Skeleton className="h-8 w-16 rounded-lg" />
              <Skeleton className="h-8 w-16 rounded-lg" />
              <Skeleton className="h-8 w-24 rounded-lg" />
            </div>
          </div>
        </Card>
      ))}
    </Loading>
  );
}

export function ChatSkeleton() {
  return (
    <Loading label={tr("Memuat chat")} className="flex h-[calc(100dvh-15rem)] min-h-[420px] flex-col rounded-2xl border border-border/70 bg-card shadow-sm md:h-[calc(100dvh-11rem)]">
      <div className="space-y-2 border-b border-border/70 px-5 py-3.5">
        <Skeleton className="h-4 w-32 rounded-md" />
        <Skeleton className="h-3 w-72 max-w-full rounded-md" />
      </div>
      <div className="flex-1 space-y-3 px-5 py-4">
        {[["ml-auto", "w-40"], ["", "w-64"], ["ml-auto", "w-32"], ["", "w-56"]].map(([side, width], i) => (
          <Skeleton key={i} className={`h-12 max-w-[85%] rounded-2xl ${side} ${width}`} />
        ))}
      </div>
      <div className="flex gap-2 border-t border-border/70 p-3">
        <Skeleton className="h-10 flex-1 rounded-xl" />
        <Skeleton className="size-10 rounded-xl" />
      </div>
    </Loading>
  );
}

export function PageSkeleton({ tab }: { tab: Tab }) {
  if (tab === "transactions") return <LedgerSkeleton />;
  if (tab === "chat") return <ChatSkeleton />;
  if (tab === "inbox" || tab === "debts" || tab === "investments") return <InboxSkeleton />;
  return <HomeSkeleton />;
}

/** Whole app frame while the session is being restored (before the dashboard itself mounts). */
export function AppShellSkeleton({ tab }: { tab: Tab }) {
  // The Chart page: a narrow sidebar of icons and the chart filling the screen
  if (tab === "chart") {
    return (
      <div className="min-h-screen bg-background" aria-hidden>
        <aside className="fixed inset-y-0 left-0 hidden w-16 flex-col items-center gap-3 border-r border-border/70 bg-card py-3 md:flex">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="size-9 rounded-[10px]" />)}
        </aside>
        <div className="flex h-dvh flex-col gap-1 p-1 md:pl-[68px]">
          <Skeleton className="h-12 w-full rounded-lg" />
          <div className="flex min-h-0 flex-1 gap-1"><Skeleton className="flex-1 rounded-lg" /><Skeleton className="hidden w-80 rounded-lg lg:block" /></div>
        </div>
      </div>
    );
  }
  return <ShellSkeleton tab={tab} />;
}

/** Same widths as the real sidebar (icons only or with names), so nothing jumps when the app loads */
function ShellSkeleton({ tab }: { tab: Tab }) {
  const collapsed = useSidebarCollapsed("normal");
  return (
    <div className="min-h-screen bg-background">
      <aside className={cn("fixed inset-y-0 left-0 hidden flex-col border-r border-black/[0.06] bg-[#F6F6F8] pt-4 md:flex dark:border-white/[0.08] dark:bg-[#1C1C1E]", collapsed ? "w-16 items-center" : "w-60 px-5")} aria-hidden>
        <Skeleton className={collapsed ? "size-9 rounded-lg" : "h-6 w-36 rounded-md"} />
        <div className={cn("mt-8 space-y-3", collapsed && "flex flex-col items-center")}>
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className={collapsed ? "size-9 rounded-lg" : "h-8 rounded-lg"} />)}
        </div>
      </aside>
      <div className={collapsed ? "md:pl-16" : "md:pl-60"}>
        <div className="flex h-[53px] items-center justify-between border-b border-border/70 bg-card px-4 md:hidden" aria-hidden>
          <Skeleton className="h-5 w-32 rounded-md" />
          <Skeleton className="size-8 rounded-lg" />
        </div>
        <main className="mx-auto w-full max-w-6xl px-4 pt-6 pb-28 sm:px-6 md:pt-8 md:pb-12">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3" aria-hidden>
            <Skeleton className="h-8 w-40 rounded-lg" />
            <div className="flex gap-2">
              <Skeleton className="h-10 w-48 rounded-xl" />
              <Skeleton className="h-10 w-24 rounded-xl" />
            </div>
          </div>
          <PageSkeleton tab={tab} />
        </main>
      </div>
    </div>
  );
}
