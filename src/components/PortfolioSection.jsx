import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { formatShortINR } from '../lib/budget';
import { INSTRUMENTS } from '../lib/finance/taxRules';
import { portfolioSummary } from '../lib/portfolio';
import { useDbStore } from '../store/dbStore';
import { useSettingsStore } from '../store/settingsStore';
import { AllocationBar, GainText, INSTRUMENT_COLORS, PortfolioHeadline } from './PortfolioSummary';

const SOURCE_LABEL = { mf: 'NAV', us: 'Live', fd: 'Accrued', manual: 'Manual' };

export default function PortfolioSection() {
  const holdings = useDbStore((s) => s.holdings);
  const priceErrors = useDbStore((s) => s.priceErrors);
  const refreshPrices = useDbStore((s) => s.refreshPrices);
  const removeHolding = useDbStore((s) => s.removeHolding);
  const slabPct = useSettingsStore((s) => s.slabPct);
  const [refreshing, setRefreshing] = useState(false);

  const summary = useMemo(() => portfolioSummary(holdings, slabPct), [holdings, slabPct]);

  const refresh = async (force) => {
    setRefreshing(true);
    try {
      await refreshPrices(force);
    } finally {
      setRefreshing(false);
    }
  };

  // Refresh stale prices when the dashboard opens
  useEffect(() => {
    refresh(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (holdings.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-5 text-center text-xs text-slate-500">
        No investments yet. Tell the chat what you hold, e.g. “I have 250 units of Parag Parikh Flexi Cap Direct” or “10 shares of VOO”.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <PortfolioHeadline summary={summary} />
      <div className="space-y-4 px-4 py-3.5">
        <AllocationBar allocation={summary.allocation} />

        <div className="divide-y divide-slate-100">
          {[...summary.holdings]
            .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
            .map((h) => (
              <div key={h.id} className="flex items-center gap-2.5 py-2.5">
                <span className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: INSTRUMENT_COLORS[h.instrument] }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-slate-800">{h.name}</div>
                  <div className="text-[10px] text-slate-400">
                    {INSTRUMENTS[h.instrument]?.label}
                    {h.units ? ` · ${h.units.toLocaleString('en-IN')} ${h.source === 'us' ? 'shares' : 'units'}` : ''}
                    {' · '}
                    {SOURCE_LABEL[h.source]}
                    {h.priceDate ? ` ${h.priceDate}` : ''}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs font-bold tabular-nums text-slate-900">{h.value != null ? formatShortINR(h.value) : '—'}</div>
                  <GainText gain={h.gain} pct={h.gainPct} className="text-[10px] font-medium" />
                </div>
                <button
                  onClick={() => removeHolding(h.id)}
                  className="shrink-0 rounded p-1 text-slate-300 hover:text-rose-600"
                  aria-label={`Remove ${h.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
        </div>

        {summary.taxLines.length > 0 && (
          <details className="group text-[11px] text-slate-500">
            <summary className="cursor-pointer list-none font-medium text-slate-600">
              Tax if sold today: {formatShortINR(summary.exitTax)} (incl. cess) ›
            </summary>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
              {summary.taxLines.map((l) => (
                <li key={l.label}>
                  {l.label}: ₹{l.amount.toLocaleString('en-IN')}
                </li>
              ))}
              <li>Each holding is treated as one purchase on its start date; PPF and NPS excluded.</li>
            </ul>
          </details>
        )}

        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>{priceErrors.length > 0 ? `Couldn't update: ${priceErrors.join('; ')}` : 'Prices refresh every 6 hours'}</span>
          <button
            onClick={() => refresh(true)}
            disabled={refreshing}
            className="inline-flex shrink-0 items-center gap-1 font-medium text-indigo-600 disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
