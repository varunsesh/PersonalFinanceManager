import { formatShortINR } from '../lib/budget';

const shortDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString([], { day: 'numeric', month: 'short' });
const monthYear = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString([], { month: 'short', year: 'numeric' });

function EmiRow({ emi: e, action }) {
  const pct = Math.round((e.paidCount / e.months) * 100);
  return (
    <div className="flex items-start gap-2 py-1.5">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <span className="truncate font-medium text-slate-700">{e.description}</span>
          <span className="shrink-0 tabular-nums text-slate-500">
            <span className="font-semibold text-slate-800">{formatShortINR(e.emi)}/mo</span> · {e.paidCount}/{e.months}
          </span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
        </div>
        <div className="text-[10px] text-slate-400">
          {formatShortINR(e.principalLeft)} principal left · {e.ratePct > 0 ? `${e.ratePct}%` : 'no-cost'}
          {e.totalInterest > 0 && ` · ${formatShortINR(e.totalInterest)} interest`}
          {e.nextDate && ` · next ${shortDate(e.nextDate)}`} · ends {monthYear(e.endDate)}
        </div>
      </div>
      {action}
    </div>
  );
}

export function CreditCardRow({ card: c, cardAction, emiAction }) {
  const pct = c.utilisationPct ?? 0;
  const high = pct > 30;
  return (
    <div className="space-y-2 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-slate-800">{c.name}</div>
          <div className="text-[11px] text-slate-500">
            {c.nextDueDate ? `Due ${shortDate(c.nextDueDate)}` : 'No due date set'}
            {c.monthlyEmi > 0 && ` · EMIs ${formatShortINR(c.monthlyEmi)}/mo`}
          </div>
        </div>
        <div className="flex shrink-0 items-start gap-1">
          <div className="text-right">
            <div className={`text-sm font-bold tabular-nums ${c.balance < 0 ? 'text-emerald-600' : 'text-slate-900'}`}>
              {c.balance < 0 ? `${formatShortINR(-c.balance)} credit` : formatShortINR(c.balance)}
            </div>
            <div className="text-[10px] text-slate-400">balance</div>
          </div>
          {cardAction}
        </div>
      </div>

      {c.limit != null && (
        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${pct > 100 ? 'bg-rose-500' : high ? 'bg-amber-500' : 'bg-indigo-600'}`}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-500">
            <span>
              {pct}% of {formatShortINR(c.limit)} used
              {c.emiPrincipalLeft > 0 && ` (incl. ${formatShortINR(c.emiPrincipalLeft)} EMI principal)`}
            </span>
            <span className="tabular-nums">{formatShortINR(Math.max(0, c.available))} free</span>
          </div>
        </div>
      )}
      {c.limit == null && c.emiPrincipalLeft > 0 && (
        <div className="text-[10px] text-slate-500">
          Plus {formatShortINR(c.emiPrincipalLeft)} EMI principal still to be billed · {formatShortINR(c.totalOwed)} owed in all
        </div>
      )}

      <div className="text-[11px] text-slate-500">
        This month: spent <span className="font-semibold tabular-nums text-slate-700">{formatShortINR(c.thisMonth.spent)}</span> · paid{' '}
        <span className="font-semibold tabular-nums text-slate-700">{formatShortINR(c.thisMonth.paid)}</span>
      </div>

      {c.emis.length > 0 && (
        <div className="rounded-lg bg-slate-50 px-2.5 py-1">
          {c.emis.map((e) => (
            <EmiRow key={e.id} emi={e} action={emiAction?.(e)} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CreditCardList({ overview, cardAction, emiAction }) {
  return (
    <div className="divide-y divide-slate-100">
      {overview.cards.map((c) => (
        <CreditCardRow key={c.id} card={c} cardAction={cardAction?.(c)} emiAction={emiAction} />
      ))}
    </div>
  );
}
