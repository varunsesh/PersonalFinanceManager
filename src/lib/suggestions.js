import { today } from './constants';
import { INSTRUMENTS, TAX_RULES } from './finance/taxRules';
import { addYears, allocatedShare, goalsOverview, monthsUntil } from './goals';
import { currentValue } from './portfolio';

// Suggestions the app proposes and the user decides on (Accept / Adjust /
// Dismiss). Each is derived from current data, so it disappears on its own
// once it no longer applies. Accepting turns `proposal` into a result for
// applyAssistantResult, so it is recorded and can be undone like a chat reply.
//
// suggestion = { id, kind, title, reason, proposal, acceptLabel?, chatPrompt? }
//   acceptLabel: present when Accept changes data
//   chatPrompt:  present for advice best discussed in chat

const MIN_SPLIT = 1000;
const MARKET_LINKED = new Set(['equity_in', 'intl_fund', 'us_stock']);
const round100 = (n) => Math.round(n / 100) * 100;
const fmt = (n) => `₹${Math.round(n).toLocaleString('en-IN')}`;

// Financial year that `iso` falls in, as its ending year (Apr–Mar).
const fyEnd = (iso) => {
  const [y, m] = iso.split('-').map(Number);
  return m >= 4 ? y + 1 : y;
};

function emergencyFund({ goals }) {
  if (goals.some((g) => g.kind === 'emergency')) return null;
  return {
    id: 'emergency-fund',
    kind: 'emergency_fund',
    title: 'Set up an emergency fund',
    reason:
      "You don't have an emergency fund goal. Six months of expenses kept in an FD or liquid fund covers job loss or medical surprises without selling investments at a bad time.",
    proposal: { months: 6 },
    acceptLabel: 'Create goal'
  };
}

// Split what's left of this month's savings target across goals, highest
// priority and furthest behind first.
function surplusSplit({ transactions, plan, overview }) {
  const month = today().slice(0, 7);
  let income = 0;
  let expenses = 0;
  let saved = 0;
  transactions.forEach((t) => {
    if (!t.date.startsWith(month)) return;
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expenses += t.amount;
    else if (t.type === 'savings') saved += t.amount;
  });
  const base = income > 0 ? income : plan.monthlyIncomeTarget;
  const target = (base * plan.ratios.savings) / 100;
  const leftSoFar = base - expenses - saved;
  const available = round100(Math.min(Math.max(0, target - saved), Math.max(0, leftSoFar)));
  const open = overview.goals.filter((g) => g.status !== 'done');
  if (available < MIN_SPLIT || open.length === 0) return null;

  let left = available;
  const rows = [];
  for (const g of open) {
    if (left < MIN_SPLIT) break;
    const need =
      g.shortfallMonthly != null
        ? g.shortfallMonthly
        : g.kind === 'emergency'
          ? Math.max(0, (g.target - g.balance) / 6)
          : Math.max(0, (g.target - g.balance) / Math.max(1, g.monthsLeft || 12));
    const amount = round100(Math.min(need, left));
    if (amount >= MIN_SPLIT) {
      rows.push({ goalId: g.id, name: g.name, amount });
      left -= amount;
    }
  }
  if (rows.length === 0) return null;
  return {
    id: `surplus:${month}`,
    kind: 'surplus_split',
    title: `Put ${fmt(available - left)} towards your goals this month`,
    reason:
      `Your savings target this month is ${fmt(target)} (${plan.ratios.savings}% of ${income > 0 ? 'income' : 'your income target'}) and you've saved ${fmt(saved)} so far. ` +
      'This split covers the goals that are behind first, by priority.' +
      (left >= MIN_SPLIT ? ` ${fmt(left)} is left unassigned as a buffer.` : ''),
    proposal: { rows },
    acceptLabel: 'Log as saved'
  };
}

function fdMaturity({ holdings, overview }) {
  const soon = today();
  return holdings
    .filter((h) => h.instrument === 'fd' && h.maturityDate && monthsUntil(h.maturityDate, soon) <= 1.5)
    .map((h) => {
      const value = currentValue(h);
      const matured = h.maturityDate <= soon;
      const behind = overview.goals.find((g) => g.status === 'behind');
      return {
        id: `fd:${h.id}:${h.maturityDate}`,
        kind: 'fd_maturity',
        title: `${h.name} ${matured ? 'has matured' : `matures on ${h.maturityDate}`}`,
        reason:
          `It's worth about ${fmt(value)}. You can renew it, or put the money towards a goal` +
          (behind ? ` such as ${behind.name}, which is behind.` : '.') +
          ' Accepting removes the FD from your investments and, if you pick a goal, adds the amount to that goal.',
        proposal: { goalId: behind?.id ?? null, holdingId: h.id, value: Math.round(value ?? h.invested) },
        acceptLabel: 'Mark as matured'
      };
    });
}

