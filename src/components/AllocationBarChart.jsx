import { useFormatMoney } from '../store/dbStore';

export default function AllocationBarChart({ buckets }) {
  const formatMoney = useFormatMoney();
  return (
    <div className="space-y-4">
      {buckets.map((b) => {
        const pctOfTarget = b.target > 0 ? Math.min(100, Math.round((b.actual / b.target) * 100)) : 0;
        const isOver = b.key !== 'savings' && b.actual > b.target && b.target > 0;
        return (
          <div key={b.key} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-800">{b.label}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${b.bg} ${b.text}`}>
                  Target {b.ratio}%
                </span>
              </div>
              <div className="text-right">
                <span className={`font-bold ${isOver ? 'text-rose-600' : 'text-slate-800'}`}>
                  {formatMoney(b.actual)}
                </span>
                <span className="text-slate-400"> / {formatMoney(b.target)}</span>
              </div>
            </div>
            <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${pctOfTarget}%`,
                  backgroundColor: isOver ? '#e11d48' : b.color
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
