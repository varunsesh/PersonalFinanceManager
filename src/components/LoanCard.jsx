import { useMemo, useState } from 'react';
import { ChevronDown, Landmark } from 'lucide-react';
import { formatMoney, formatShortINR } from '../lib/budget';
import { amortize, solveLoan } from '../lib/finance/loans';

const inr = (v) => formatMoney(v, '₹');
const tenureLabel = (m) => {
  const y = Math.floor(m / 12);
  const r = m % 12;
  return [y && `${y} yr${y === 1 ? '' : 's'}`, r && `${r} mo`].filter(Boolean).join(' ') || '0 mo';
};

// Slider ranges widen to fit whatever the assistant computed.
const FIELDS = {
  principal: { label: 'Loan amount', step: 50000, min: 50000, max: (v) => Math.max(1e7, v * 2), show: formatShortINR },
  ratePct: { label: 'Interest rate', step: 0.05, min: 0, max: (v) => Math.max(20, v), show: (v) => `${v}%` },
  months: { label: 'Tenure', step: 6, min: 6, max: (v) => Math.max(360, v), show: tenureLabel },
  emi: { label: 'EMI', step: 500, min: 500, max: (v) => Math.max(200000, v * 2), show: formatShortINR }
};
const HEADLINE = {
  emi: (p) => [inr(p.emi), '/month', `EMI on ${formatShortINR(p.principal)} for ${tenureLabel(p.months)} @ ${p.ratePct}%`],
  principal: (p) => [formatShortINR(p.principal), '', `loan you can take with ${inr(p.emi)}/month for ${tenureLabel(p.months)} @ ${p.ratePct}%`],
  months: (p) => [tenureLabel(p.months), '', `to repay ${formatShortINR(p.principal)} at ${inr(p.emi)}/month @ ${p.ratePct}%`],
  ratePct: (p) => [`${p.ratePct}%`, ' a year', `implied by ${inr(p.emi)}/month on ${formatShortINR(p.principal)} for ${tenureLabel(p.months)}`]
};

function Row({ label, value, tone = 'text-slate-800', strong = false }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className={`shrink-0 tabular-nums ${strong ? 'font-bold' : 'font-medium'} ${tone}`}>{value}</span>
    </div>
  );
}

// Loan/EMI result under a chat reply. The sliders move the three inputs and
// recompute whichever value the assistant solved for.
export default function LoanCard({ calc }) {
  const { solved, purpose } = calc;
  const [inputs, setInputs] = useState(calc.params);
  const inputKeys = Object.keys(FIELDS).filter((k) => k !== solved);

  const view = useMemo(() => {
    const given = { ...inputs, [solved]: undefined };
    const { params, error } = solveLoan(given);
    return error ? { error } : { params, plan: amortize(params) };
  }, [inputs, solved]);

  const p = view.params;
  const [big, unit, sub] = p ? HEADLINE[solved](p) : [];

  return (
    <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="bg-gradient-to-br from-sky-600 to-indigo-600 px-3.5 py-3 text-white">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-sky-100">
          <Landmark className="h-3.5 w-3.5" />
          {purpose || 'Loan'}
        </div>
        {view.error ? (
          <div className="mt-1 text-sm font-semibold">{view.error}</div>
        ) : (
          <>
            <div className="mt-1 text-2xl font-bold tabular-nums">
              {big}
              <span className="text-sm font-semibold text-sky-100">{unit}</span>
            </div>
            <div className="text-[11px] text-sky-100">{sub}</div>
          </>
        )}
      </div>

      <div className="space-y-3 px-3.5 py-3">
        {p && (
          <>
            <div className="divide-y divide-slate-100">
              <Row label="Loan amount" value={inr(p.principal)} />
              <Row label="Total interest" value={inr(view.plan.totalInterest)} tone="text-rose-600" />
              <Row label="Total paid" value={inr(view.plan.totalPaid)} strong />
            </div>
            <div>
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-indigo-500" style={{ width: `${100 - view.plan.interestSharePct}%` }} />
                <div className="h-full bg-rose-400" style={{ width: `${view.plan.interestSharePct}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                <span>Principal {100 - view.plan.interestSharePct}%</span>
                <span>Interest {view.plan.interestSharePct}%</span>
              </div>
            </div>
          </>
        )}

        <div className="space-y-2">
          {inputKeys.map((k) => {
            const f = FIELDS[k];
            return (
              <label key={k} className="block">
                <div className="flex justify-between text-[11px] font-medium text-slate-500">
                  <span>{f.label}</span>
                  <span className="tabular-nums text-slate-800">{f.show(inputs[k])}</span>
                </div>
                <input
                  type="range"
                  min={f.min}
                  max={f.max(calc.params[k])}
                  step={f.step}
                  value={inputs[k]}
                  onChange={(e) => setInputs({ ...inputs, [k]: Number(e.target.value) })}
                  className="w-full accent-indigo-600"
                />
              </label>
            );
          })}
        </div>

        {p && view.plan.byYear.length > 0 && (
          <details className="group text-[11px] text-slate-500">
            <summary className="flex cursor-pointer list-none items-center gap-1 font-medium text-slate-600 [&::-webkit-details-marker]:hidden">
              <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
              Year-by-year
            </summary>
            <table className="mt-1.5 w-full tabular-nums">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-400">
                  <th className="py-1 text-left font-semibold">Yr</th>
                  <th className="py-1 text-right font-semibold">Principal</th>
                  <th className="py-1 text-right font-semibold">Interest</th>
                  <th className="py-1 text-right font-semibold">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {view.plan.byYear.map((y) => (
                  <tr key={y.year}>
                    <td className="py-1">{y.year}</td>
                    <td className="py-1 text-right">{formatShortINR(y.principal)}</td>
                    <td className="py-1 text-right text-rose-600">{formatShortINR(y.interest)}</td>
                    <td className="py-1 text-right">{formatShortINR(y.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1.5">Reducing balance, monthly rest. Processing fees and rate changes aren't included.</p>
          </details>
        )}
      </div>
    </div>
  );
}
