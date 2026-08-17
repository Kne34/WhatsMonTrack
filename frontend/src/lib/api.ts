import axios from 'axios';

// Since we setup rewrites in next.config.ts, we can just call /api/... directly
const api = axios.create({
  baseURL: '/api',
});

// Helper to fetch transactions for a given phone number
export const fetchTransactions = async (phoneNumber: string = process.env.NEXT_PUBLIC_DEFAULT_PHONE_NUMBER || '') => {
  const { data } = await api.get('/transactions', { params: { phoneNumber } });
  return data;
};

// Helper to fetch accounts
export const fetchAccounts = async (phoneNumber: string = process.env.NEXT_PUBLIC_DEFAULT_PHONE_NUMBER || '') => {
  const { data } = await api.get('/accounts', { params: { phoneNumber } });
  return data;
};

// Helper to confirm a transaction
export const confirmTransaction = async (id: string) => {
  const { data } = await api.put(`/transactions/${id}/confirm`);
  return data;
};

export default api;
