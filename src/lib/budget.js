import { BUCKET_META, CATEGORY_COLORS, currentMonth } from './constants';

export function formatMoney(val, currency) {
  const num = Number(val) || 0;
  return `${currency}${num.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

// Totals for one month (YYYY-MM, default the current month), since the plan's
// income target and 50/30/20 split are monthly. Older transactions stay in
// the ledger but don't count here. Pass the ledger (with EMI instalments);
// credit card bill payments are transfers and never count.
export function computeMetrics(transactions, plan, month = currentMonth()) {
  let totalIncome = 0;
  let totalExpenses = 0;
  let totalSavings = 0;
  const byBucket = { needs: 0, wants: 0, savings: 0 };
  const byCategory = {};

  transactions.forEach((tx) => {
    if (!String(tx.date).startsWith(month) || tx.type === 'card_payment') return;
    const amt = Number(tx.amount) || 0;
    if (tx.type === 'income' || tx.bucket === 'income') {
      totalIncome += amt;
    } else if (tx.type === 'savings' || tx.bucket === 'savings') {
      totalSavings += amt;
      byBucket.savings += amt;
      byCategory[tx.category] = (byCategory[tx.category] || 0) + amt;
    } else {
      totalExpenses += amt;
      const b = tx.bucket === 'wants' ? 'wants' : 'needs';
      byBucket[b] += amt;
      byCategory[tx.category] = (byCategory[tx.category] || 0) + amt;
    }
  });

  const netCashflow = totalIncome - totalExpenses - totalSavings;
  const baseIncome = totalIncome > 0 ? totalIncome : plan.monthlyIncomeTarget;

  const bucketList = ['needs', 'wants', 'savings'].map((key) => ({
    key,
    ...BUCKET_META[key],
    ratio: plan.ratios[key],
    target: Math.round((baseIncome * plan.ratios[key]) / 100),
    actual: byBucket[key]
  }));

  const categoryBreakdown = Object.entries(byCategory)
    .map(([label, value]) => ({
      label,
      value,
      color: CATEGORY_COLORS[label] || '#64748b'
    }))
    .sort((a, b) => b.value - a.value);

  return {
    month,
    totalIncome,
    totalExpenses,
    totalSavings,
    netCashflow,
    byCategory,
    bucketList,
    categoryBreakdown
  };
}

// Compact Indian-style amounts for headlines: ₹45K, ₹21.2L, ₹1.4Cr.
export function formatShortINR(val) {
  const n = Number(val) || 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const trim = (x) => x.toFixed(x >= 100 ? 0 : 1).replace(/\.0$/, '');
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)}Cr`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)}L`;
  if (abs >= 1e3) return `${sign}₹${trim(abs / 1e3)}K`;
  return `${sign}₹${Math.round(abs)}`;
}

// The month before `month` (YYYY-MM).
export function previousMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

// Spending budget for the current month: income (or the income target until
// salary is logged) × needs+wants share, minus expenses so far, spread over
// the days left.
export function monthSnapshot(transactions, plan, isoToday) {
  const month = isoToday.slice(0, 7);
  let income = 0;
  let spent = 0;
  let saved = 0;
  transactions.forEach((t) => {
    if (!t.date.startsWith(month)) return;
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') spent += t.amount;
    else if (t.type === 'savings') saved += t.amount;
  });
  const usingTarget = income <= 0;
  const base = usingTarget ? plan.monthlyIncomeTarget : income;
  const budget = (base * (plan.ratios.needs + plan.ratios.wants)) / 100;
  const [y, m, d] = isoToday.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const daysLeft = daysInMonth - d + 1;
  const left = budget - spent;
  return {
    month,
    income,
    usingTarget,
    budget: Math.round(budget),
    spent: Math.round(spent),
    saved: Math.round(saved),
    left: Math.round(left),
    perDay: Math.max(0, Math.round(left / daysLeft)),
    daysLeft,
    elapsedPct: Math.round(((d - 1) / daysInMonth) * 100),
    spentPct: budget > 0 ? Math.round((spent / budget) * 100) : 0
  };
}
