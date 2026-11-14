import { useState } from 'react';
import { Check, Edit3, X } from 'lucide-react';
import { CATEGORIES } from '../lib/constants';
import { useBudgetMetrics, useDbStore, useFormatMoney } from '../store/dbStore';

export default function CategoryLimitsTable() {
  const metrics = useBudgetMetrics();
  const plan = useDbStore((s) => s.plan);
  const setCategoryLimit = useDbStore((s) => s.setCategoryLimit);
  const formatMoney = useFormatMoney();
  const [editingCat, setEditingCat] = useState(null);
  const [editingVal, setEditingVal] = useState('');

  const saveLimit = (cat) => {
    const val = parseFloat(editingVal);
    if (!isNaN(val) && val >= 0) setCategoryLimit(cat, val);
    setEditingCat(null);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-400 bg-slate-50/40">
            <th className="py-2.5 px-4 font-semibold">Category</th>
            <th className="py-2.5 px-4 font-semibold text-right">Actual</th>
            <th className="py-2.5 px-4 font-semibold text-right">Limit</th>
            <th className="py-2.5 px-4 font-semibold">Progress</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-xs">
          {CATEGORIES.filter((c) => c !== 'Salary & Income').map((cat) => {
            const spent = metrics.byCategory[cat] || 0;
            const limit = plan.categoryLimits[cat] || 0;
            const pct = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
            const isOver = limit > 0 && spent > limit && cat !== 'Savings & Investments';

            return (
              <tr key={cat} className="hover:bg-slate-50/80">
                <td className="py-2.5 px-4 font-medium text-slate-800">{cat}</td>
                <td className="py-2.5 px-4 text-right font-semibold text-slate-800">
                  {formatMoney(spent)}
                </td>
                <td className="py-2.5 px-4 text-right">
                  {editingCat === cat ? (
                    <div className="inline-flex items-center justify-end gap-1">
                      <input
                        type="number"
                        value={editingVal}
                        onChange={(e) => setEditingVal(e.target.value)}
                        className="w-20 text-right border border-indigo-300 rounded px-1.5 py-0.5 text-xs"
                        autoFocus
                      />
                      <button onClick={() => saveLimit(cat)} className="text-emerald-600 p-0.5">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setEditingCat(null)} className="text-slate-400 p-0.5">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingCat(cat);
                        setEditingVal(String(limit));
                      }}
                      className="inline-flex items-center gap-1 text-slate-600 hover:text-indigo-600 font-medium"
                    >
                      {formatMoney(limit)}
                      <Edit3 className="w-3 h-3 opacity-60" />
                    </button>
                  )}
                </td>
                <td className="py-2.5 px-4 w-36">
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${isOver ? 'bg-rose-500' : 'bg-indigo-600'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
