import { useMemo, useState } from 'react';
import { ChevronDown, TrendingUp } from 'lucide-react';
import { formatMoney, formatShortINR } from '../lib/budget';
import { project, projectRange, requiredContribution } from '../lib/finance/calculators';
import { INSTRUMENTS } from '../lib/finance/taxRules';

const PER = { lumpsum: '', monthly: '/month', yearly: '/year' };
const inr = (v) => formatMoney(v, '₹');

function Row({ label, value, tone = 'text-slate-800', strong = false }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className={`shrink-0 tabular-nums ${strong ? 'font-bold' : 'font-medium'} ${tone}`}>{value}</span>
    </div>
  );
}

function Slider({ label, value, min, max, step, suffix, onChange }) {
  return (
    <label className="block">
      <div className="flex justify-between text-[11px] font-medium text-slate-500">
        <span>{label}</span>
        <span className="tabular-nums text-slate-800">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-indigo-600"
      />
    </label>
  );
}

// After-tax projection shown under a chat reply. Sliders recompute locally
// with the assumptions captured when the reply was made.
export default function ReturnsCard({ calc }) {
  const { kind, params, settings } = calc;
  const [ratePct, setRatePct] = useState(params.ratePct);
  const [years, setYears] = useState(params.years);
  const marketLinked = INSTRUMENTS[params.instrument]?.marketLinked;

  const view = useMemo(() => {
    const p = { ...params, ratePct, years };
    if (kind === 'required') {
      const amount = requiredContribution(p, calc.target, settings);
      if (amount == null) return { unreachable: true };
      p.amount = amount;
    }
    return { result: project(p, settings), range: projectRange(p, settings) };
  }, [kind, params, ratePct, years, settings, calc.target]);

  const r = view.result;

  return (
    <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="bg-gradient-to-br from-indigo-600 to-violet-600 px-3.5 py-3 text-white">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-indigo-100">
          <TrendingUp className="h-3.5 w-3.5" />
          {INSTRUMENTS[params.instrument]?.label} · {years} yr{years === 1 ? '' : 's'} @ {ratePct}%
          {params.instrument === 'us_stock' ? ' (USD)' : ''}
        </div>
        {view.unreachable ? (
          <div className="mt-1 text-sm font-semibold">Not reachable with this instrument</div>
        ) : kind === 'required' ? (
          <>
            <div className="mt-1 text-2xl font-bold tabular-nums">
              {inr(r.amount)}
              <span className="text-sm font-semibold text-indigo-100">{PER[params.mode]}</span>
            </div>
            <div className="text-[11px] text-indigo-100">to have {formatShortINR(calc.target)} in hand after tax</div>
          </>
        ) : (
          <>
            <div className="mt-1 text-2xl font-bold tabular-nums">{formatShortINR(r.inHand)}</div>
            <div className="text-[11px] text-indigo-100">
              {params.instrument === 'nps' ? 'corpus at exit' : 'in hand after tax'} · {r.postTaxReturnPct}%/yr post-tax
            </div>
          </>
        )}
      </div>

      {!view.unreachable && (
        <div className="space-y-3 px-3.5 py-3">
          <div className="divide-y divide-slate-100">
            <Row label={`Invested${r.mode === 'lumpsum' ? '' : ` (${inr(r.amount)}${PER[r.mode]}${r.stepUpPct ? `, +${r.stepUpPct}%/yr` : ''})`}`} value={inr(r.invested)} />
            <Row label="Gains" value={inr(r.gains)} tone="text-emerald-600" />
            {r.taxLines.map((t) => (
              <Row key={t.label} label={t.label} value={`− ${inr(t.amount)}`} tone="text-rose-600" />
            ))}
            {r.taxLines.length === 0 && params.instrument !== 'nps' && <Row label="Tax" value="Tax-free" tone="text-emerald-600" />}
            {r.nps ? (
              <>
                <Row label="60% lump sum (tax-free)" value={inr(r.nps.lumpSum)} strong />
                <Row label="40% buys an annuity" value={inr(r.nps.annuityCorpus)} />
                <Row label={`Pension at ${r.nps.annuityPct}% (after tax)`} value={`${inr(r.nps.monthlyPensionAfterTax)}/mo`} />
              </>
            ) : (
              <Row label="In hand" value={inr(r.inHand)} strong />
            )}
            <Row label="In today's money" value={inr(r.todaysMoney)} tone="text-slate-500" />
          </div>

          {marketLinked && view.range && kind === 'returns' && (
            <div className="grid grid-cols-3 gap-1.5 text-center">
              {[view.range[0], { ratePct, inHand: r.inHand }, view.range[1]].map((x, i) => (
                <div key={i} className={`rounded-lg px-1.5 py-1.5 ${i === 1 ? 'bg-indigo-50' : 'bg-slate-50'}`}>
                  <div className="text-[10px] text-slate-400">at {x.ratePct}%</div>
                  <div className={`text-xs font-bold tabular-nums ${i === 1 ? 'text-indigo-700' : 'text-slate-700'}`}>
                    {formatShortINR(x.inHand)}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <Slider label="Expected return" value={ratePct} min={0} max={20} step={0.5} suffix="%" onChange={setRatePct} />
            <Slider label="Years" value={years} min={1} max={40} step={1} suffix="" onChange={setYears} />
          </div>

          <details className="group text-[11px] text-slate-500">
            <summary className="flex cursor-pointer list-none items-center gap-1 font-medium text-slate-600">
              <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
              Assumptions & notes
            </summary>
            <ul className="mt-1.5 list-disc space-y-1 pl-4">
              {calc.fx && (
                <li>
                  ${calc.fx.usd.toLocaleString('en-IN')} converted at ₹{calc.fx.rate}/USD ({calc.fx.date})
                </li>
              )}
              <li>
                {r.taxRules} rules, new regime, {settings.slabPct}% slab + cess; {settings.inflationPct}% inflation
              </li>
              {r.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
              {marketLinked && <li>Market returns are assumptions, not guarantees.</li>}
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}
