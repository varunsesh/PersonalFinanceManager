import { useCallback, useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { API_KEY_STORAGE, DEFAULT_PLAN, SAMPLE_TRANSACTIONS } from '../lib/constants';
import { computeMetrics, formatMoney } from '../lib/budget';
import { createIdbStorage } from './idbStorage';

function readStoredApiKey() {
  try {
    return localStorage.getItem(API_KEY_STORAGE) || import.meta.env.VITE_GEMINI_API_KEY || '';
  } catch {
    return import.meta.env.VITE_GEMINI_API_KEY || '';
  }
}

// Budget data (transactions, plan, currency) persisted to IndexedDB. The API
// key lives in localStorage instead and is excluded from the persisted state.
export const useDbStore = create(
  persist(
    (set) => ({
      transactions: SAMPLE_TRANSACTIONS,
      plan: DEFAULT_PLAN,
      currency: '₹',
      apiKey: readStoredApiKey(),

      addTransactions: (txs) => set((s) => ({ transactions: [...txs, ...s.transactions] })),
      deleteTransaction: (id) => set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) })),
      clearTransactions: () => set({ transactions: [] }),
      setPlan: (plan) => set({ plan }),
      setCategoryLimit: (category, limit) =>
        set((s) => ({
          plan: { ...s.plan, categoryLimits: { ...s.plan.categoryLimits, [category]: limit } }
        })),
      setCurrency: (currency) => set({ currency }),
      setApiKey: (rawVal) => {
        const apiKey = rawVal.trim();
        try {
          if (apiKey) localStorage.setItem(API_KEY_STORAGE, apiKey);
          else localStorage.removeItem(API_KEY_STORAGE);
        } catch {
          // Ignore storage errors
        }
        set({ apiKey });
      },
      resetToDemo: () => set({ transactions: SAMPLE_TRANSACTIONS, plan: DEFAULT_PLAN, currency: '₹' })
    }),
    {
      name: 'finchat-budget',
      storage: createIdbStorage(['transactions', 'plan', 'currency']),
      partialize: (s) => ({ transactions: s.transactions, plan: s.plan, currency: s.currency })
    }
  )
);

export function useBudgetMetrics() {
  const transactions = useDbStore((s) => s.transactions);
  const plan = useDbStore((s) => s.plan);
  return useMemo(() => computeMetrics(transactions, plan), [transactions, plan]);
}

export function useFormatMoney() {
  const currency = useDbStore((s) => s.currency);
  return useCallback((val) => formatMoney(val, currency), [currency]);
}
