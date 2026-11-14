import { today } from './constants';
import { requiredContribution } from './finance/calculators';
import { currentValue } from './portfolio';

// Goals: a target amount by a date, funded by linked holdings (whole or a
// share of each), savings transactions tagged with the goal since it was
// created, and any balance kept elsewhere (e.g. a savings account).
//
// goal = { id, name, kind: 'target' | 'emergency', targetAmount, targetDate,
//          targetInTodaysMoney, instrument, ratePct?, priority: 1-3,
//          links: [{ holdingId, sharePct }], otherBalance, emergencyMonths?, createdAt }

const PACE_MONTHS = 3;

export function monthsUntil(isoDate, from = today()) {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = isoDate.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm) + (td - fd) / 30;
}

export function addYears(years, from = today()) {
  const d = new Date(`${from}T00:00:00`);
  d.setMonth(d.getMonth() + Math.round(years * 12));
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Average monthly expenses over the last few full months (falls back to the
// current month, then to the plan's needs+wants target).
export function averageMonthlyExpenses(transactions, plan, months = PACE_MONTHS) {
  const now = today().slice(0, 7);
  const byMonth = {};
  transactions.forEach((t) => {
    if (t.type !== 'expense') return;
    const m = t.date.slice(0, 7);
    byMonth[m] = (byMonth[m] ?? 0) + t.amount;
  });
  const past = Object.keys(byMonth).filter((m) => m < now).sort().slice(-months);
  if (past.length > 0) return past.reduce((s, m) => s + byMonth[m], 0) / past.length;
  if (byMonth[now]) return byMonth[now];
  return (plan.monthlyIncomeTarget * (plan.ratios.needs + plan.ratios.wants)) / 100;
}

// Savings transactions tagged with this goal, averaged per month over the last
// PACE_MONTHS months (or since the goal was created, if more recent).
function monthlyPace(goal, transactions) {
  const start = new Date();
  start.setMonth(start.getMonth() - PACE_MONTHS);
  const since = start.toISOString().slice(0, 10);
  const total = transactions
    .filter((t) => t.goalId === goal.id && t.type === 'savings' && t.date >= since)
    .reduce((s, t) => s + t.amount, 0);
  const created = goal.createdAt?.slice(0, 10) ?? since;
  const months = Math.min(PACE_MONTHS, Math.max(1, monthsUntil(today(), created > since ? created : since)));
  return total / months;
}

export function goalBalance(goal, holdings, transactions = []) {
  const byId = new Map(holdings.map((h) => [h.id, h]));
  const linked = (goal.links ?? []).reduce((s, l) => {
    const h = byId.get(l.holdingId);
    const v = h ? currentValue(h) : null;
    return s + (v ?? 0) * (l.sharePct / 100);
  }, 0);
  const since = goal.createdAt?.slice(0, 10) ?? '0000';
  const tagged = transactions
    .filter((t) => t.goalId === goal.id && t.type === 'savings' && t.date >= since)
    .reduce((s, t) => s + t.amount, 0);
  return linked + tagged + (goal.otherBalance ?? 0);
}

// How much of each holding is already promised to goals (to keep shares ≤ 100%).
export function allocatedShare(goals, holdingId, exceptGoalId) {
  return goals
    .filter((g) => g.id !== exceptGoalId)
    .reduce((s, g) => s + (g.links ?? []).filter((l) => l.holdingId === holdingId).reduce((a, l) => a + l.sharePct, 0), 0);
}

export function goalStatus(goal, { holdings, transactions, plan, settings }) {
  const { calc, defaultReturns } = settings;
  const monthsLeft = goal.targetDate ? Math.max(0, monthsUntil(goal.targetDate)) : null;
  const yearsLeft = monthsLeft != null ? monthsLeft / 12 : null;

  let target = goal.targetAmount ?? 0;
  if (goal.kind === 'emergency') {
    target = Math.round(averageMonthlyExpenses(transactions, plan) * (goal.emergencyMonths ?? 6));
  } else if (goal.targetInTodaysMoney && yearsLeft) {
    target = Math.round(target * (1 + calc.inflationPct / 100) ** yearsLeft);
  }

  const balance = goalBalance(goal, holdings, transactions);
  const ratePct = goal.ratePct ?? defaultReturns[goal.instrument] ?? 7;
  // Existing balance keeps growing until the target date (pre-tax approximation)
  const projectedBalance = yearsLeft ? balance * (1 + ratePct / 100) ** yearsLeft : balance;
  const gap = Math.max(0, target - projectedBalance);

  let requiredMonthly = null;
  if (balance >= target) requiredMonthly = 0;
  else if (yearsLeft != null && yearsLeft >= 0.25) {
    requiredMonthly =
      gap === 0
        ? 0
        : requiredContribution({ instrument: goal.instrument, mode: 'monthly', years: yearsLeft, ratePct }, gap, calc);
  } else if (yearsLeft != null) {
    requiredMonthly = Math.round(target - balance); // due now
  }

  const pace = Math.round(monthlyPace(goal, transactions));
  let status;
  if (balance >= target && target > 0) status = 'done';
  else if (requiredMonthly == null) status = 'building';
  else if (requiredMonthly === 0 || pace >= requiredMonthly * 0.95) status = 'on_track';
  else status = 'behind';

  return {
    id: goal.id,
    name: goal.name,
    kind: goal.kind,
    emergencyMonths: goal.kind === 'emergency' ? goal.emergencyMonths ?? 6 : null,
    priority: goal.priority ?? 2,
    instrument: goal.instrument,
    assumedReturnPct: ratePct,
    targetDate: goal.targetDate ?? null,
    monthsLeft: monthsLeft != null ? Math.round(monthsLeft) : null,
    target,
    todaysMoneyTarget: goal.kind !== 'emergency' && goal.targetInTodaysMoney ? goal.targetAmount : null,
    balance: Math.round(balance),
    progressPct: target > 0 ? Math.min(100, Math.round((balance / target) * 1000) / 10) : 0,
    requiredMonthly,
    monthlyPace: pace,
    shortfallMonthly: requiredMonthly != null ? Math.max(0, requiredMonthly - pace) : null,
    status,
    links: goal.links ?? [],
    otherBalance: goal.otherBalance ?? 0
  };
}

export function goalsOverview(goals, ctx) {
  const statuses = goals
    .map((g) => goalStatus(g, ctx))
    .sort((a, b) => a.priority - b.priority || (a.monthsLeft ?? 1e9) - (b.monthsLeft ?? 1e9));
  // Average monthly surplus (income − expenses − savings) over recent full months
  const now = today().slice(0, 7);
  const net = {};
  ctx.transactions.forEach((t) => {
    const m = t.date.slice(0, 7);
    if (m >= now) return;
    net[m] = (net[m] ?? 0) + (t.type === 'income' ? t.amount : t.type === 'expense' ? -t.amount : 0);
  });
  const months = Object.keys(net).sort().slice(-PACE_MONTHS);
  return {
    goals: statuses,
    totalRequiredMonthly: statuses.reduce((s, g) => s + (g.requiredMonthly ?? 0), 0),
    totalPaceMonthly: statuses.reduce((s, g) => s + g.monthlyPace, 0),
    averageMonthlySurplusBeforeSavings: months.length ? Math.round(months.reduce((s, m) => s + net[m], 0) / months.length) : null
  };
}
