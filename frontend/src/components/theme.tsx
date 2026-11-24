"use client";

import React, { useEffect, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing, SEGMENT_THUMB } from "./common/ui";
import { DARK_QUERY, THEME_STORAGE_KEY } from "@/lib/theme-script";
import { tr } from "@/lib/i18n";
import { ActiveIndicator } from "./motion/primitives";

export type ThemePref = "system" | "light" | "dark";

const STORAGE_KEY = THEME_STORAGE_KEY;

const listeners = new Set<() => void>();

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function applyTheme(pref: ThemePref) {
  const root = document.documentElement;
  const dark = pref === "dark" || (pref === "system" && window.matchMedia(DARK_QUERY).matches);
  // Switch instantly: animating every color at once looks janky
  root.classList.add("theme-switching");
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, pref);
  } catch { /* storage unavailable: still apply for this session */ }
  applyTheme(pref);
  listeners.forEach((l) => l());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Current preference; "system" during server rendering. */
export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, readPref, () => "system");
}

/** Keeps "Sistem" in sync when the OS switches between light and dark while the app is open. */
export function ThemeWatcher() {
  useEffect(() => {
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = () => readPref() === "system" && applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return null;
}

/** Labels are Indonesian sources, shown through tr() */
const OPTIONS: { value: ThemePref; label: string; icon: React.ElementType }[] = [
  { value: "system", label: "Sistem", icon: Monitor },
  { value: "light", label: "Terang", icon: Sun },
  { value: "dark", label: "Gelap", icon: Moon },
];

/** Three-way theme control. `compact` shows icons only (labels stay available to screen readers). */
export function ThemeSwitcher({ compact = false, className }: { compact?: boolean; className?: string }) {
  const pref = useThemePref();
  const thumb = React.useId();
  return (
    // Same iOS segmented control as SegmentedControl (common/ui). Apple HIG: equal-width segments, and text
    // or icons, not both: compact shows icons, otherwise words
    <div role="radiogroup" aria-label={tr("Tema tampilan")} className={cn("inline-grid auto-cols-fr grid-flow-col rounded-[9px] bg-[#767680]/[0.12] p-0.5 dark:bg-[#767680]/[0.24]", className)}>
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const active = pref === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            title={tr(label)}
            onClick={() => setThemePref(value)}
            className={cn(
              "relative isolate flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] text-[13px] font-medium transition-colors duration-200",
              compact ? "size-7" : "px-3 py-1.5",
              focusRing,
              active ? "text-foreground" : "text-foreground/80 hover:text-foreground",
            )}
          >
            {active && <ActiveIndicator layoutId={thumb} className={SEGMENT_THUMB} />}
            {compact && <Icon className="size-3.5" aria-hidden />}
            <span className={compact ? "sr-only" : undefined}>{tr(label)}</span>
          </button>
        );
      })}
    </div>
  );
}
