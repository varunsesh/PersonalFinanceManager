import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { INITIAL_MESSAGES, nowTime } from '../lib/constants';
import { computeMetrics, formatMoney } from '../lib/budget';
import { applyAssistantResult, budgetAlerts, buildCard, undoChanges } from '../lib/assistantActions';
import { buildBudgetSnapshot, callGeminiBudgetParser, toGeminiHistory } from '../lib/gemini';
import { createIdbStorage } from './idbStorage';
import { useDbStore } from './dbStore';

// Chat messages (persisted) plus transient send state. sendMessage writes any
// parsed changes straight into dbStore, so every view subscribed to dbStore
// updates as soon as the reply is applied. Each assistant message keeps a
// record of what it changed (`changes`) so it can be undone.
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
          const applied = applyAssistantResult(result, db, fmt);
          const before = computeMetrics(db.transactions, db.plan);
          const after = computeMetrics(applied.transactions, applied.plan);
          if (applied.changes) db.applyBudget(applied);

          const reply = typeof result.reply === 'string' && result.reply.trim() ? result.reply : 'Done.';
          const aiMsg = {
            id: `msg-${Date.now() + 1}`,
            role: 'assistant',
            timestamp: nowTime(),
            text: applied.skipped.length > 0 ? `${reply}\n\n⚠️ Not applied: ${applied.skipped.join('; ')}.` : reply,
            badges: applied.badges,
            changes: applied.changes,
            alerts: budgetAlerts(before, after, applied.plan, fmt),
            card: buildCard(result.card, after, applied.plan)
          };
          set((s) => ({
            messages: [...s.messages, aiMsg],
            hasNewUpdates: s.hasNewUpdates || applied.changes !== null
          }));
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
      },

      undoMessage: (id) => {
        const msg = get().messages.find((m) => m.id === id);
        if (!msg?.changes || msg.undone) return;
        const db = useDbStore.getState();
        db.applyBudget(undoChanges(msg.changes, db));
        set((s) => ({
          messages: s.messages.map((m) => (m.id === id ? { ...m, undone: true } : m)),
          hasNewUpdates: true
        }));
      }
    }),
    {
      name: 'finchat-chat',
      storage: createIdbStorage(['messages']),
      partialize: (s) => ({ messages: s.messages })
    }
  )
);
