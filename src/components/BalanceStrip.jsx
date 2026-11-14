import { useBudgetMetrics, useFormatMoney } from '../store/dbStore';

export default function BalanceStrip({ onOpenDashboard }) {
  const metrics = useBudgetMetrics();
  const formatMoney = useFormatMoney();

  return (
    <div className="px-4 py-2 bg-slate-50/90 border-b border-slate-100 flex items-center justify-between text-xs shrink-0">
      <div className="flex items-center gap-3">
        <span className="text-slate-500">
          Spent: <strong className="text-slate-800">{formatMoney(metrics.totalExpenses)}</strong>
        </span>
        <span className="text-slate-300">|</span>
        <span className="text-slate-500">
          Saved: <strong className="text-emerald-600">{formatMoney(metrics.totalSavings)}</strong>
        </span>
      </div>
      <button
        type="button"
        onClick={onOpenDashboard}
        className="text-indigo-600 font-semibold hover:underline"
      >
        View Charts →
      </button>
    </div>
  );
}
