import { CATEGORIES, today } from './constants';

// Validation for anything the model proposes, before it touches stored data.
const RATIO_KEYS = ['needs', 'wants', 'savings'];
export const TX_TYPES = ['expense', 'income', 'savings'];
export const CARD_TYPES = ['none', 'summary', 'buckets', 'categories', 'portfolio', 'goals'];

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

export function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

// Coerce one model-produced transaction into a consistent shape. `type` is the
// source of truth: income/savings always map to their own bucket, and expenses
// can only be needs or wants. Returns null if the entry is unusable.
export function normalizeTransaction(t) {
  const amount = Math.abs(Number(t?.amount));
  if (!Number.isFinite(amount) || amount === 0) return null;
  if (!TX_TYPES.includes(t.type)) return null;
  const bucket = t.type === 'expense' ? (t.bucket === 'wants' ? 'wants' : 'needs') : t.type;
  const category = CATEGORIES.includes(t.category) ? t.category : 'Other';
  return {
    description: String(t.description || '').trim() || category,
    amount,
    type: t.type,
    bucket,
    category,
    date: isValidDate(t.date) ? t.date : today(),
    ...(typeof t.goalId === 'string' && t.goalId ? { goalId: t.goalId } : {})
  };
}

// Apply a model-produced plan update to `prev` without mutating it. Partial
// ratio changes keep the given values and rebalance the rest proportionally so
// the split always totals 100. Returns what was applied and what was rejected.
export function applyPlanUpdate(prev, pu, fmt) {
  const next = { ...prev, ratios: { ...prev.ratios }, categoryLimits: { ...prev.categoryLimits } };
  const applied = [];
  const skipped = [];

  if (pu.monthlyIncomeTarget != null) {
    if (isFiniteNumber(pu.monthlyIncomeTarget) && pu.monthlyIncomeTarget > 0) {
      next.monthlyIncomeTarget = pu.monthlyIncomeTarget;
      applied.push(`Income Target: ${fmt(pu.monthlyIncomeTarget)}`);
    } else {
      skipped.push(`income target of ${pu.monthlyIncomeTarget} is invalid`);
    }
  }

  const given = {};
  RATIO_KEYS.forEach((key) => {
    const v = pu[`${key}Ratio`];
    if (v == null) return;
    if (isFiniteNumber(v) && v >= 0 && v <= 100) given[key] = v;
    else skipped.push(`${key} ratio of ${v}% is invalid`);
  });
  const givenKeys = Object.keys(given);
  if (givenKeys.length > 0) {
    const givenSum = givenKeys.reduce((s, k) => s + given[k], 0);
    const rest = RATIO_KEYS.filter((k) => !(k in given));
    const fits = rest.length === 0 ? Math.abs(givenSum - 100) < 0.01 : givenSum <= 100;
    if (!fits) {
      skipped.push(
        `split (${givenKeys.map((k) => `${k} ${given[k]}%`).join(', ')}) doesn't add up to 100%`
      );
    } else {
      const ratios = { ...given };
      const remaining = 100 - givenSum;
      const prevRestSum = rest.reduce((s, k) => s + prev.ratios[k], 0);
      let assigned = 0;
      rest.forEach((k, i) => {
        if (i === rest.length - 1) {
          ratios[k] = remaining - assigned;
        } else {
          ratios[k] = Math.round(
            prevRestSum > 0 ? (remaining * prev.ratios[k]) / prevRestSum : remaining / rest.length
          );
          assigned += ratios[k];
        }
      });
      next.ratios = ratios;
      applied.push(`Split: ${ratios.needs}/${ratios.wants}/${ratios.savings}`);
    }
  }

  (pu.categoryLimitUpdates || []).forEach((item) => {
    if (!CATEGORIES.includes(item?.category) || item.category === 'Salary & Income') {
      skipped.push(`limit for unknown category "${item?.category}"`);
    } else if (!isFiniteNumber(item.limit) || item.limit < 0) {
      skipped.push(`${item.category} limit of ${item.limit} is invalid`);
    } else {
      next.categoryLimits[item.category] = item.limit;
      applied.push(`${item.category} limit: ${fmt(item.limit)}`);
    }
  });

  return { plan: applied.length > 0 ? next : prev, applied, skipped };
}
