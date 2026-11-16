import { CATEGORIES } from './constants';
import { CARD_TYPES, applyPlanUpdate, normalizeTransaction } from './validation';
import { currentValue, portfolioSummary } from './portfolio';
import { goalsOverview } from './goals';
import { calcSettings } from '../store/settingsStore';

const describe = (tx, fmt) => `${tx.type === 'income' ? '+' : '-'}${fmt(tx.amount)} (${tx.category})`;

// Turn a validated Gemini result into the next budget state, plus a record of
// exactly what changed so the reply can be undone later. New ids derive from
// result.idBase so repeated runs over the same result produce the same ids.
//   changes = { added: [tx], edited: [{ before, after }], deleted: [tx], plan: { before, after } | null,
//               holdings: { added, edited, removed }, goals: { added, edited, removed },
//               memories: { added, edited, removed } }
export function applyAssistantResult(result, { transactions, plan, holdings = [], goals = [], memories = [] }, fmt) {
  const badges = [];
  const skipped = [];
  const changes = {
    added: [],
    edited: [],
    deleted: [],
    plan: null,
    holdings: emptyRecord(),
    goals: emptyRecord(),
    memories: emptyRecord()
  };

  // Goals first, so transactions can be tagged with goals created this turn.
  const nextGoals = applyCollection(
    goals,
    { added: result.goalsAdded, edits: result.goalEdits, removeIds: result.goalRemoveIds },
    changes.goals,
    badges,
    { added: (g) => `New goal: ${g.name}`, edited: (g) => `Updated goal ${g.name}`, removed: (g) => `Deleted goal ${g.name}` }
  );
  const goalIds = new Set(nextGoals.map((g) => g.id));
  // Drop goal tags that point at goals that don't exist
  const checkGoal = (t, label) => {
    if (t.goalId && !goalIds.has(t.goalId)) {
      skipped.push(`${label} wasn't linked to a goal (unknown goal ${t.goalId})`);
      const { goalId, ...rest } = t;
      return rest;
    }
    return t;
  };
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
    const after = checkGoal({ ...normalized, id: before.id }, `"${normalized.description}"`);
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
    const tx = checkGoal({ id: `tx-${result.idBase ?? Date.now()}-${idx}`, ...t }, `"${t.description}"`);
    changes.added.push(tx);
    const goal = tx.goalId && nextGoals.find((g) => g.id === tx.goalId);
    badges.push(goal ? `${describe(tx, fmt)} → ${goal.name}` : describe(tx, fmt));
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

  // Holdings arrive already priced from the tools.
  const describeHolding = (h) => {
    const v = currentValue(h);
    return v != null ? `${h.name} (${fmt(v)})` : h.name;
  };
  const nextHoldings = applyCollection(
    holdings,
    { added: result.holdingsAdded, edits: result.holdingEdits, removeIds: result.holdingRemoveIds },
    changes.holdings,
    badges,
    { added: (h) => `Added ${describeHolding(h)}`, edited: (h) => `Updated ${describeHolding(h)}`, removed: (h) => `Removed holding ${h.name}` }
  );

  const short = (m) => (m.text.length > 48 ? `${m.text.slice(0, 47)}…` : m.text);
  const nextMemories = applyCollection(
    memories,
    { added: result.memoriesAdded, edits: result.memoryEdits, removeIds: result.memoryRemoveIds },
    changes.memories,
    badges,
    { added: (m) => `Remembered: ${short(m)}`, edited: (m) => `Updated memory: ${short(m)}`, removed: (m) => `Forgot: ${short(m)}` }
  );

  const changed =
    changes.added.length + changes.edited.length + changes.deleted.length > 0 ||
    changes.plan !== null ||
    recordSize(changes.holdings) > 0 ||
    recordSize(changes.goals) > 0 ||
    recordSize(changes.memories) > 0;
  return {
    transactions: nextTransactions,
    plan: nextPlan,
    holdings: nextHoldings,
    goals: nextGoals,
    memories: nextMemories,
    badges,
    skipped,
    changes: changed ? changes : null
  };
}

const emptyRecord = () => ({ added: [], edited: [], removed: [] });
const recordSize = (r) => (r ? r.added.length + r.edited.length + r.removed.length : 0);

// Apply adds/edits/removals to a list of { id } items (holdings, goals),
// recording what changed. Ids are checked against the current list in case
// it changed while the request was in flight.
function applyCollection(list, { added = [], edits = [], removeIds = [] }, record, badges, label) {
  if (!added?.length && !edits?.length && !removeIds?.length) return list;
  const ids = new Set(list.map((x) => x.id));
  const remove = new Set(removeIds.filter((id) => ids.has(id)));
  const editBy = new Map(edits.filter((e) => ids.has(e.before.id) && !remove.has(e.before.id)).map((e) => [e.before.id, e]));
  const next = list
    .filter((x) => {
      if (!remove.has(x.id)) return true;
      record.removed.push(x);
      badges.push(label.removed(x));
      return false;
    })
    .map((x) => {
      const e = editBy.get(x.id);
      if (!e) return x;
      record.edited.push(e);
      badges.push(label.edited(e.after));
      return e.after;
    });
  added.forEach((x) => {
    record.added.push(x);
    badges.push(label.added(x));
  });
  return [...next, ...record.added];
}

// Reverse applyCollection. Edited items are only reverted if unchanged since
// (ignoring `volatileKeys`, e.g. prices refreshed in the background).
function undoCollection(list, record, volatileKeys = []) {
  if (!record) return list;
  const strip = (x) => Object.fromEntries(Object.entries(x).filter(([k]) => !volatileKeys.includes(k)));
  const keep = (x) => Object.fromEntries(volatileKeys.filter((k) => k in x).map((k) => [k, x[k]]));
  const added = new Set(record.added.map((x) => x.id));
  const edited = new Map(record.edited.map((e) => [e.after.id, e]));
  const next = list
    .filter((x) => !added.has(x.id))
    .map((x) => {
      const e = edited.get(x.id);
      return e && same(strip(x), strip(e.after)) ? { ...e.before, ...keep(x) } : x;
    });
  const present = new Set(next.map((x) => x.id));
  return [...next, ...record.removed.filter((x) => !present.has(x.id))];
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Reverse a recorded set of changes against the *current* state. Anything the
// user has changed again since then is left alone.
export function undoChanges(changes, { transactions, plan, holdings = [], goals = [], memories = [] }) {
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

  return {
    transactions: nextTransactions,
    plan: nextPlan,
    holdings: undoCollection(holdings, changes.holdings, PRICE_KEYS),
    goals: undoCollection(goals, changes.goals),
    memories: undoCollection(memories, changes.memories)
  };
}

const PRICE_KEYS = ['price', 'priceDate', 'priceFetchedAt', 'fxRate'];

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
export function buildCard(type, metrics, plan, { holdings = [], goals = [], transactions = [], planning } = {}) {
  if (!CARD_TYPES.includes(type) || type === 'none') return null;
  // Suggestions are rendered live (they change as the user accepts or dismisses them)
  if (type === 'suggestions') return { type, month: metrics.month };
  if (type === 'goals') {
    const overview = goalsOverview(goals, {
      holdings,
      transactions,
      plan,
      settings: { calc: calcSettings(planning), defaultReturns: planning.defaultReturns }
    });
    return { type, month: metrics.month, data: overview };
  }
  if (type === 'portfolio') {
    const p = portfolioSummary(holdings, planning?.slabPct ?? 30);
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