// Use the yearly ₹1.25L tax-free allowance on long-term Indian equity gains by
// selling and buying back. Only whole holdings that fit are proposed; larger
// gains get advice without an automatic change.
function taxHarvest({ holdings }) {
  const date = today();
  const rule = TAX_RULES.equityIndia;
  const eligible = holdings
    .filter((h) => h.instrument === 'equity_in' && h.startDate && h.invested && monthsUntil(date, h.startDate) > rule.longTermAfterMonths)
    .map((h) => ({ h, gain: (currentValue(h) ?? 0) - h.invested }))
    .filter((x) => x.gain > 0)
    .sort((a, b) => a.gain - b.gain);
  if (eligible.length === 0) return null;

  let room = rule.ltcgExemption;
  const picked = [];
  for (const x of eligible) {
    if (x.gain <= room) {
      picked.push(x);
      room -= x.gain;
    }
  }
  const fy = fyEnd(date);
  const deadline = `31 March ${fy}`;
  if (picked.length === 0) {
    const big = eligible[0];
    return {
      id: `harvest:${fy}:partial`,
      kind: 'tax_harvest',
      title: `Book up to ₹1.25L of gains tax-free before ${deadline}`,
      reason: `${big.h.name} has ${fmt(big.gain)} of long-term gains. Selling part of it (enough to realise about ₹1.25L of gains) and buying back the same day resets its cost, so that much of the gain is never taxed. This assumes you haven't booked other equity gains this year.`,
      proposal: {},
      chatPrompt: `How many units of ${big.h.name} should I sell and rebuy to harvest ₹1.25L of long-term gains this year?`
    };
  }
  const total = picked.reduce((s, x) => s + x.gain, 0);
  const saved = (total * rule.ltcgPct * (1 + TAX_RULES.cessPct / 100)) / 100;
  return {
    id: `harvest:${fy}`,
    kind: 'tax_harvest',
    title: `Book ${fmt(total)} of gains tax-free before ${deadline}`,
    reason:
      `Sell and buy back ${picked.map((x) => x.h.name).join(', ')} to use your yearly ₹1.25L long-term gains allowance. ` +
      `It saves about ${fmt(saved)} of future tax. Do it in your broker app, then tap "I've done it" to reset the cost in FinChat. ` +
      "This assumes you haven't booked other equity gains this financial year.",
    proposal: { holdingIds: picked.map((x) => x.h.id) },
    acceptLabel: "I've done it"
  };
}

// Goals due within 3 years that are mostly in market-linked investments.
function goalRisk({ goals, holdings, overview }) {
  const byId = new Map(holdings.map((h) => [h.id, h]));
  const quarter = `${today().slice(0, 4)}Q${Math.ceil(Number(today().slice(5, 7)) / 3)}`;
  return overview.goals
    .filter((g) => g.status !== 'done' && g.monthsLeft != null && g.monthsLeft <= 36 && g.balance > 0)
    .map((g) => {
      const goal = goals.find((x) => x.id === g.id);
      const risky = (goal.links ?? []).reduce((s, l) => {
        const h = byId.get(l.holdingId);
        return h && MARKET_LINKED.has(h.instrument) ? s + (currentValue(h) ?? 0) * (l.sharePct / 100) : s;
      }, 0);
      return { g, share: risky / g.balance };
    })
    .filter((x) => x.share > 0.5)
    .map(({ g, share }) => ({
      id: `risk:${g.id}:${quarter}`,
      kind: 'goal_risk',
      title: `${g.name} is ${Math.round(share * 100)}% in stocks/equity funds`,
      reason: `It's due in ${g.monthsLeft} months. A market fall now could leave it short with little time to recover; many people move money for near-term goals gradually into FDs or debt funds over the last 2–3 years.`,
      proposal: {},
      chatPrompt: `My ${g.name} goal is ${g.monthsLeft} months away and mostly in equity. How should I gradually move it to safer investments?`
    }));
}

export function buildSuggestions(ctx) {
  const safeCtx = { ...ctx, goals: ctx.goals ?? [], holdings: ctx.holdings ?? [], transactions: ctx.transactions ?? [] };
  const { goals, suggestionState = {} } = safeCtx;
  const overview = goalsOverview(goals, safeCtx);
  const all = [
    emergencyFund(safeCtx),
    surplusSplit({ ...safeCtx, overview }),
    ...fdMaturity({ ...safeCtx, overview }),
    taxHarvest(safeCtx),
    ...goalRisk({ ...safeCtx, overview })
  ].filter(Boolean);
  const dismissed = suggestionState?.dismissed ?? {};
  const accepted = suggestionState?.accepted ?? {};
  // Emergency fund and FD maturity already disappear while the goal exists or
  // after the FD is removed; don't block them forever if the goal is later deleted.
  return all.filter((s) => !dismissed[s.id] && !(accepted[s.id] && s.kind !== 'emergency_fund' && s.kind !== 'fd_maturity'));
}

