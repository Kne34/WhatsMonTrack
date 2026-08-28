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

export const register = async (data: any) => {
  const res = await api.post('/auth/register', data);
  return res.data;
};

export const verifyOtp = async (data: any) => {
  const res = await api.post('/auth/verify-otp', data);
  return res.data;
};

export const login = async (data: any) => {
  const res = await api.post('/auth/login', data);
  return res.data;
};

export const getProfile = async () => {
  const res = await api.get('/auth/me');
  return res.data;
};

// Helper to fetch transactions, with optional pagination and filters
export const fetchTransactions = async (
  params?: { page?: number; limit?: number; month?: number; year?: number; day?: number }
) => {
  const { data } = await api.get('/transactions', { params });
  return data;
};

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
export const createTransaction = async (txData: any) => {
  const { data } = await api.post('/transactions/manual', { data: txData });
  return data;
};

export default api;
