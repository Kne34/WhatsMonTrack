"use client";

import React, { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { IconButton } from "../../common/ui";
import { UnlockDialog } from "../dialogs";

import { tr } from "@/lib/i18n";
/**
 * Every section has its own eye: hiding one never hides or shows another. Each choice is remembered
 * in this browser (localStorage), and showing a hidden section asks for the account password every time.
 */
export const PRIVACY_SECTIONS = {
  balance: { key: "wmt.hideBalances", get label() { return tr("saldo total"); } },
  accounts: { key: "wmt.hideAccounts", get label() { return tr("saldo rekening"); } },
  income: { key: "wmt.hideIncome", get label() { return tr("pemasukan"); } },
  expense: { key: "wmt.hideExpense", get label() { return tr("pengeluaran"); } },
  net: { key: "wmt.hideNet", get label() { return tr("selisih"); } },
  debt: { key: "wmt.hideDebt", get label() { return tr("utang-piutang di Dashboard"); } },
  debtSummary: { key: "wmt.hideDebtSummary", get label() { return tr("total utang-piutang"); } },
  debtList: { key: "wmt.hideDebtList", get label() { return tr("daftar utang-piutang"); } },
  portfolio: { key: "wmt.hidePortfolio", get label() { return tr("ringkasan investasi"); } },
  allocation: { key: "wmt.hideAllocation", get label() { return tr("alokasi investasi"); } },
  holdings: { key: "wmt.hideHoldings", get label() { return tr("daftar investasi"); } },
} as const;
export type PrivacySection = keyof typeof PRIVACY_SECTIONS;

export const MASK = "Rp ••••••";
/** Mask for amounts that are not rupiah (US$ prices, quantities) */
export const MASK_PLAIN = "••••••";

export function usePrivacy<K extends PrivacySection>(sections: readonly K[]) {
  const [hidden, setHidden] = useState<Partial<Record<K, boolean>>>({});
  const [unlocking, setUnlocking] = useState<K | null>(null);

  useEffect(() => {
    const next: Partial<Record<K, boolean>> = {};
    try {
      for (const s of sections) next[s] = localStorage.getItem(PRIVACY_SECTIONS[s].key) === "1";
    } catch { /* storage unavailable: everything shown */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser-only preferences after mount
    setHidden(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the list of sections is fixed per view
  }, []);

  const store = (s: K, value: boolean) => {
    setHidden((h) => ({ ...h, [s]: value }));
    try { localStorage.setItem(PRIVACY_SECTIONS[s].key, value ? "1" : "0"); } catch { /* ignore */ }
  };
  // Hiding is instant; showing asks for the password
  const toggle = (s: K) => (hidden[s] ? setUnlocking(s) : store(s, true));
  const isHidden = (s: K) => !!hidden[s];
  /** Formats an amount, or the mask while the section is hidden. */
  const show = (s: K, text: string) => (hidden[s] ? MASK : text);

  const eye = (s: K, className?: string) => (
    <IconButton
      label={hidden[s] ? tr("Tampilkan {label}", { label: PRIVACY_SECTIONS[s].label }) : tr("Sembunyikan {label}", { label: PRIVACY_SECTIONS[s].label })}
      aria-pressed={!!hidden[s]}
      onClick={() => toggle(s)}
      className={className ?? "-my-2 -mr-2 size-8"}
    >
      {hidden[s] ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </IconButton>
  );

  const unlockDialog = unlocking ? (
    <UnlockDialog what={PRIVACY_SECTIONS[unlocking].label} onClose={() => setUnlocking(null)} onUnlocked={() => store(unlocking, false)} />
  ) : null;

  return { isHidden, show, eye, unlockDialog };
}
