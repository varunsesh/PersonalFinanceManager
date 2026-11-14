import { useCallback, useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { API_KEY_STORAGE, DEFAULT_PLAN, SAMPLE_TRANSACTIONS, currentMonth } from '../lib/constants';
import { computeMetrics, formatMoney } from '../lib/budget';
import { createIdbStorage } from './idbStorage';
import { refreshPrices } from '../lib/portfolio';
import { useSettingsStore } from './settingsStore';

function readStoredApiKey() {
  try {
    return localStorage.getItem(API_KEY_STORAGE) || import.meta.env.VITE_GEMINI_API_KEY || '';
  } catch {
    return import.meta.env.VITE_GEMINI_API_KEY || '';
  }
}

// Budget data (transactions, plan, currency, holdings) persisted to IndexedDB.
// The API key lives in localStorage instead and is excluded from the persisted
// state.
export const useDbStore = create(
  persist(
    (set, get) => ({
      transactions: SAMPLE_TRANSACTIONS,
      holdings: [],
      priceErrors: [],
      plan: DEFAULT_PLAN,
      currency: '₹',
      apiKey: readStoredApiKey(),

      addTransactions: (txs) => set((s) => ({ transactions: [...txs, ...s.transactions] })),
      deleteTransaction: (id) => set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) })),
      clearTransactions: () => set({ transactions: [] }),
      setPlan: (plan) => set({ plan }),
      // Replace transactions, plan and holdings together, so a chat reply lands as one update
      applyBudget: ({ transactions, plan, holdings }) =>
        set(holdings ? { transactions, plan, holdings } : { transactions, plan }),
      removeHolding: (id) => set((s) => ({ holdings: s.holdings.filter((h) => h.id !== id) })),
      // Fetch prices for stale holdings (or all, with force) and save them
      refreshPrices: async (force = false) => {
        const { holdings } = get();
        if (holdings.length === 0) return;
        const { finnhubKey } = useSettingsStore.getState();
        const result = await refreshPrices(holdings, { finnhubKey, force });
        // Merge by id in case holdings changed while prices were loading
        const fresh = new Map(result.holdings.map((h) => [h.id, h]));
        set((s) => ({
          holdings: s.holdings.map((h) => {
            const f = fresh.get(h.id);
            return f && f.priceFetchedAt !== h.priceFetchedAt ? { ...h, ...f } : h;
          }),
          priceErrors: result.errors
        }));
      },
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
      partialize: (s) => ({ transactions: s.transactions, plan: s.plan, currency: s.currency, holdings: s.holdings })
    }
  )
);

export function useBudgetMetrics() {
  const transactions = useDbStore((s) => s.transactions);
  const plan = useDbStore((s) => s.plan);
  const month = currentMonth();
  return useMemo(() => computeMetrics(transactions, plan, month), [transactions, plan, month]);
}

export function useFormatMoney() {
  const currency = useDbStore((s) => s.currency);
  return useCallback((val) => formatMoney(val, currency), [currency]);
}
