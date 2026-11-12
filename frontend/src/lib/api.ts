import axios from 'axios';

// Since we setup rewrites in next.config.ts, we can just call /api/... directly
const api = axios.create({
  baseURL: '/api',
});

// Add a request interceptor to attach JWT token
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// --- Auth Endpoints ---

export const register = async (data: object) => {
  const res = await api.post('/auth/register', data);
  return res.data;
};

export const verifyOtp = async (data: object) => {
  const res = await api.post('/auth/verify-otp', data);
  return res.data;
};

export const login = async (data: object) => {
  const res = await api.post('/auth/login', data);
  return res.data;
};

/** Always resolves with the same message whether or not the email exists. */
export const forgotPassword = async (email: string) => {
  const res = await api.post('/auth/forgot-password', { email });
  return res.data;
};

export const resetPassword = async (data: { email: string; otpCode: string; password: string }) => {
  const res = await api.post('/auth/reset-password', data);
  return res.data;
};

/** Checks the signed-in user's password (to show hidden amounts). */
export const verifyPassword = async (password: string): Promise<{ valid: boolean; message?: string }> => {
  const { data } = await api.post('/auth/verify-password', { password });
  return data;
};

export const getProfile = async () => {
  const res = await api.get('/auth/me');
  return res.data;
};

// Helper to fetch transactions, with optional pagination and filters
export const fetchTransactions = async (
  params?: {
    page?: number; limit?: number; month?: number; year?: number; day?: number;
    // Filters (Transaksi page)
    type?: string; category?: string; accountId?: string; q?: string; status?: 'CONFIRMED' | 'NEEDS_REVIEW';
  }
) => {
  const { data } = await api.get('/transactions', { params });
  return data;
};

// ---- Utang-piutang notes (to-do style list, separate from transactions) ----

export type DebtDirection = 'THEY_OWE' | 'I_OWE';

export interface DebtNote {
  id: string;
  person: string;
  /** THEY_OWE: the person owes you. I_OWE: you owe the person. */
  direction: DebtDirection;
  amount: number;
  /** Paid back so far; settled when paid >= amount */
  paid: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DebtNoteInput {
  person: string;
  direction: DebtDirection;
  amount: number;
  paid?: number;
  note?: string;
}

export const fetchDebtNotes = async (): Promise<DebtNote[]> => (await api.get('/debts')).data;
export const createDebtNote = async (input: DebtNoteInput): Promise<DebtNote> => (await api.post('/debts', input)).data;
export const updateDebtNote = async (id: string, input: Partial<DebtNoteInput> & { settled?: boolean }): Promise<DebtNote> =>
  (await api.put(`/debts/${id}`, input)).data;
export const deleteDebtNote = async (id: string) => (await api.delete(`/debts/${id}`)).data;

// Helper to fetch accounts
export const fetchAccounts = async () => {
  const { data } = await api.get('/accounts');
  return data;
};

// Helper to create an account
export const createAccount = async (
  name: string,
  type: string,
  initialBalance: number
) => {
  const { data } = await api.post('/accounts', { name, type, initialBalance });
  return data;
};

// Helper to update an account
export const updateAccount = async (id: string, accountData: object) => {
  const { data } = await api.put(`/accounts/${id}`, accountData);
  return data;
};

// Helper to delete an account
/**
 * Deletes an account. One that transactions still use is refused (409 with `transactionCount`)
 * unless `withTransactions` also deletes those transactions, correcting the other accounts' balances.
 */
export const deleteAccount = async (id: string, withTransactions = false) => {
  const { data } = await api.delete(`/accounts/${id}`, { params: withTransactions ? { withTransactions: true } : undefined });
  return data;
};

// Helper to fetch budgets
export const fetchBudgets = async () => {
  const { data } = await api.get('/budgets');
  return data;
};

// Helper to upsert a budget
export const setBudget = async (
  categoryName: string,
  limit: number
) => {
  const { data } = await api.post('/budgets', { categoryName, limit });
  return data;
};

// Helper to delete a budget
export const deleteBudget = async (id: string) => {
  const { data } = await api.delete(`/budgets/${id}`);
  return data;
};
// Helper to confirm a transaction
export const confirmTransaction = async (id: string) => {
  const { data } = await api.put(`/transactions/${id}/confirm`);
  return data;
};

export const updateTransaction = async (id: string, data: object) => {
  const response = await api.put(`/transactions/${id}`, data);
  return response.data;
};

// Helper to delete a transaction
export const deleteTransaction = async (id: string) => {
  const { data } = await api.delete(`/transactions/${id}`);
  return data;
};

// --- WhatsApp bot (shared) ---
/** connecting | waiting_qr (QR ready to scan) | connected | stopped (unlinked on purpose by an admin) */
export type BotState = 'connecting' | 'waiting_qr' | 'connected' | 'stopped';

export interface WhatsAppStatus {
  connected: boolean;
  state: BotState;
  /** QR code to link the bot (admins only) */
  qr: string;
  /** The bot's number while connected (admins only) */
  botPhone: string | null;
  canManage?: boolean;
}

export const fetchWhatsAppStatus = async (): Promise<WhatsAppStatus> => {
  const { data } = await api.get('/whatsapp/status');
  return data;
};

/** Change the bot number: logs the current number out and shows a new QR code. */
export const resetWhatsAppSession = async () => {
  const { data } = await api.post('/whatsapp/reset');
  return data;
};

/** Unlink the bot number; the bot stays off (also after restarts) until started again. */
export const stopWhatsAppBot = async () => {
  const { data } = await api.post('/whatsapp/stop');
  return data;
};

/** Turn the bot back on after it was unlinked; a QR code appears. */
export const startWhatsAppBot = async () => {
  const { data } = await api.post('/whatsapp/start');
  return data;
};

// --- Linking the user's WhatsApp number ---
export interface PhoneLinkInfo {
  code: string;
  /** The exact text to send to the bot, e.g. "VERIFIKASI K7Q2MX" */
  message: string;
  botPhone: string;
  /** wa.me link that opens a chat with the bot with `message` pre-filled */
  waLink: string;
  expiresAt: string;
  pendingPhone: string | null;
}

export interface PhoneStatus {
  phoneNumber: string | null;
  botConnected: boolean;
  pending: PhoneLinkInfo | null;
}

export const fetchPhoneStatus = async (): Promise<PhoneStatus> => {
  const { data } = await api.get('/phone');
  return data;
};

/** `phoneNumber` is optional: when given, only that number can complete the link. */
export const startPhoneLink = async (phoneNumber?: string): Promise<PhoneLinkInfo> => {
  const { data } = await api.post('/phone/link', phoneNumber ? { phoneNumber } : {});
  return data;
};

export const unlinkPhone = async () => {
  const { data } = await api.delete('/phone');
  return data;
};

// --- Web chat with the bot (same logic as WhatsApp; no bot number needed) ---
export interface ChatMessage {
  id: string;
  fromBot: boolean;
  text: string;
  createdAt: string;
}

export const fetchChat = async (): Promise<ChatMessage[]> => {
  const { data } = await api.get('/chat');
  return data;
};

/** Sends a message to the bot; resolves with the saved message and the bot's reply. */
export const sendChat = async (text: string): Promise<{ message: ChatMessage; reply: ChatMessage }> => {
  const { data } = await api.post('/chat', { text });
  return data;
};

/** Clears the chat history; recorded transactions stay. */
export const clearChat = async () => {
  const { data } = await api.delete('/chat');
  return data;
};

// Helper to create a transaction manually
export const createTransaction = async (txData: object) => {
  const { data } = await api.post('/transactions/manual', { data: txData });
  return data;
};

export default api;
