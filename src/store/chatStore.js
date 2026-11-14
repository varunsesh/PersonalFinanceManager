import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { INITIAL_MESSAGES, nowTime } from '../lib/constants';
import { computeMetrics, formatMoney } from '../lib/budget';
import {
  applyPlanUpdate,
  buildBudgetSnapshot,
  callGeminiBudgetParser,
  normalizeTransaction,
  toGeminiHistory
} from '../lib/gemini';
import { createIdbStorage } from './idbStorage';
import { useDbStore } from './dbStore';

// Chat messages (persisted) plus transient send state. sendMessage writes any
// parsed transactions and plan changes straight into dbStore, so every view
// subscribed to dbStore updates as soon as the reply is applied.
export const useChatStore = create(
  persist(
    (set, get) => ({
      messages: INITIAL_MESSAGES,
      isSending: false,
      hasNewUpdates: false,

      markUpdatesSeen: () => set({ hasNewUpdates: false }),
      resetMessages: (messages = INITIAL_MESSAGES) => set({ messages }),

      sendMessage: async (rawText) => {
        const text = rawText.trim();
        if (!text || get().isSending) return;

        const { plan, transactions, currency, apiKey } = useDbStore.getState();
        const history = toGeminiHistory(get().messages);
        const userMsg = { id: `msg-${Date.now()}`, role: 'user', timestamp: nowTime(), text };
        set((s) => ({ messages: [...s.messages, userMsg], isSending: true }));

        try {
          const result = await callGeminiBudgetParser({
            userMessage: text,
            history,
            snapshot: buildBudgetSnapshot(plan, computeMetrics(transactions, plan), transactions),
            currency,
            apiKey
          });

          // Re-read: the budget may have changed while the request was in flight.
          const db = useDbStore.getState();
          const fmt = (v) => formatMoney(v, db.currency);
          const loggedBadges = [];
          const skipped = [];
          let changed = false;

          if (Array.isArray(result.transactions) && result.transactions.length > 0) {
            const newTxs = [];
            result.transactions.forEach((raw, idx) => {
              const t = normalizeTransaction(raw);
              if (!t) {
                skipped.push(`transaction "${raw?.description ?? 'unknown'}" had an invalid amount or type`);
                return;
              }
              newTxs.push({ id: `tx-${Date.now()}-${idx}`, ...t });
              loggedBadges.push(`${t.type === 'income' ? '+' : '-'}${fmt(t.amount)} (${t.category})`);
            });
            if (newTxs.length > 0) {
              db.addTransactions(newTxs);
              changed = true;
            }
          }

          if (result.planUpdate) {
            const update = applyPlanUpdate(db.plan, result.planUpdate, fmt);
            loggedBadges.push(...update.applied);
            skipped.push(...update.skipped);
            if (update.applied.length > 0) {
              db.setPlan(update.plan);
              changed = true;
            }
          }

          const reply = typeof result.reply === 'string' && result.reply.trim() ? result.reply : 'Done.';
          const aiMsg = {
            id: `msg-${Date.now() + 1}`,
            role: 'assistant',
            timestamp: nowTime(),
            text: skipped.length > 0 ? `${reply}\n\n⚠️ Not applied: ${skipped.join('; ')}.` : reply,
            badges: loggedBadges
          };
          set((s) => ({ messages: [...s.messages, aiMsg], hasNewUpdates: s.hasNewUpdates || changed }));
        } catch (err) {
          const errorMsg = {
            id: `msg-${Date.now() + 1}`,
            role: 'assistant',
            timestamp: nowTime(),
            text: `Could not reach Gemini (${err.message}). Check your API key in Settings or switch to Dashboard to log offline.`,
            isError: true
          };
          set((s) => ({ messages: [...s.messages, errorMsg] }));
        } finally {
          set({ isSending: false });
        }
      }
    }),
    {
      name: 'finchat-chat',
      storage: createIdbStorage(['messages']),
      partialize: (s) => ({ messages: s.messages })
    }
  )
);
