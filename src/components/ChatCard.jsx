import { useDbStore, useFormatMoney } from '../store/dbStore';
import AllocationBarChart from './AllocationBarChart';
import { AllocationBar, GainText, PortfolioHeadline } from './PortfolioSummary';
import { formatShortINR } from '../lib/budget';
import GoalList from './GoalList';
import SuggestionCard from './SuggestionCard';
import { useSuggestions } from '../store/useSuggestions';

const monthLabel = (month) =>
  new Date(`${month}-01T00:00:00`).toLocaleDateString([], { month: 'short', year: 'numeric' });

function SummaryCard({ data }) {
  const formatMoney = useFormatMoney();
  const items = [
    { label: 'Income', value: data.income, className: 'text-slate-900' },
    { label: 'Spent', value: data.expenses, className: 'text-slate-900' },
    { label: 'Saved', value: data.savings, className: 'text-emerald-600' },
    { label: 'Unallocated', value: data.unallocated, className: data.unallocated >= 0 ? 'text-slate-900' : 'text-rose-600' }
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg bg-slate-50 px-2.5 py-2">
          <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{item.label}</div>
          <div className={`text-sm font-bold ${item.className}`}>{formatMoney(item.value)}</div>
        </div>
      ))}
    </div>
  );
}

function CategoriesCard({ data }) {
  const formatMoney = useFormatMoney();
  if (data.length === 0) return <div className="text-xs text-slate-400">Nothing logged this month yet.</div>;
  return (
    <div className="space-y-2.5">
      {data.map((c) => {
        const pct = c.limit > 0 ? Math.min(100, Math.round((c.spent / c.limit) * 100)) : 0;
        const isOver = c.limit > 0 && c.spent > c.limit && c.category !== 'Savings & Investments';
        return (
          <div key={c.category} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-medium text-slate-700">{c.category}</span>
              <span className="shrink-0">
                <span className={`font-semibold ${isOver ? 'text-rose-600' : 'text-slate-800'}`}>{formatMoney(c.spent)}</span>
                {c.limit > 0 && <span className="text-slate-400"> / {formatMoney(c.limit)}</span>}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${isOver ? 'bg-rose-500' : 'bg-indigo-600'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PortfolioCard({ data, onOpen }) {
  const Tag = onOpen ? 'button' : 'div';
  return (
    <Tag
      {...(onOpen ? { type: 'button', onClick: onOpen } : {})}
      className={`block w-full overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm ${
        onOpen ? 'cursor-pointer transition-colors hover:border-indigo-300' : ''
      }`}
    >
      <PortfolioHeadline summary={data} />
      <div className="space-y-3 px-3.5 py-3">
        {data.holdings.length === 0 ? (
          <div className="text-xs text-slate-400">No investments recorded yet.</div>
        ) : (
          <>
            <AllocationBar allocation={data.allocation} />
            <div className="divide-y divide-slate-100">
              {data.holdings.map((h) => (
                <div key={h.id} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                  <span className="truncate text-slate-700">{h.name}</span>
                  <span className="shrink-0 text-right">
                    <span className="font-semibold tabular-nums text-slate-900">{h.value != null ? formatShortINR(h.value) : '—'}</span>{' '}
                    <GainText gain={h.gain} pct={h.gainPct} className="text-[10px]" />
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <span>Values as of {data.asOf}</span>
          {onOpen && <span className="font-semibold text-indigo-600">Open →</span>}
        </div>
      </div>
    </Tag>
  );
}

const TITLES = { summary: 'Month summary', buckets: 'Plan vs. actual', categories: 'Top categories' };

function LiveSuggestions({ proposed = [], onAsk }) {
  const live = useSuggestions();
  const suggestionState = useDbStore((s) => s.suggestionState);
  const closed = { ...(suggestionState?.dismissed ?? {}), ...(suggestionState?.accepted ?? {}) };
  const liveIds = new Set(live.map((s) => s.id));
  const hasLiveEmergency = live.some((s) => s.kind === 'emergency_fund');
  const openProposed = proposed.filter(
    (s) => !closed[s.id] && !liveIds.has(s.id) && !(s.kind === 'emergency_fund' && hasLiveEmergency)
  );
  const suggestions = [...openProposed, ...live];
  if (suggestions.length === 0) {
    return <div className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs text-slate-400">No open suggestions right now.</div>;
  }
  return (
    <div className="w-full space-y-2">
      {suggestions.map((s) => (
        <SuggestionCard key={s.id} suggestion={s} onAsk={onAsk} />
      ))}
    </div>
  );
}

// A snapshot of the numbers at the time of the reply, shown under it in chat
// (except suggestions, which stay live).
export default function ChatCard({ card, onAsk, onOpenDashboard }) {
  if (card.type === 'suggestions') return <LiveSuggestions proposed={card.suggestions} onAsk={onAsk} />;
  if (card.type === 'portfolio') {
    return <PortfolioCard data={card.data} onOpen={onOpenDashboard ? () => onOpenDashboard({ tab: 'investments' }) : undefined} />;
  }
  if (card.type === 'goals') {
    const onOpen = onOpenDashboard ? () => onOpenDashboard({ tab: 'goals' }) : undefined;
    const Tag = onOpen ? 'button' : 'div';
    return (
      <Tag
        {...(onOpen ? { type: 'button', onClick: onOpen } : {})}
        className={`block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left shadow-sm ${
          onOpen ? 'cursor-pointer transition-colors hover:border-indigo-300' : ''
        }`}
      >
        <div className="flex items-center justify-between pt-1 text-[11px] font-semibold text-slate-500">
          <span>Goals</span>
          <span className="font-medium text-slate-400">
            Need {formatShortINR(card.data.totalRequiredMonthly)}/mo · saving {formatShortINR(card.data.totalPaceMonthly)}/mo
            {onOpen && <span className="ml-2 font-semibold text-indigo-600">Open →</span>}
          </span>
        </div>
        {card.data.goals.length ? <GoalList overview={card.data} /> : <div className="py-3 text-xs text-slate-400">No goals yet.</div>}
      </Tag>
    );
  }
  const target = card.type === 'categories' ? { tab: 'month', ledgerTab: 'plan' } : { tab: 'month', ledgerTab: 'transactions' };
  const onOpen = onOpenDashboard ? () => onOpenDashboard(target) : undefined;
  const Tag = onOpen ? 'button' : 'div';
  return (
    <Tag
      {...(onOpen ? { type: 'button', onClick: onOpen } : {})}
      className={`block w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm ${
        onOpen ? 'cursor-pointer transition-colors hover:border-indigo-300' : ''
      }`}
    >
      <div className="mb-2.5 flex items-center justify-between text-[11px] font-semibold text-slate-500">
        <span>{TITLES[card.type]}</span>
        <span className="font-medium text-slate-400">
          {monthLabel(card.month)}
          {onOpen && <span className="ml-2 font-semibold text-indigo-600">Open →</span>}
        </span>
      </div>
      {card.type === 'summary' && <SummaryCard data={card.data} />}
      {card.type === 'buckets' && <AllocationBarChart buckets={card.data} />}
      {card.type === 'categories' && <CategoriesCard data={card.data} />}
    </Tag>
  );
}
