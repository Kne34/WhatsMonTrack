"use client";

import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format";

/** "Live" with a pulsing dot, or when the price is a stored one, since when */
export function LiveBadge({ stale, at, known = true, className }: { stale: boolean; at?: string; known?: boolean; className?: string }) {
  if (!known) return <span className={className}>Harga belum tersedia</span>;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="relative flex size-2" aria-hidden>
        {!stale && <span className="absolute inline-flex size-full rounded-full bg-income opacity-60 motion-safe:animate-ping" />}
        <span className={cn("relative inline-flex size-2 rounded-full", stale ? "bg-warning" : "bg-income")} />
      </span>
      {stale ? `Tersimpan ${at ? formatTime(at) : ""}`.trim() : "Live"}
    </span>
  );
}
