const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });

/** Rp 1.250.000 */
export const formatRupiah = (value: number) => rupiah.format(value);

/** 1,3 jt · 250 rb — for chart axes, where full amounts don't fit. */
export const formatCompact = (value: number) => (value === 0 ? "0" : compact.format(value));

/** "November 2026" */
export const formatMonth = (month: number, year: number) =>
  new Date(year, month - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });

/** "5 Nov" */
export const formatDayMonth = (date: Date | string) =>
  new Date(date).toLocaleDateString("id-ID", { day: "numeric", month: "short" });

/** "14.05" */
export const formatTime = (date: Date | string) =>
  new Date(date).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

/** 6281234567890 -> +62 812-3456-7890 */
export const formatPhone = (phone: string) => {
  const local = phone.startsWith("62") ? phone.slice(2) : phone;
  const groups = local.match(/^(\d{3})(\d{4})(\d+)$/);
  return groups ? `+62 ${groups[1]}-${groups[2]}-${groups[3]}` : `+${phone}`;
};

/** Category codes produced by the WhatsApp parser, with Indonesian labels. */
export const CATEGORIES: Record<string, string> = {
  FOOD: "Makanan",
  TRANSPORT: "Transportasi",
  SHOPPING: "Belanja",
  BILLS: "Tagihan",
  HEALTH: "Kesehatan",
  ENTERTAINMENT: "Hiburan",
  INCOME: "Pemasukan",
  OTHER: "Lainnya",
  UNCATEGORIZED: "Tanpa kategori",
};

export const categoryLabel = (code: string | null | undefined) => {
  if (!code) return CATEGORIES.UNCATEGORIZED;
  const upper = code.toUpperCase();
  return CATEGORIES[upper] ?? upper.charAt(0) + upper.slice(1).toLowerCase();
};

export type TxType = "EXPENSE" | "INCOME" | "TRANSFER";

export const TX_TYPE_LABEL: Record<TxType, string> = {
  EXPENSE: "Pengeluaran",
  INCOME: "Pemasukan",
  TRANSFER: "Transfer",
};
