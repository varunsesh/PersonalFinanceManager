import { useMemo, useState } from 'react';
import { ChevronDown, Lightbulb } from 'lucide-react';
import { formatShortINR } from '../lib/budget';
import { goalsOverview } from '../lib/goals';
import { useDbStore, useLedger, useMonthSnapshot } from '../store/dbStore';
import { calcSettings, useSettingsStore } from '../store/settingsStore';
import { useSuggestions } from '../store/useSuggestions';

const GOAL_DOT = { on_track: 'bg-emerald-500', behind: 'bg-amber-500', done: 'bg-indigo-500', building: 'bg-slate-400' };

function useTopGoals(limit = 3) {
  const goals = useDbStore((s) => s.goals);
  const holdings = useDbStore((s) => s.holdings);
  const transactions = useLedger();
  const plan = useDbStore((s) => s.plan);
  const settings = useSettingsStore();
  return useMemo(
    () =>
      goalsOverview(goals, {
        holdings,
        transactions,
        plan,
        settings: { calc: calcSettings(settings), defaultReturns: settings.defaultReturns }
      }).goals.slice(0, limit),
    [goals, holdings, transactions, plan, settings, limit]
  );
}

// Glanceable month status at the top of the chat. Collapsed it's one line;
// expanded it adds the spending bar, goal progress and suggestions.
export default function ThisMonthCard({ onOpenDashboard, onOpenSuggestions }) {
  const m = useMonthSnapshot();
  const goals = useTopGoals();
  const suggestions = useSuggestions();
  const [open, setOpen] = useState(false);
  const over = m.left < 0;
  const fast = !over && m.spentPct > m.elapsedPct + 10;

  const SuggestButton = suggestions.length > 0 && (
    <button
      type="button"
      onClick={onOpenSuggestions}
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 hover:bg-amber-200"
    >
      <Lightbulb className="h-3 w-3" /> {suggestions.length}
    </button>
  );

  return (
    <div className="shrink-0 border-b border-slate-100 bg-gradient-to-b from-indigo-50/80 to-white px-4 py-2">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open}>
          <span className={`text-sm font-bold tabular-nums ${over ? 'text-rose-600' : 'text-slate-900'}`}>
            {over ? `${formatShortINR(-m.left)} over` : `${formatShortINR(m.left)} left`}
          </span>
          <span className="truncate text-[11px] text-slate-500">
            {over ? 'this month' : `≈ ${formatShortINR(m.perDay)}/day · ${m.daysLeft} days to go`}
          </span>
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {SuggestButton}
      </div>

      {/* Spending vs. how far through the month we are */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Toggle month details"
        className="relative mt-1.5 block h-1.5 w-full cursor-pointer rounded-full bg-slate-200/70"
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${over ? 'bg-rose-500' : fast ? 'bg-amber-500' : 'bg-indigo-500'}`}
          style={{ width: `${Math.min(100, m.spentPct)}%` }}
        />
        <div className="absolute -top-0.5 h-2.5 w-0.5 rounded bg-slate-500" style={{ left: `${m.elapsedPct}%` }} title="Today" />
      </button>

      {open && (
        <div className="mt-2.5 space-y-2.5 pb-1">
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ['Spent', m.spent, 'text-slate-900'],
              ['Budget', m.budget, 'text-slate-900'],
              ['Saved', m.saved, 'text-emerald-600']
            ].map(([label, value, tone]) => (
              <div key={label} className="rounded-lg bg-white px-2 py-1.5 shadow-sm ring-1 ring-slate-100">
                <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
                <div className={`text-sm font-bold tabular-nums ${tone}`}>{formatShortINR(value)}</div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-500">
            {fast
              ? `You've used ${m.spentPct}% of this month's spending budget with ${100 - m.elapsedPct}% of the month left.`
              : over
                ? 'Spending is over this month’s needs + wants budget.'
                : `On pace: ${m.spentPct}% of the budget used, ${m.elapsedPct}% of the month gone.`}
            {m.usingTarget && ' Budget uses your income target until salary is logged.'}
          </p>

          {goals.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {goals.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => onOpenDashboard?.({ tab: 'goals' })}
                  className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-700 shadow-sm ring-1 ring-slate-100 hover:ring-indigo-300"
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${GOAL_DOT[g.status]}`} />
                  {g.name} <span className="font-semibold tabular-nums">{Math.round(g.progressPct)}%</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between">
            {suggestions.length > 0 ? (
              <button type="button" onClick={onOpenSuggestions} className="text-[11px] font-semibold text-amber-700 hover:underline">
                {suggestions.length} suggestion{suggestions.length > 1 ? 's' : ''} for you →
              </button>
            ) : (
              <span className="text-[11px] text-slate-400">No suggestions right now</span>
            )}
            <button type="button" onClick={() => onOpenDashboard?.({ tab: 'month' })} className="text-[11px] font-semibold text-indigo-600 hover:underline">
              Open plan →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
