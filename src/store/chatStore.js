import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { INITIAL_MESSAGES, nowTime } from '../lib/constants';
import { computeMetrics, formatMoney } from '../lib/budget';
import { applyAssistantResult, budgetAlerts, buildCards, undoChanges } from '../lib/assistantActions';
import { runAssistant, toGeminiHistory } from '../lib/gemini';
import { suggestionToResult } from '../lib/suggestions';
import { createIdbStorage } from './idbStorage';
import { useDbStore } from './dbStore';
import { calcSettings, useSettingsStore } from './settingsStore';

// Chat messages (persisted) plus transient send state. sendMessage writes any
// parsed changes straight into dbStore, so every view subscribed to dbStore
// updates as soon as the reply is applied. Each assistant message keeps a
// record of what it changed (`changes`) so it can be undone.
let msgSeq = 0;
const nextMsgId = () => `msg-${Date.now()}-${++msgSeq}`;

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

        const history = toGeminiHistory(get().messages);
        const userMsg = { id: nextMsgId(), role: 'user', timestamp: nowTime(), text };
        set((s) => ({ messages: [...s.messages, userMsg], isSending: true }));

        try {
          // Refresh stale holding prices first so answers use today's values
          await useDbStore.getState().refreshPrices().catch(() => {});
          const { plan, transactions, holdings, goals, memories, suggestionState, currency, apiKey } = useDbStore.getState();
          const planning = useSettingsStore.getState();
          const result = await runAssistant({
            userMessage: text,
            history,
            state: { transactions, plan, holdings, goals, memories, suggestionState },
            currency,
            apiKey,
            fmt: (v) => formatMoney(v, currency),
            settings: { planning, calc: calcSettings(planning) }
          });

          // Re-read: the budget may have changed while the request was in flight.
          const db = useDbStore.getState();
          const fmt = (v) => formatMoney(v, db.currency);
          const applied = applyAssistantResult(result, db, fmt);
          const before = computeMetrics(db.transactions, db.plan);
          const after = computeMetrics(applied.transactions, applied.plan);
          if (applied.changes) db.applyBudget(applied);

          const reply = typeof result.reply === 'string' && result.reply.trim() ? result.reply : 'Done.';
          const cardTypes = result.cards?.length ? result.cards : result.card ? [result.card] : [];
          const cards = buildCards(cardTypes, after, applied.plan, {
            holdings: applied.holdings,
            goals: applied.goals,
            transactions: applied.transactions,
            planning,
            suggestions: result.suggestions ?? []
          });
          const aiMsg = {
            id: nextMsgId(),
            role: 'assistant',
            timestamp: nowTime(),
            text: applied.skipped.length > 0 ? `${reply}\n\n⚠️ Not applied: ${applied.skipped.join('; ')}.` : reply,
            badges: applied.badges,
            changes: applied.changes,
            alerts: budgetAlerts(before, after, applied.plan, fmt),
            card: cards[0] ?? null,
            cards,
            calcCards: result.calcs
          };
          set((s) => ({
            messages: [...s.messages, aiMsg],
            hasNewUpdates: s.hasNewUpdates || applied.changes !== null
          }));
        } catch (err) {
          const errorMsg = {
            id: nextMsgId(),
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

      // Apply an accepted suggestion (with the user's adjustments) and record it
      // as an assistant message so it shows badges and can be undone.
      acceptSuggestion: (suggestion, proposal) => {
        const db = useDbStore.getState();
        const result = suggestionToResult(suggestion, proposal, db);
        if (!result) return false;
        const fmt = (v) => formatMoney(v, db.currency);
        const applied = applyAssistantResult(result, db, fmt);
        if (!applied.changes) return false;
        const before = computeMetrics(db.transactions, db.plan);
        db.applyBudget(applied);
        db.setSuggestionOutcome(suggestion.id, 'accepted');
        const msg = {
          id: nextMsgId(),
          role: 'assistant',
          timestamp: nowTime(),
          text: `Done: ${suggestion.title}.`,
          badges: applied.badges,
          changes: applied.changes,
          alerts: budgetAlerts(before, computeMetrics(applied.transactions, applied.plan), applied.plan, fmt),
          suggestionId: suggestion.id
        };
        set((s) => ({ messages: [...s.messages, msg], hasNewUpdates: true }));
        return true;
      },

      undoMessage: (id) => {
        const msg = get().messages.find((m) => m.id === id);
        if (!msg?.changes || msg.undone) return;
        const db = useDbStore.getState();
        db.applyBudget(undoChanges(msg.changes, db));
        // Undoing an accepted suggestion offers it again
        if (msg.suggestionId) db.setSuggestionOutcome(msg.suggestionId, null);
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
