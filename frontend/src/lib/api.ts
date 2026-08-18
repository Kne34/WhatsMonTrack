import axios from 'axios';

// Since we setup rewrites in next.config.ts, we can just call /api/... directly
const api = axios.create({
  baseURL: '/api',
});

// Helper to fetch transactions for a given phone number, with optional pagination and filters
export const fetchTransactions = async (
  phoneNumber: string = process.env.NEXT_PUBLIC_DEFAULT_PHONE_NUMBER || '',
  params?: { page?: number; limit?: number; month?: number; year?: number; day?: number }
) => {
  const { data } = await api.get('/transactions', { params: { phoneNumber, ...params } });
  return data;
};

// Helper to fetch accounts
export const fetchAccounts = async (phoneNumber: string = process.env.NEXT_PUBLIC_DEFAULT_PHONE_NUMBER || '') => {
  const { data } = await api.get('/accounts', { params: { phoneNumber } });
  return data;
};

// Helper to create an account
export const createAccount = async (
  name: string,
  type: string,
  initialBalance: number,
  phoneNumber: string = process.env.NEXT_PUBLIC_DEFAULT_PHONE_NUMBER || ''
) => {
  const { data } = await api.post('/accounts', { phoneNumber, name, type, initialBalance });
  return data;
};

// Helper to update an account
export const updateAccount = async (id: string, accountData: any) => {
  const { data } = await api.put(`/accounts/${id}`, accountData);
  return data;
};

// Helper to delete an account
export const deleteAccount = async (id: string) => {
  const { data } = await api.delete(`/accounts/${id}`);
  return data;
};

// Helper to fetch budgets
export const fetchBudgets = async (phoneNumber: string = process.env.NEXT_PUBLIC_DEFAULT_PHONE_NUMBER || '') => {
  const { data } = await api.get('/budgets', { params: { phoneNumber } });
  return data;
};

// Helper to upsert a budget
export const setBudget = async (
  categoryName: string,
  limit: number,
  phoneNumber: string = process.env.NEXT_PUBLIC_DEFAULT_PHONE_NUMBER || ''
) => {
  const { data } = await api.post('/budgets', { phoneNumber, categoryName, limit });
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

export const updateTransaction = async (id: string, data: any) => {
  const response = await api.put(`/transactions/${id}`, data);
  return response.data;
};

// Helper to delete a transaction
export const deleteTransaction = async (id: string) => {
  const { data } = await api.delete(`/transactions/${id}`);
  return data;
};

// --- WhatsApp Setup ---
export const fetchWhatsAppStatus = async () => {
  const { data } = await api.get('/whatsapp/status');
  return data;
};

export const resetWhatsAppSession = async () => {
  const { data } = await api.post('/whatsapp/reset');
  return data;
};

// Helper to create a transaction manually
export const createTransaction = async (txData: any, phoneNumber: string = process.env.NEXT_PUBLIC_DEFAULT_PHONE_NUMBER || '') => {
  const { data } = await api.post('/transactions/manual', { phoneNumber, data: txData });
  return data;
};

export default api;
