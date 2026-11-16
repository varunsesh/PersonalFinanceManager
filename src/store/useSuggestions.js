import { useMemo } from 'react';
import { buildSuggestions } from '../lib/suggestions';
import { useDbStore } from './dbStore';
import { calcSettings, useSettingsStore } from './settingsStore';

// Current suggestions, recomputed whenever the underlying data changes.
export function useSuggestions() {
  const transactions = useDbStore((s) => s.transactions);
  const plan = useDbStore((s) => s.plan);
  const holdings = useDbStore((s) => s.holdings);
  const goals = useDbStore((s) => s.goals);
  const suggestionState = useDbStore((s) => s.suggestionState);
  const settings = useSettingsStore();
  return useMemo(
    () =>
      buildSuggestions({
        transactions,
        plan,
        holdings,
        goals,
        suggestionState,
        settings: { calc: calcSettings(settings), defaultReturns: settings.defaultReturns }
      }),
    [transactions, plan, holdings, goals, suggestionState, settings]
  );
}
