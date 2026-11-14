import { formatMoney, formatShortINR } from '../lib/budget';

export const INSTRUMENT_COLORS = {
  equity_in: '#4f46e5',
  intl_fund: '#0ea5e9',
  us_stock: '#14b8a6',
  debt_mf: '#a855f7',
  fd: '#f59e0b',
  ppf: '#10b981',
  nps: '#ec4899'
};

const inr = (v) => formatMoney(v, '₹');

export function AllocationBar({ allocation }) {
  if (allocation.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
        {allocation.map((a) => (
          <div key={a.instrument} style={{ width: `${a.pct}%`, backgroundColor: INSTRUMENT_COLORS[a.instrument] }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {allocation.map((a) => (
          <span key={a.instrument} className="inline-flex items-center gap-1 text-[11px] text-slate-600">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: INSTRUMENT_COLORS[a.instrument] }} />
            {a.label} <span className="font-semibold text-slate-800">{a.pct}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function GainText({ gain, pct, className = '' }) {
  if (gain == null) return <span className={`text-slate-400 ${className}`}>—</span>;
  const up = gain >= 0;
  return (
    <span className={`tabular-nums ${up ? 'text-emerald-600' : 'text-rose-600'} ${className}`}>
      {up ? '+' : ''}
      {formatShortINR(gain)}
      {pct != null && ` (${up ? '+' : ''}${pct}%)`}
    </span>
  );
}

// Headline numbers shared by the chat card and the dashboard section.
export function PortfolioHeadline({ summary }) {
  const gainPct = summary.invested > 0 ? Math.round((summary.gain / summary.invested) * 1000) / 10 : null;
  return (
    <div className="bg-gradient-to-br from-slate-900 to-indigo-900 px-4 py-3.5 text-white">
      <div className="text-[11px] font-medium uppercase tracking-wider text-indigo-200">Investments</div>
      <div className="mt-0.5 text-2xl font-bold tabular-nums">{inr(summary.total)}</div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-indigo-100">
        {summary.invested > 0 && (
          <span>
            Gain <GainText gain={summary.gain} pct={gainPct} className="font-semibold !text-white" />
          </span>
        )}
        <span>
          ≈ {formatShortINR(summary.afterTaxIfSold)} after tax if sold today
        </span>
      </div>
    </div>
  );
}
