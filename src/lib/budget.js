import { BUCKET_META, CATEGORY_COLORS } from './constants';

export function formatMoney(val, currency) {
  const num = Number(val) || 0;
  return `${currency}${num.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function computeMetrics(transactions, plan) {
  let totalIncome = 0;
  let totalExpenses = 0;
  let totalSavings = 0;
  const byBucket = { needs: 0, wants: 0, savings: 0 };
  const byCategory = {};

  transactions.forEach((tx) => {
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
    totalIncome,
    totalExpenses,
    totalSavings,
    netCashflow,
    byCategory,
    bucketList,
    categoryBreakdown
  };
}
