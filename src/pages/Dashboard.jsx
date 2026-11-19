import { useEffect, useState } from 'react';
import { BarChart3, PieChart as PieChartIcon } from 'lucide-react';
import AllocationBarChart from '../components/AllocationBarChart';
import DataControls from '../components/DataControls';
import DonutChart from '../components/DonutChart';
import GoalsSection from '../components/GoalsSection';
import KpiCards from '../components/KpiCards';
import LedgerCard from '../components/LedgerCard';
import PortfolioSection from '../components/PortfolioSection';
import { useBudgetMetrics, useDbStore } from '../store/dbStore';

const TABS = [
  ['month', 'This month'],
  ['goals', 'Goals'],
  ['investments', 'Investments']
];

const monthLabel = (month) =>
  new Date(`${month}-01T00:00:00`).toLocaleDateString([], { month: 'long', year: 'numeric' });

function ThisMonth({ ledgerTab, targetSeq }) {
  const metrics = useBudgetMetrics();
  const ratios = useDbStore((s) => s.plan.ratios);
  return (
    <>
      <h2 className="px-1 text-sm font-semibold text-slate-700">{monthLabel(metrics.month)}</h2>
      <KpiCards />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-800">
              {ratios.needs}/{ratios.wants}/{ratios.savings} Plan vs. Actual
            </h3>
          </div>
          <AllocationBarChart buckets={metrics.bucketList} />
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <PieChartIcon className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-800">Outflows by Category</h3>
          </div>
          <DonutChart items={metrics.categoryBreakdown} />
        </div>
      </div>

      <LedgerCard initialTab={ledgerTab} targetSeq={targetSeq} />
      <DataControls />
    </>
  );
}

// The Plan view: this month's budget, goals and investments.
export default function Dashboard({ target }) {
  const [tab, setTab] = useState(target?.tab || 'month');

  useEffect(() => {
    if (target?.tab) setTab(target.tab);
  }, [target?.tab, target?.seq]);

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-5xl w-full mx-auto p-3 sm:p-4 space-y-4 pb-10">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-200/60 p-1">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-lg py-1.5 text-xs font-semibold transition-all ${
                tab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'month' && <ThisMonth ledgerTab={target?.ledgerTab} targetSeq={target?.seq} />}
        {tab === 'goals' && <GoalsSection />}
        {tab === 'investments' && <PortfolioSection />}
      </div>
    </main>
  );
}
