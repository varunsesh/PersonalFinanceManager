import { BarChart3, PieChart as PieChartIcon } from 'lucide-react';
import AllocationBarChart from '../components/AllocationBarChart';
import DataControls from '../components/DataControls';
import DonutChart from '../components/DonutChart';
import KpiCards from '../components/KpiCards';
import LedgerCard from '../components/LedgerCard';
import { useBudgetMetrics, useDbStore } from '../store/dbStore';

export default function Dashboard() {
  const metrics = useBudgetMetrics();
  const ratios = useDbStore((s) => s.plan.ratios);

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-5xl w-full mx-auto p-3 sm:p-4 space-y-4 pb-10">
        <DataControls />
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

        <LedgerCard />
      </div>
    </main>
  );
}
