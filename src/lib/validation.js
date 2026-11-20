import { CATEGORIES, today } from './constants';

// Validation for anything the model proposes, before it touches stored data.
const RATIO_KEYS = ['needs', 'wants', 'savings'];
// card_payment: a lump-sum credit card bill payment (a transfer, not spending)
export const TX_TYPES = ['expense', 'income', 'savings', 'card_payment'];
export const CARD_TYPES = ['none', 'summary', 'buckets', 'categories', 'portfolio', 'goals', 'suggestions', 'cards'];

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

export function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !isNaN(d) && d.toISOString().slice(0, 10) === s;
}

// Coerce one model-produced transaction into a consistent shape. `type` is the
// source of truth: income/savings always map to their own bucket, and expenses
// can only be needs or wants. Expenses may carry the cardId they were paid
// with; card payments must name the card they pay off. Returns null if the
// entry is unusable.
export function normalizeTransaction(t) {
  const amount = Math.abs(Number(t?.amount));
  if (!Number.isFinite(amount) || amount === 0) return null;
  if (!TX_TYPES.includes(t.type)) return null;
  const cardId = typeof t.cardId === 'string' && t.cardId ? t.cardId : null;
  if (t.type === 'card_payment') {
    if (!cardId) return null;
    return {
      description: String(t.description || '').trim() || 'Credit card bill payment',
      amount,
      type: 'card_payment',
      bucket: 'transfer',
      category: 'Other',
      date: isValidDate(t.date) ? t.date : today(),
      cardId
    };
  }
  const bucket = t.type === 'expense' ? (t.bucket === 'wants' ? 'wants' : 'needs') : t.type;
  const category = CATEGORIES.includes(t.category) ? t.category : 'Other';
  return {
    description: String(t.description || '').trim() || category,
    amount,
    type: t.type,
    bucket,
    category,
    date: isValidDate(t.date) ? t.date : today(),
    ...(typeof t.goalId === 'string' && t.goalId ? { goalId: t.goalId } : {}),
    ...(cardId && t.type === 'expense' ? { cardId } : {})
  };
}

// Validated credit card fields from tool args (partial for updates).
export function cardFields(args) {
  const out = {};
  if (args.name != null) {
    const name = String(args.name).trim().slice(0, 40);
    if (!name) return { error: 'name is required' };
    out.name = name;
  }
  if (args.limit != null) {
    if (!(isFiniteNumber(args.limit) && args.limit > 0)) return { error: 'limit must be a positive amount' };
    out.limit = args.limit;
  }
  if (args.dueDay != null) {
    if (!(Number.isInteger(args.dueDay) && args.dueDay >= 1 && args.dueDay <= 31)) return { error: 'dueDay must be 1-31' };
    out.dueDay = args.dueDay;
  }
  if (args.openingBalance != null) {
    if (!(isFiniteNumber(args.openingBalance) && args.openingBalance >= 0)) return { error: 'openingBalance must be 0 or more' };
    out.openingBalance = args.openingBalance;
  }
  return { fields: out };
}

// Validated EMI plan fields from tool args, merged onto `prev` for updates.
// Returns { plan } or { error }.
export function emiPlanFields(args, prev = {}) {
  const next = { ...prev };
  if (args.description != null) next.description = String(args.description).trim().slice(0, 60);
  if (args.amount != null) next.principal = Number(args.amount);
  if (args.annualRatePct != null) next.ratePct = Number(args.annualRatePct);
  if (args.months != null) next.months = Number(args.months);
  if (args.processingFee != null) next.fee = Number(args.processingFee);
  if (args.category != null) next.category = CATEGORIES.includes(args.category) ? args.category : 'Other';
  if (args.bucket != null) next.bucket = args.bucket === 'wants' ? 'wants' : 'needs';
  if (args.purchaseDate != null) {
    if (!isValidDate(args.purchaseDate)) return { error: 'purchaseDate must be YYYY-MM-DD' };
    next.purchaseDate = args.purchaseDate;
  }
  if (args.firstEmiDate != null) {
    if (!isValidDate(args.firstEmiDate)) return { error: 'firstEmiDate must be YYYY-MM-DD' };
    next.startDate = args.firstEmiDate;
  }
  next.purchaseDate ??= today();
  next.startDate ??= next.purchaseDate;
  next.fee ??= 0;
  next.category ??= 'Other';
  next.bucket ??= 'needs';
  if (!next.description) return { error: 'description is required' };
  if (!(isFiniteNumber(next.principal) && next.principal > 0)) return { error: 'amount (the purchase price converted to EMI) must be positive' };
  next.principal = Math.round(next.principal);
  if (!(isFiniteNumber(next.ratePct) && next.ratePct >= 0 && next.ratePct <= 50)) return { error: 'annualRatePct must be 0-50 (0 for no-cost EMI)' };
  if (!(Number.isInteger(next.months) && next.months >= 1 && next.months <= 60)) return { error: 'months must be a whole number from 1 to 60' };
  if (!(isFiniteNumber(next.fee) && next.fee >= 0)) return { error: 'processingFee must be 0 or more' };
  next.fee = Math.round(next.fee);
  if (next.startDate < next.purchaseDate) return { error: 'firstEmiDate cannot be before purchaseDate' };
  return { plan: next };
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
