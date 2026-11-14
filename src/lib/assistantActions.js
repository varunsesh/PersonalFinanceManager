import { CATEGORIES } from './constants';
import { CARD_TYPES, applyPlanUpdate, normalizeTransaction } from './validation';
import { currentValue, portfolioSummary } from './portfolio';

const describe = (tx, fmt) => `${tx.type === 'income' ? '+' : '-'}${fmt(tx.amount)} (${tx.category})`;

// Turn a validated Gemini result into the next budget state, plus a record of
// exactly what changed so the reply can be undone later. New ids derive from
// result.idBase so repeated runs over the same result produce the same ids.
//   changes = { added: [tx], edited: [{ before, after }], deleted: [tx], plan: { before, after } | null,
//               holdings: { added: [h], edited: [{ before, after }], removed: [h] } }
export function applyAssistantResult(result, { transactions, plan, holdings = [] }, fmt) {
  const badges = [];
  const skipped = [];
  const changes = { added: [], edited: [], deleted: [], plan: null, holdings: { added: [], edited: [], removed: [] } };
  let nextTransactions = transactions;
  let nextPlan = plan;
  const byId = new Map(transactions.map((t) => [t.id, t]));

  const deleteIds = new Set();
  (Array.isArray(result.deleteTransactionIds) ? result.deleteTransactionIds : []).forEach((id) => {
    const tx = byId.get(id);
    if (!tx) {
      skipped.push(`couldn't find a transaction to delete (${id})`);
      return;
    }
    deleteIds.add(id);
    changes.deleted.push(tx);
    badges.push(`Deleted ${describe(tx, fmt)}`);
  });

  const edits = new Map();
  (Array.isArray(result.transactionEdits) ? result.transactionEdits : []).forEach((edit) => {
    const before = byId.get(edit?.id);
    if (!before || deleteIds.has(before.id)) {
      skipped.push(`couldn't find a transaction to edit (${edit?.id})`);
      return;
    }
    const patch = Object.fromEntries(
      Object.entries(edit).filter(([k, v]) => k !== 'id' && v != null)
    );
    const normalized = normalizeTransaction({ ...before, ...patch });
    if (!normalized) {
      skipped.push(`edit to "${before.description}" had an invalid amount or type`);
      return;
    }
    const after = { ...normalized, id: before.id };
    edits.set(before.id, after);
    changes.edited.push({ before, after });
    badges.push(
      before.amount !== after.amount
        ? `Edited ${after.description}: ${fmt(before.amount)} → ${fmt(after.amount)}`
        : `Edited ${after.description}`
    );
  });

  if (deleteIds.size > 0 || edits.size > 0) {
    nextTransactions = nextTransactions
      .filter((t) => !deleteIds.has(t.id))
      .map((t) => edits.get(t.id) ?? t);
  }

  (Array.isArray(result.transactions) ? result.transactions : []).forEach((raw, idx) => {
    const t = normalizeTransaction(raw);
    if (!t) {
      skipped.push(`transaction "${raw?.description ?? 'unknown'}" had an invalid amount or type`);
      return;
    }
    const tx = { id: `tx-${result.idBase ?? Date.now()}-${idx}`, ...t };
    changes.added.push(tx);
    badges.push(describe(tx, fmt));
  });
  if (changes.added.length > 0) nextTransactions = [...changes.added, ...nextTransactions];

  if (result.planUpdate) {
    const update = applyPlanUpdate(plan, result.planUpdate, fmt);
    badges.push(...update.applied);
    skipped.push(...update.skipped);
    if (update.applied.length > 0) {
      nextPlan = update.plan;
      changes.plan = { before: plan, after: update.plan };
    }
  }

  // Holdings arrive already priced from the tools; ids are checked here again
  // against the current state in case it changed during the request.
  let nextHoldings = holdings;
  const holdingIds = new Set(holdings.map((h) => h.id));
  const removeIds = new Set((result.holdingRemoveIds ?? []).filter((id) => holdingIds.has(id)));
  const holdingEdits = new Map(
    (result.holdingEdits ?? []).filter((e) => holdingIds.has(e.before.id) && !removeIds.has(e.before.id)).map((e) => [e.before.id, e])
  );
  const describeHolding = (h) => {
    const v = currentValue(h);
    return v != null ? `${h.name} (${fmt(v)})` : h.name;
  };
  if (removeIds.size || holdingEdits.size || result.holdingsAdded?.length) {
    nextHoldings = holdings
      .filter((h) => {
        if (!removeIds.has(h.id)) return true;
        changes.holdings.removed.push(h);
        badges.push(`Removed holding ${h.name}`);
        return false;
      })
      .map((h) => {
        const e = holdingEdits.get(h.id);
        if (!e) return h;
        changes.holdings.edited.push(e);
        badges.push(`Updated ${describeHolding(e.after)}`);
        return e.after;
      });
    (result.holdingsAdded ?? []).forEach((h) => {
      changes.holdings.added.push(h);
      badges.push(`Added ${describeHolding(h)}`);
    });
    nextHoldings = [...nextHoldings, ...changes.holdings.added];
  }

  const holdingsChanged = changes.holdings.added.length + changes.holdings.edited.length + changes.holdings.removed.length > 0;
  const changed =
    changes.added.length + changes.edited.length + changes.deleted.length > 0 || changes.plan !== null || holdingsChanged;
  return {
    transactions: nextTransactions,
    plan: nextPlan,
    holdings: nextHoldings,
    badges,
    skipped,
    changes: changed ? changes : null
  };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Reverse a recorded set of changes against the *current* state. Anything the
// user has changed again since then is left alone.
export function undoChanges(changes, { transactions, plan, holdings = [] }) {
  const addedIds = new Set(changes.added.map((t) => t.id));
  const editedBefore = new Map(changes.edited.map(({ before, after }) => [after.id, { before, after }]));

  let nextTransactions = transactions
    .filter((t) => !addedIds.has(t.id))
    .map((t) => {
      const edit = editedBefore.get(t.id);
      return edit && same(t, edit.after) ? edit.before : t;
    });
  const present = new Set(nextTransactions.map((t) => t.id));
  const restored = changes.deleted.filter((t) => !present.has(t.id));
  if (restored.length > 0) nextTransactions = [...restored, ...nextTransactions];

  let nextPlan = plan;
  if (changes.plan) {
    const { before, after } = changes.plan;
    nextPlan = { ...plan, ratios: { ...plan.ratios }, categoryLimits: { ...plan.categoryLimits } };
    if (plan.monthlyIncomeTarget === after.monthlyIncomeTarget) {
      nextPlan.monthlyIncomeTarget = before.monthlyIncomeTarget;
    }
    if (same(plan.ratios, after.ratios)) nextPlan.ratios = before.ratios;
    Object.keys(after.categoryLimits).forEach((cat) => {
      if (before.categoryLimits[cat] !== after.categoryLimits[cat] && plan.categoryLimits[cat] === after.categoryLimits[cat]) {
        nextPlan.categoryLimits[cat] = before.categoryLimits[cat];
      }
    });
  }

  let nextHoldings = holdings;
  if (changes.holdings) {
    const added = new Set(changes.holdings.added.map((h) => h.id));
    const edited = new Map(changes.holdings.edited.map(({ before, after }) => [after.id, { before, after }]));
    nextHoldings = holdings
      .filter((h) => !added.has(h.id))
      .map((h) => {
        const e = edited.get(h.id);
        // Prices refresh in the background, so compare everything but price fields
        return e && sameIgnoringPrice(h, e.after) ? { ...e.before, ...priceFields(h) } : h;
      });
    const present = new Set(nextHoldings.map((h) => h.id));
    nextHoldings = [...nextHoldings, ...changes.holdings.removed.filter((h) => !present.has(h.id))];
  }

  return { transactions: nextTransactions, plan: nextPlan, holdings: nextHoldings };
}

const PRICE_KEYS = ['price', 'priceDate', 'priceFetchedAt', 'fxRate'];
const priceFields = (h) => Object.fromEntries(PRICE_KEYS.filter((k) => k in h).map((k) => [k, h[k]]));
const withoutPrice = (h) => Object.fromEntries(Object.entries(h).filter(([k]) => !PRICE_KEYS.includes(k)));
const sameIgnoringPrice = (a, b) => same(withoutPrice(a), withoutPrice(b));

const WARN_AT = 0.8;
const NO_LIMIT_WARNINGS = new Set(['Savings & Investments', 'Salary & Income']);

// Warnings for categories and buckets whose spending went up in this reply and
// crossed 80% or 100% of their limit (or was already over and grew further).
export function budgetAlerts(before, after, plan, fmt) {
  const alerts = [];
  const check = (label, prevSpent, spent, limit) => {
    if (!(limit > 0) || spent <= prevSpent) return;
    if (spent > limit) {
      alerts.push(`${label} is over budget: ${fmt(spent)} of ${fmt(limit)} (${fmt(spent - limit)} over)`);
    } else if (spent >= limit * WARN_AT && prevSpent < limit * WARN_AT) {
      alerts.push(`${label} is at ${Math.round((spent / limit) * 100)}% of its limit: ${fmt(spent)} of ${fmt(limit)}`);
    }
  };

  CATEGORIES.filter((c) => !NO_LIMIT_WARNINGS.has(c)).forEach((cat) => {
    check(cat, before.byCategory[cat] || 0, after.byCategory[cat] || 0, plan.categoryLimits[cat]);
  });
  after.bucketList
    .filter((b) => b.key !== 'savings')
    .forEach((b) => {
      const prev = before.bucketList.find((x) => x.key === b.key)?.actual ?? 0;
      check(`${b.key === 'needs' ? 'Needs' : 'Wants'} spending`, prev, b.actual, b.target);
    });
  return alerts;
}

// Data for an inline chat card, captured when the reply is made so the card
// keeps showing what the reply talked about.
export function buildCard(type, metrics, plan, { holdings = [], slabPct = 30 } = {}) {
  if (!CARD_TYPES.includes(type) || type === 'none') return null;
  if (type === 'portfolio') {
    const p = portfolioSummary(holdings, slabPct);
    return {
      type,
      month: metrics.month,
      data: {
        asOf: p.asOf,
        total: p.total,
        invested: p.invested,
        gain: p.gain,
        exitTax: p.exitTax,
        afterTaxIfSold: p.afterTaxIfSold,
        allocation: p.allocation,
        holdings: [...p.holdings].sort((a, b) => (b.value ?? 0) - (a.value ?? 0)).slice(0, 6)
      }
    };
  }
  if (type === 'summary') {
    return {
      type,
      month: metrics.month,
      data: {
        income: metrics.totalIncome,
        expenses: metrics.totalExpenses,
        savings: metrics.totalSavings,
        unallocated: metrics.netCashflow
      }
    };
  }
  if (type === 'buckets') {
    return {
      type,
      month: metrics.month,
      data: metrics.bucketList.map(({ key, label, color, bg, text, ratio, target, actual }) => ({
        key, label, color, bg, text, ratio, target, actual
      }))
    };
  }
  return {
    type,
    month: metrics.month,
    data: CATEGORIES.filter((c) => !NO_LIMIT_WARNINGS.has(c) || c === 'Savings & Investments')
      .map((category) => ({
        category,
        spent: metrics.byCategory[category] || 0,
        limit: plan.categoryLimits[category] || 0
      }))
      .filter((c) => c.spent > 0 || c.limit > 0)
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 6)
  };
}
