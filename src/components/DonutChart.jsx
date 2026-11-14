import { PieChart as PieChartIcon } from 'lucide-react';
import { useFormatMoney } from '../store/dbStore';

export default function DonutChart({ items }) {
  const formatMoney = useFormatMoney();
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const size = 180;
  const strokeWidth = 26;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  if (total <= 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-slate-400 text-sm">
        <PieChartIcon className="w-8 h-8 mb-2 opacity-40" />
        No outflows logged yet
      </div>
    );
  }

  let cumulativePercent = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {items.map((item) => {
            const percent = item.value / total;
            const strokeDasharray = `${percent * circumference} ${circumference}`;
            const strokeDashoffset = -cumulativePercent * circumference;
            cumulativePercent += percent;
            return (
              <circle
                key={item.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="transparent"
                stroke={item.color}
                strokeWidth={strokeWidth}
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-500"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Outflows</span>
          <span className="text-base font-bold text-slate-800">{formatMoney(total)}</span>
        </div>
      </div>

      <div className="flex-1 w-full space-y-2 max-h-48 overflow-y-auto pr-1">
        {items.map((item) => {
          const pct = Math.round((item.value / total) * 100);
          return (
            <div key={item.label} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-slate-700 font-medium truncate">{item.label}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <span className="text-slate-400">{pct}%</span>
                <span className="font-semibold text-slate-800">{formatMoney(item.value)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
