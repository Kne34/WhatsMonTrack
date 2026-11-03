"use client";

import React, { useSyncExternalStore } from "react";
import { Loader2 } from "lucide-react";
import { isServerWaking, subscribeServerWake } from "@/lib/server-wake";

/** Shown while a request is unusually slow, typically a free server waking up from sleep. */
export default function ServerWakeNotice() {
  const waking = useSyncExternalStore(subscribeServerWake, isServerWaking, () => false);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex justify-center px-4">
      {waking && (
        <div role="status" className="flex max-w-md items-start gap-2.5 rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-lg">
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden />
          <p className="text-foreground">
            Menyalakan server…{" "}
            <span className="text-muted-foreground">Server gratis tidur saat tidak dipakai, jadi bisa sampai 1 menit.</span>
          </p>
        </div>
      )}
    </div>
  );
}
