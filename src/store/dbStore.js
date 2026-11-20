import { useCallback, useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { API_KEY_STORAGE, DEFAULT_PLAN, SAMPLE_TRANSACTIONS, currentMonth, today } from '../lib/constants';
import { computeMetrics, formatMoney, monthSnapshot, previousMonth } from '../lib/budget';
import { createIdbStorage } from './idbStorage';
import { refreshPrices } from '../lib/portfolio';
import { ledger } from '../lib/credit';
import { useSettingsStore } from './settingsStore';

// The key is entered in the app and kept in this device's storage. It is
// deliberately not read from .env, so it is never compiled into a build.
function readStoredApiKey() {
  try {
    return localStorage.getItem(API_KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

// Budget data (transactions, plan, currency, holdings, goals, memories, credit
// cards and their EMI plans) persisted to IndexedDB.
// The API key lives in localStorage instead and is excluded from the persisted
// state.
export const useDbStore = create(
  persist(
    (set, get) => ({
      transactions: SAMPLE_TRANSACTIONS,
      holdings: [],
      goals: [],
      memories: [],
      creditCards: [],
      cardEmis: [],
      // { dismissed: { [suggestionId]: isoDate }, accepted: { ... } }
      suggestionState: { dismissed: {}, accepted: {} },
      priceErrors: [],
      plan: DEFAULT_PLAN,
      currency: '₹',
      apiKey: readStoredApiKey(),

      addTransactions: (txs) => set((s) => ({ transactions: [...txs, ...s.transactions] })),
      deleteTransaction: (id) => set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) })),
      clearTransactions: () => set({ transactions: [], suggestionState: { dismissed: {}, accepted: {} } }),
      setPlan: (plan) => set({ plan }),
      // Replace transactions, plan and holdings together, so a chat reply lands as one update
      applyBudget: ({ transactions, plan, holdings, goals, memories, creditCards, cardEmis }) =>
        set({
          transactions,
          plan,
          ...(holdings && { holdings }),
          ...(goals && { goals }),
          ...(memories && { memories }),
          ...(creditCards && { creditCards }),
          ...(cardEmis && { cardEmis })
        }),
      addMemory: (memory) => set((s) => ({ memories: [...s.memories, memory] })),
      removeMemory: (id) => set((s) => ({ memories: s.memories.filter((m) => m.id !== id) })),
      removeHolding: (id) =>
        set((s) => ({
          holdings: s.holdings.filter((h) => h.id !== id),
          // Drop links to the removed holding
          goals: s.goals.map((g) => ({ ...g, links: (g.links ?? []).filter((l) => l.holdingId !== id) }))
        })),
      removeGoal: (id) => set((s) => ({ goals: s.goals.filter((g) => g.id !== id) })),
      removeCardEmi: (id) => set((s) => ({ cardEmis: s.cardEmis.filter((e) => e.id !== id) })),
      // Only cards with no transactions or EMI plans can be removed
      removeCreditCard: (id) =>
        set((s) =>
          s.transactions.some((t) => t.cardId === id) || s.cardEmis.some((e) => e.cardId === id)
            ? {}
            : { creditCards: s.creditCards.filter((c) => c.id !== id) }
        ),
      // outcome: 'dismissed' | 'accepted' | null (reopen)
      setSuggestionOutcome: (id, outcome) =>
        set((s) => {
          const dismissed = { ...(s.suggestionState?.dismissed ?? {}) };
          const accepted = { ...(s.suggestionState?.accepted ?? {}) };
          delete dismissed[id];
          delete accepted[id];
          if (outcome === 'dismissed') dismissed[id] = new Date().toISOString();
          if (outcome === 'accepted') accepted[id] = new Date().toISOString();
          return { suggestionState: { dismissed, accepted } };
        }),
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
      resetToDemo: () =>
        set({
          transactions: SAMPLE_TRANSACTIONS,
          plan: DEFAULT_PLAN,
          currency: '₹',
          suggestionState: { dismissed: {}, accepted: {} }
        })
    }),
    {
      name: 'finchat-budget',
      storage: createIdbStorage(['transactions', 'plan', 'currency']),
      partialize: (s) => ({
        transactions: s.transactions,
        plan: s.plan,
        currency: s.currency,
        holdings: s.holdings,
        goals: s.goals,
        memories: s.memories,
        creditCards: s.creditCards,
        cardEmis: s.cardEmis,
        suggestionState: s.suggestionState
      }),
      merge: (saved, current) => ({
        ...current,
        ...saved,
        transactions: Array.isArray(saved?.transactions) ? saved.transactions : current.transactions,
        holdings: Array.isArray(saved?.holdings) ? saved.holdings : current.holdings,
        goals: Array.isArray(saved?.goals) ? saved.goals : current.goals,
        memories: Array.isArray(saved?.memories) ? saved.memories : current.memories,
        creditCards: Array.isArray(saved?.creditCards) ? saved.creditCards : current.creditCards,
        cardEmis: Array.isArray(saved?.cardEmis) ? saved.cardEmis : current.cardEmis,
        suggestionState: {
          dismissed: saved?.suggestionState?.dismissed ?? {},
          accepted: saved?.suggestionState?.accepted ?? {}
        }
      })
    }
  )
);

// Stored transactions plus the EMI instalments due so far. Anything that
// totals spending should read this rather than `transactions`.
export function useLedger() {
  const transactions = useDbStore((s) => s.transactions);
  const cardEmis = useDbStore((s) => s.cardEmis);
  const date = today();
  return useMemo(() => ledger(transactions, cardEmis, date), [transactions, cardEmis, date]);
}

export function useBudgetMetrics() {
  const transactions = useLedger();
  const plan = useDbStore((s) => s.plan);
  const month = currentMonth();
  return useMemo(() => computeMetrics(transactions, plan, month), [transactions, plan, month]);
}

// Same metrics for the previous month, for "vs last month" comparisons.
export function usePreviousMonthMetrics() {
  const transactions = useLedger();
  const plan = useDbStore((s) => s.plan);
  const month = previousMonth(currentMonth());
  return useMemo(() => computeMetrics(transactions, plan, month), [transactions, plan, month]);
}

export function useMonthSnapshot() {
  const transactions = useLedger();
  const plan = useDbStore((s) => s.plan);
  const date = today();
  return useMemo(() => monthSnapshot(transactions, plan, date), [transactions, plan, date]);
}

export function useFormatMoney() {
  const currency = useDbStore((s) => s.currency);
  return useCallback((val) => formatMoney(val, currency), [currency]);
}
