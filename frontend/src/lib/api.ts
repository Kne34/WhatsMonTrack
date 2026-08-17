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
// Helper to confirm a transaction
export const confirmTransaction = async (id: string) => {
  const { data } = await api.put(`/transactions/${id}/confirm`);
  return data;
};

export const updateTransaction = async (id: string, data: any) => {
  const res = await api.put(`/transactions/${id}`, data);
  return res.data;
};

export default api;
