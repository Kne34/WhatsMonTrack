"use client";

import React, { useEffect, useSyncExternalStore } from "react";
import { EN } from "./i18n-en";

/**
 * Interface language. Indonesian is the source: every text is written in Indonesian and passed through
 * `tr()`, which looks it up in the English dictionary (lib/i18n-en.ts) when English is chosen. A text
 * missing from the dictionary simply stays Indonesian, so nothing ever shows blank.
 *
 *   tr("Hapus rekening {name}?", { name })  ->  "Delete account BCA?"
 *
 * The choice is kept in this browser (localStorage). Changing it re-mounts the app below
 * <LanguageProvider>, so every `tr()` call (also in plain functions) renders again in the new language.
 */
export type Lang = "id" | "en";
export const LANGS: { value: Lang; label: string; native: string }[] = [
  { value: "id", label: "Bahasa Indonesia", native: "Indonesia" },
  { value: "en", label: "English", native: "English" },
];
export const LANG_STORAGE_KEY = "wmt.lang";

/** Chosen during this visit (or read once from storage); wins over storage, which may be unavailable */
let chosen: Lang | null = null;
/** Until the app has hydrated, everything renders Indonesian, exactly like the server HTML */
let hydrated = false;
const listeners = new Set<() => void>();

function readLang(): Lang {
  if (chosen) return chosen;
  try {
    chosen = localStorage.getItem(LANG_STORAGE_KEY) === "en" ? "en" : "id";
    return chosen;
  } catch {
    return "id";
  }
}

export function setLang(lang: Lang) {
  try {
    if (lang === "id") localStorage.removeItem(LANG_STORAGE_KEY);
    else localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch { /* storage unavailable: applies to this visit only */ }
  chosen = lang;
  listeners.forEach((l) => l());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The language being rendered. */
export const getLang = (): Lang => (hydrated ? readLang() : "id");

/**
 * BCP 47 tag for dates and numbers. English uses en-ID, like an iPhone set to English with the region
 * Indonesia: English month names and "4,2K", but the Indonesian Rp 1.250.000 and 24-hour clock.
 */
export const locale = () => (getLang() === "en" ? "en-ID" : "id-ID");

/** Translates an Indonesian text; `{name}` placeholders are filled from `params`. */
export function tr(source: string, params?: Record<string, string | number>): string {
  const text = getLang() === "en" ? (EN[source] ?? source) : source;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, key: string) => (key in params ? String(params[key]) : m));
}

/** Picks the Indonesian or English form directly, for texts built from parts (plurals, word order). */
export const pick = (id: string, en: string) => (getLang() === "en" ? en : id);

export function useLang(): Lang {
  // Server and hydration render Indonesian; the saved choice applies right after
  return useSyncExternalStore(subscribe, getLang, () => "id");
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const lang = useLang();
  useEffect(() => {
    // From here on the saved language applies; telling the store re-renders (and re-mounts) in it
    if (!hydrated) {
      hydrated = true;
      listeners.forEach((l) => l());
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return <React.Fragment key={lang}>{children}</React.Fragment>;
}
