// "↑ 18% vs Oct" — change against the previous month. `goodWhenUp` decides
// the colour (spending up is bad, savings up is good).
export default function Delta({ now, prev, prevLabel, goodWhenUp = false, className = '' }) {
  if (!(prev > 0)) return null;
  const pct = Math.round(((now - prev) / prev) * 100);
  if (pct === 0) return <span className={`text-slate-400 ${className}`}>same as {prevLabel}</span>;
  const up = pct > 0;
  const good = up === goodWhenUp;
  return (
    <span className={`${good ? 'text-emerald-600' : 'text-rose-600'} ${className}`}>
      {up ? '↑' : '↓'} {Math.abs(pct)}% vs {prevLabel}
    </span>
  );
}

export const shortMonth = (month) => new Date(`${month}-01T00:00:00`).toLocaleDateString([], { month: 'short' });
