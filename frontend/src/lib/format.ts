import { locale, tr } from "./i18n";

const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const compacts = new Map<string, Intl.NumberFormat>();
const compact = () => {
  const l = locale();
  if (!compacts.has(l)) compacts.set(l, new Intl.NumberFormat(l, { notation: "compact", maximumFractionDigits: 1 }));
  return compacts.get(l)!;
};

/** Rp 1.250.000 */
export const formatRupiah = (value: number) => rupiah.format(value);

/** 1,3 jt or 250 rb (English: 1,3M, 250K), for chart axes, where full amounts don't fit. */
export const formatCompact = (value: number) => (value === 0 ? "0" : compact().format(value));

/** "November 2026" */
export const formatMonth = (month: number, year: number) =>
  new Date(year, month - 1, 1).toLocaleDateString(locale(), { month: "long", year: "numeric" });

/** "5 Nov" */
export const formatDayMonth = (date: Date | string) =>
  new Date(date).toLocaleDateString(locale(), { day: "numeric", month: "short" });

/** "14.05" */
export const formatTime = (date: Date | string) =>
  new Date(date).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });

/** 6281234567890 -> +62 812-3456-7890 */
export const formatPhone = (phone: string) => {
  const local = phone.startsWith("62") ? phone.slice(2) : phone;
  const groups = local.match(/^(\d{3})(\d{4})(\d+)$/);
  return groups ? `+62 ${groups[1]}-${groups[2]}-${groups[3]}` : `+${phone}`;
};

/** Category codes produced by the WhatsApp parser, with their labels (translated on read). */
export const CATEGORIES: Record<string, string> = {
  get FOOD() { return tr("Makanan"); },
  get TRANSPORT() { return tr("Transportasi"); },
  get SHOPPING() { return tr("Belanja"); },
  get BILLS() { return tr("Tagihan"); },
  get HEALTH() { return tr("Kesehatan"); },
  get ENTERTAINMENT() { return tr("Hiburan"); },
  get INCOME() { return tr("Pemasukan"); },
  get OTHER() { return tr("Lainnya"); },
  get UNCATEGORIZED() { return tr("Tanpa kategori"); },
};

export const categoryLabel = (code: string | null | undefined) => {
  if (!code) return CATEGORIES.UNCATEGORIZED;
  const upper = code.toUpperCase();
  return CATEGORIES[upper] ?? upper.charAt(0) + upper.slice(1).toLowerCase();
};

/** Categories an expense can have, e.g. the real expense of a settled talangan (everything but INCOME). */
export const SPENDING_CATEGORIES = ["FOOD", "TRANSPORT", "SHOPPING", "BILLS", "HEALTH", "ENTERTAINMENT", "OTHER"];

/**
 * Counted in income/expense totals, charts and budgets. Talangan and debt payments move money (balances
 * change) but are not income or spending until their Utang-piutang record is settled.
 */
export const inReports = (t: { inReports?: boolean }) => t.inReports !== false;

export type TxType = "EXPENSE" | "INCOME" | "TRANSFER";

export const TX_TYPE_LABEL: Record<TxType, string> = {
  get EXPENSE() { return tr("Pengeluaran"); },
  get INCOME() { return tr("Pemasukan"); },
  get TRANSFER() { return tr("Transfer"); },
};
