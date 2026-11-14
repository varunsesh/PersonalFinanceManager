import { PiggyBank, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { useBudgetMetrics, useDbStore, useFormatMoney } from '../store/dbStore';

export default function KpiCards() {
  const metrics = useBudgetMetrics();
  const plan = useDbStore((s) => s.plan);
  const formatMoney = useFormatMoney();

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
          <span>Income</span>
          <TrendingUp className="w-4 h-4 text-emerald-600" />
        </div>
        <div className="text-lg font-bold text-slate-900">{formatMoney(metrics.totalIncome)}</div>
        <div className="text-[11px] text-slate-400 mt-0.5">Target: {formatMoney(plan.monthlyIncomeTarget)}</div>
      </div>

      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
          <span>Expenses</span>
          <TrendingDown className="w-4 h-4 text-rose-600" />
        </div>
        <div className="text-lg font-bold text-slate-900">{formatMoney(metrics.totalExpenses)}</div>
        <div className="text-[11px] text-slate-400 mt-0.5">Needs + Wants</div>
      </div>

      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
          <span>Saved</span>
          <PiggyBank className="w-4 h-4 text-indigo-600" />
        </div>
        <div className="text-lg font-bold text-emerald-600">{formatMoney(metrics.totalSavings)}</div>
        <div className="text-[11px] text-slate-400 mt-0.5">
          {metrics.totalIncome > 0
            ? `${Math.round((metrics.totalSavings / metrics.totalIncome) * 100)}% savings rate`
            : `Goal: ${plan.ratios.savings}%`}
        </div>
      </div>

      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between text-slate-500 text-xs font-medium mb-1">
          <span>Unallocated</span>
          <Wallet className="w-4 h-4 text-amber-500" />
        </div>
        <div className={`text-lg font-bold ${metrics.netCashflow >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
          {formatMoney(metrics.netCashflow)}
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5">Remaining buffer</div>
      </div>
    </div>
  );
}
