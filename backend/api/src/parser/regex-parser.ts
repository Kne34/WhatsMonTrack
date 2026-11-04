import type { ParseResult, ParsedMessage } from './parser.service';

/**
 * Offline fallback used when Gemini is unavailable (no key, quota, outage). It only understands
 * simple messages such as "makan siang 25rb pakai BCA" or "transfer 100rb dari BCA ke GoPay", and its
 * results are always drafts (confidence 0.5), so the user confirms them on the dashboard.
 */

export const NOT_UNDERSTOOD_REPLY =
  'Maaf, pesan ini belum bisa saya pahami sebagai transaksi.\n' +
  'Tulis nominal dan rekeningnya, misalnya: *Makan siang 25rb pakai BCA* atau *Transfer 100rb dari BCA ke GoPay*.\n' +
  'Ketik /rekap untuk melihat rekap bulan ini.';

const REGEX_CONFIDENCE = 0.5;

/** Common account names, so a known name the user does not own yet gets a clear "not found" reply. */
const COMMON_ACCOUNTS = ['BCA', 'BRI', 'BNI', 'MANDIRI', 'BSI', 'JAGO', 'SEABANK', 'GOPAY', 'OVO', 'DANA', 'SHOPEEPAY', 'LINKAJA', 'CASH', 'TUNAI'];

const UNITS: Record<string, number> = { k: 1e3, rb: 1e3, ribu: 1e3, jt: 1e6, juta: 1e6, m: 1e9, miliar: 1e9, milyar: 1e9 };
const SLANG_AMOUNTS: Record<string, number> = { gocap: 50_000, ceban: 10_000, goceng: 5_000, seceng: 1_000, gopek: 500, cepek: 100, sejuta: 1e6 };

const TRANSFER_WORDS = /\b(transfer|tf|trf|top ?up|topup|isi saldo|pindah(?:kan)? (?:dana|uang|saldo))\b/i;
// "masuk" alone is ambiguous ("masuk review", "masuk angin"); only "masuk ke/di <account>" means income
const INCOME_WORDS = /\b(gaji|gajian|terima|diterima|nerima|pemasukan|pendapatan|bonus|thr|cashback|refund|dikasih|dapat uang|dapet uang)\b|\bmasuk\s+(ke|di)\b/i;
const FROM_MARKERS = new Set(['dari', 'pakai', 'pake', 'via', 'from', 'lewat']);
const TO_MARKERS = new Set(['ke', 'to', 'up', 'topup', 'isi']);
const FILLER = new Set(['pakai', 'pake', 'via', 'dari', 'ke', 'lewat', 'dengan', 'from', 'to', 'rp', 'sebesar', 'senilai', 'saldo', 'rekening']);

const CATEGORY_WORDS: [string, RegExp][] = [
  ['FOOD', /\b(makan|makanan|minum|kopi|jajan|sarapan|nasi|bakso|mie|ayam|snack|cemilan|gofood|grabfood|resto|warteg|kantin|teh|boba)\b/i],
  ['TRANSPORT', /\b(ojek|ojol|gojek|grab|bensin|bbm|parkir|tol|kereta|krl|mrt|busway|bus|taksi|angkot|tiket pesawat)\b/i],
  ['BILLS', /\b(listrik|pln|pulsa|kuota|internet|wifi|pdam|air|sewa|kos|kost|cicilan|tagihan|bpjs|asuransi)\b/i],
  ['HEALTH', /\b(obat|dokter|apotek|klinik|rumah sakit|vitamin)\b/i],
  ['ENTERTAINMENT', /\b(nonton|bioskop|film|game|netflix|spotify|konser|liburan)\b/i],
  ['SHOPPING', /\b(belanja|baju|sepatu|celana|tas|shopee|tokopedia|lazada|indomaret|alfamart|supermarket)\b/i],
];

const normalize = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
const ALIASES: Record<string, string[]> = { CASH: ['TUNAI', 'UANGTUNAI'], TUNAI: ['CASH', 'UANGTUNAI'] };

interface Mention { name: string; start: number; end: number }

/** Finds account names (the user's own first, then common ones) as whole words, 1–3 words long. */
function findAccounts(words: string[], accountNames: string[]): Mention[] {
  const known = new Map<string, string>(); // normalized -> display name
  for (const name of [...accountNames, ...COMMON_ACCOUNTS]) {
    const key = normalize(name);
    if (!key || known.has(key)) continue;
    known.set(key, name);
  }
  for (const [key, aliases] of Object.entries(ALIASES)) {
    const owned = accountNames.find((n) => normalize(n) === key);
    if (owned) for (const a of aliases) known.set(a, owned);
  }
  const mentions: Mention[] = [];
  for (let i = 0; i < words.length; i++) {
    for (let len = 3; len >= 1; len--) {
      if (i + len > words.length) continue;
      const name = known.get(normalize(words.slice(i, i + len).join('')));
      if (name) {
        mentions.push({ name, start: i, end: i + len });
        i += len - 1;
        break;
      }
    }
  }
  return mentions;
}