// Turn an accepted suggestion (with the user's adjustments) into a result for
// applyAssistantResult. Returns null for suggestions that don't change data.
export function suggestionToResult(s, proposal = {}, { holdings = [], goals = [] }, idBase = Date.now()) {
  const base = { idBase, transactions: [], planUpdate: null, goalsAdded: [], goalEdits: [], holdingEdits: [], holdingRemoveIds: [] };
  const date = today();
  switch (s.kind) {
    case 'emergency_fund':
      return {
        ...base,
        goalsAdded: [
          {
            id: `goal-${idBase}-0`,
            kind: 'emergency',
            name: proposal.name || 'Emergency fund',
            priority: 1,
            emergencyMonths: Math.max(1, Number(proposal.months) || 6),
            instrument: 'fd',
            targetInTodaysMoney: false,
            otherBalance: 0,
            links: [],
            createdAt: new Date().toISOString()
          }
        ]
      };
    case 'create_goal': {
      const targetAmount = Number(proposal.targetAmount);
      const years = Number(proposal.years);
      if (!(targetAmount > 0) || !(years > 0)) return null;
      const instrument = INSTRUMENTS[proposal.instrument]
        ? proposal.instrument
        : years < 3
          ? 'fd'
          : years < 5
            ? 'debt_mf'
            : 'equity_in';
      return {
        ...base,
        goalsAdded: [
          {
            id: `goal-${idBase}-0`,
            kind: 'target',
            name: String(proposal.name || 'Goal').trim(),
            targetAmount,
            targetDate: addYears(years, date),
            targetInTodaysMoney: Boolean(proposal.targetInTodaysMoney),
            instrument,
            ...(Number.isFinite(Number(proposal.ratePct)) && Number(proposal.ratePct) > 0 ? { ratePct: Number(proposal.ratePct) } : {}),
            priority: [1, 2, 3].includes(Number(proposal.priority)) ? Number(proposal.priority) : 2,
            otherBalance: 0,
            links: [],
            createdAt: new Date().toISOString()
          }
        ]
      };
    }
    case 'surplus_split':
      return {
        ...base,
        transactions: (proposal.rows ?? [])
          .filter((r) => Number(r.amount) > 0)
          .map((r) => ({
            description: `Saved for ${r.name}`,
            amount: Number(r.amount),
            type: 'savings',
            bucket: 'savings',
            category: 'Savings & Investments',
            date,
            goalId: r.goalId
          }))
      };
    case 'log_savings': {
      const amount = Number(proposal.amount);
      if (!(amount > 0)) return null;
      const goal = proposal.goalId ? goals.find((g) => g.id === proposal.goalId) : null;
      return {
        ...base,
        transactions: [
          {
            description: String(proposal.description || (goal ? `Saved for ${goal.name}` : 'Savings & Investment')).trim(),
            amount,
            type: 'savings',
            bucket: 'savings',
            category: 'Savings & Investments',
            date,
            ...(goal ? { goalId: goal.id } : {})
          }
        ]
      };
    }
    case 'plan_update': {
      const planUpdate = {};
      if (proposal.monthlyIncomeTarget != null && Number(proposal.monthlyIncomeTarget) > 0) {
        planUpdate.monthlyIncomeTarget = Number(proposal.monthlyIncomeTarget);
      }
      ['needsRatio', 'wantsRatio', 'savingsRatio'].forEach((k) => {
        if (proposal[k] != null && proposal[k] !== '' && Number.isFinite(Number(proposal[k]))) {
          planUpdate[k] = Number(proposal[k]);
        }
      });
      if (proposal.category && proposal.limit != null && proposal.limit !== '' && Number(proposal.limit) >= 0) {
        planUpdate.categoryLimitUpdates = [{ category: proposal.category, limit: Number(proposal.limit) }];
      }
      if (Object.keys(planUpdate).length === 0) return null;
      return { ...base, planUpdate };
    }
    case 'link_holding': {
      const goal = goals.find((g) => g.id === proposal.goalId);
      const holding = holdings.find((h) => h.id === proposal.holdingId);
      const sharePct = Number(proposal.sharePct ?? 100);
      if (!goal || !holding || !(sharePct > 0 && sharePct <= 100)) return null;
      const used = allocatedShare(goals, holding.id, goal.id);
      if (used + sharePct > 100) return null;
      const links = (goal.links ?? []).filter((l) => l.holdingId !== holding.id);
      links.push({ holdingId: holding.id, sharePct });
      return { ...base, goalEdits: [{ before: goal, after: { ...goal, links } }] };
    }
    case 'fd_maturity': {
      const value = Math.max(0, Number(proposal.value) || 0);
      const goalEdits = goals
        .filter((g) => g.id === proposal.goalId || (g.links ?? []).some((l) => l.holdingId === proposal.holdingId))
        .map((g) => ({
          before: g,
          after: {
            ...g,
            links: (g.links ?? []).filter((l) => l.holdingId !== proposal.holdingId),
            ...(g.id === proposal.goalId ? { otherBalance: (g.otherBalance ?? 0) + value } : {})
          }
        }));
      return {
        ...base,
        holdingRemoveIds: [proposal.holdingId],
        goalEdits
      };
    }
    case 'tax_harvest': {
      if (!proposal.holdingIds) return null;
      // Selling and buying back resets cost to today's value and restarts the holding period
      const edits = holdings
        .filter((h) => proposal.holdingIds.includes(h.id))
        .map((h) => ({ before: h, after: { ...h, invested: Math.round(currentValue(h) ?? h.invested), startDate: date } }));
      return { ...base, holdingEdits: edits };
    }
    default:
      return null;
  }
}
