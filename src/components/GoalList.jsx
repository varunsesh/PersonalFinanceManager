import { formatShortINR } from '../lib/budget';

const STATUS = {
  on_track: { label: 'On track', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', ring: '#10b981' },
  behind: { label: 'Behind', className: 'bg-amber-50 text-amber-800 border-amber-200', ring: '#f59e0b' },
  done: { label: 'Reached', className: 'bg-indigo-50 text-indigo-700 border-indigo-200', ring: '#4f46e5' },
  building: { label: 'Building', className: 'bg-slate-50 text-slate-600 border-slate-200', ring: '#64748b' }
};

const monthYear = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString([], { month: 'short', year: 'numeric' });

function Ring({ pct, color }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-11 w-11 shrink-0">
      <svg viewBox="0 0 40 40" className="h-11 w-11 -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" stroke="#f1f5f9" strokeWidth="4.5" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeDasharray={`${(Math.min(100, pct) / 100) * c} ${c}`}
          className="transition-all duration-500"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tabular-nums text-slate-700">
        {Math.round(pct)}%
      </span>
    </div>
  );
}

export function GoalRow({ goal: g, action }) {
  const s = STATUS[g.status] ?? STATUS.building;
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Ring pct={g.progressPct} color={s.ring} />
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-semibold text-slate-800">{g.name}</span>
          <span className={`shrink-0 rounded-full border px-1.5 py-px text-[10px] font-semibold ${s.className}`}>{s.label}</span>
        </div>
        <div className="text-[11px] text-slate-500">
          <span className="font-semibold tabular-nums text-slate-700">{formatShortINR(g.balance)}</span> of{' '}
          <span className="tabular-nums">{formatShortINR(g.target)}</span>
          {g.targetDate && ` · by ${monthYear(g.targetDate)}`}
          {g.todaysMoneyTarget && ` (${formatShortINR(g.todaysMoneyTarget)} today)`}
          {g.kind === 'emergency' && ` · ${g.emergencyMonths} months of expenses`}
        </div>
        {g.requiredMonthly != null && g.status !== 'done' && (
          <div className="text-[11px] text-slate-500">
            Need <span className="font-semibold tabular-nums text-slate-700">{formatShortINR(g.requiredMonthly)}/mo</span>
            {' · '}saving <span className="tabular-nums">{formatShortINR(g.monthlyPace)}/mo</span>
            {g.status === 'behind' && (
              <span className="font-semibold text-amber-700"> · {formatShortINR(g.shortfallMonthly)}/mo short</span>
            )}
          </div>
        )}
      </div>
      {action}
    </div>
  );
}

export default function GoalList({ overview, renderAction }) {
  return (
    <div className="divide-y divide-slate-100">
      {overview.goals.map((g) => (
        <GoalRow key={g.id} goal={g} action={renderAction?.(g)} />
      ))}
    </div>
  );
}
