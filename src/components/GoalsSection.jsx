import { useMemo } from 'react';
import { Target, Trash2 } from 'lucide-react';
import { formatShortINR } from '../lib/budget';
import { goalsOverview } from '../lib/goals';
import { useDbStore } from '../store/dbStore';
import { calcSettings, useSettingsStore } from '../store/settingsStore';
import GoalList from './GoalList';

export default function GoalsSection() {
  const goals = useDbStore((s) => s.goals);
  const holdings = useDbStore((s) => s.holdings);
  const transactions = useDbStore((s) => s.transactions);
  const plan = useDbStore((s) => s.plan);
  const removeGoal = useDbStore((s) => s.removeGoal);
  const settings = useSettingsStore();

  const overview = useMemo(
    () =>
      goalsOverview(goals, {
        holdings,
        transactions,
        plan,
        settings: { calc: calcSettings(settings), defaultReturns: settings.defaultReturns }
      }),
    [goals, holdings, transactions, plan, settings]
  );

  if (goals.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-5 text-center text-xs text-slate-500">
        No goals yet. Tell the chat what you're saving for, e.g. “₹20L for a car in 3 years” or “set up an emergency fund”.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-indigo-600" />
          <h3 className="text-sm font-bold text-slate-800">Goals</h3>
        </div>
        <span className="text-[11px] text-slate-500">
          Need <span className="font-semibold text-slate-700">{formatShortINR(overview.totalRequiredMonthly)}/mo</span> · saving{' '}
          {formatShortINR(overview.totalPaceMonthly)}/mo
        </span>
      </div>
      <GoalList
        overview={overview}
        renderAction={(g) => (
          <button
            onClick={() => removeGoal(g.id)}
            className="mt-0.5 shrink-0 rounded p-1 text-slate-300 hover:text-rose-600"
            aria-label={`Delete goal ${g.name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      />
      <p className="mt-1 text-[10px] text-slate-400">
        Progress counts linked investments and savings tagged to each goal. Need/mo is the after-tax monthly investment to reach the
        target, assuming each goal's expected return.
      </p>
    </div>
  );
}