/** "25rb", "1,5jt", "1.500.000", "Rp25.000", "ceban". Returns the amount and the word index it came from. */
function findAmount(words: string[]): { amount: number; index: number } | null {
  let fallback: { amount: number; index: number } | null = null;
  for (let i = 0; i < words.length; i++) {
    const w = words[i].toLowerCase().replace(/^rp\.?/, '').replace(/[.,-]+$/, '');
    if (SLANG_AMOUNTS[w]) return { amount: SLANG_AMOUNTS[w], index: i };
    const m = /^(\d[\d.,]*)(k|rb|ribu|jt|juta|m|miliar|milyar)?$/.exec(w);
    if (!m) continue;
    let unit = m[2];
    let next = false;
    if (!unit && UNITS[words[i + 1]?.toLowerCase()]) {
      unit = words[i + 1].toLowerCase(); // "25 rb"
      next = true;
    }
    const digits = m[1].replace(/[.,]$/, '');
    let value: number;
    if (/^\d{1,3}([.,]\d{3})+$/.test(digits) && !unit) {
      value = Number(digits.replace(/[.,]/g, '')); // 1.500.000
    } else {
      const parts = digits.split(/[.,]/);
      value = parts.length > 2 ? Number(parts.join('')) : Number(parts.join('.')); // 1,5jt
    }
    if (!Number.isFinite(value) || value <= 0) continue;
    const amount = Math.round(value * (unit ? UNITS[unit] : 1));
    const found = { amount, index: next ? i + 1 : i };
    if (unit) return found;
    fallback ??= found;
  }
  return fallback;
}

export function parseWithRegex(text: string, accountNames: string[] = []): ParseResult {
  const words = text.replace(/[^\p{L}\p{N}.,\s-]/gu, ' ').split(/\s+/).filter(Boolean);
  const amount = findAmount(words);
  if (!amount) return { source: 'regex_fallback', status: 'error', message: NOT_UNDERSTOOD_REPLY };

  const mentions = findAccounts(words, accountNames);
  const lower = words.map((w) => w.toLowerCase());
  const before = (m: Mention) => lower[m.start - 1];

  let type: ParsedMessage['type'] = 'EXPENSE';
  if (TRANSFER_WORDS.test(text)) type = 'TRANSFER';
  else if (INCOME_WORDS.test(text)) type = 'INCOME';

  const data: ParsedMessage = { isTransaction: true, type, amount: amount.amount, confidence: REGEX_CONFIDENCE };
  if (type === 'TRANSFER') {
    // "dari X ke Y" / "top up Y pakai X"; otherwise first mention is the source, the next one the destination
    const from = mentions.find((m) => FROM_MARKERS.has(before(m)));
    const to = mentions.find((m) => m !== from && TO_MARKERS.has(before(m)));
    const rest = mentions.filter((m) => m !== from && m !== to);
    const src = from ?? rest.shift();
    const dst = to ?? rest.find((m) => m.name !== src?.name);
    data.fromAccount = src?.name;
    // Never guess "BCA -> BCA": without a different destination the bot asks for both accounts
    data.toAccount = dst && dst.name !== src?.name ? dst.name : undefined;
    data.category = 'OTHER';
  } else if (type === 'INCOME') {
    data.toAccount = (mentions.find((m) => TO_MARKERS.has(before(m))) ?? mentions[0])?.name;
    data.category = 'INCOME';
  } else {
    data.fromAccount = (mentions.find((m) => FROM_MARKERS.has(before(m))) ?? mentions[0])?.name;
    data.category = CATEGORY_WORDS.find(([, re]) => re.test(text))?.[0] ?? 'OTHER';
  }

  // What is left after removing the amount, account names and filler words describes the item
  const used = new Set<number>([amount.index]);
  if (UNITS[lower[amount.index]]) used.add(amount.index - 1);
  for (const m of mentions) for (let i = m.start; i < m.end; i++) used.add(i);
  const item = words
    .filter((w, i) => !used.has(i) && !FILLER.has(w.toLowerCase()))
    .join(' ')
    .replace(/^[\s.,-]+|[\s.,-]+$/g, '')
    .slice(0, 100);
  data.subcategory = item || 'Lainnya';

  return { source: 'regex_fallback', status: 'success', data };
}
