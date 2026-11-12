import type { TxType } from "./format";

/** Filters of the Transaksi page. Empty string = no filter. */
export interface TxFilters {
  type: TxType | "";
  category: string;
  accountId: string;
  q: string;
}

export const NO_FILTERS: TxFilters = { type: "", category: "", accountId: "", q: "" };

export const activeFilterCount = (f: TxFilters) => [f.type, f.category, f.accountId, f.q.trim()].filter(Boolean).length;

/** Query parameters for GET /transactions (the server applies the same rules as `matchesFilters`). */
export const filterParams = (f: TxFilters) => ({
  type: f.type || undefined,
  category: f.category || undefined,
  accountId: f.accountId || undefined,
  q: f.q.trim() || undefined,
});

interface FilterableTx {
  type: TxType;
  category: string | null;
  subcategory?: string | null;
  rawText?: string | null;
  fromAccountId?: string | null;
  toAccountId?: string | null;
}

/** Same rules as the server, for the calendar and the totals that are computed from the month's data. */
export function matchesFilters(tx: FilterableTx, f: TxFilters) {
  if (f.type && tx.type !== f.type) return false;
  if (f.category && (tx.category || "").toUpperCase() !== f.category.toUpperCase()) return false;
  if (f.accountId && tx.fromAccountId !== f.accountId && tx.toAccountId !== f.accountId) return false;
  const q = f.q.trim().toLowerCase();
  if (q && !`${tx.subcategory ?? ""}\n${tx.rawText ?? ""}`.toLowerCase().includes(q)) return false;
  return true;
}
