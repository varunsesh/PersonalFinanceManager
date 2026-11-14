import { CATEGORIES, today } from './constants';
import { computeMetrics } from './budget';
import { CARD_TYPES, TX_TYPES, applyPlanUpdate, isValidDate, normalizeTransaction } from './validation';
import { project, projectRange, requiredContribution } from './finance/calculators';
import { INSTRUMENTS, TAX_RULES } from './finance/taxRules';
import { usdToInr } from './prices/fx';

// Gemini function declarations. Query tools run locally over the full history,
// so only their results (never the whole ledger) are sent to the model. Action
// tools are validated here and collected; the app applies them after the turn.
const BUCKETS = ['needs', 'wants', 'savings', 'income'];
const CALC_MODES = ['lumpsum', 'monthly', 'yearly'];
const INSTRUMENT_HELP =
  'fd: fixed/recurring deposit. ppf. nps. ' +
  'equity_in: Indian stocks, Indian IPOs and Indian equity mutual funds (flexi/large/mid/small cap, ELSS, Indian index funds), including ones like Parag Parikh Flexi Cap that hold some foreign stocks but are mostly Indian equity. ' +
  'intl_fund: funds from Indian fund houses that invest mainly abroad (US/Nasdaq/S&P 500/global fund-of-funds). ' +
  'us_stock: US stocks, ETFs and IPOs held directly through a US broker. ' +
  'debt_mf: debt and liquid funds.';
const DATE = { type: 'STRING', description: 'YYYY-MM-DD' };

const TX_FIELDS = {
  description: { type: 'STRING' },
  amount: { type: 'NUMBER', description: 'Positive amount in currency units' },
  type: { type: 'STRING', enum: TX_TYPES },
  bucket: { type: 'STRING', enum: BUCKETS },
  category: { type: 'STRING', enum: CATEGORIES },
  date: DATE
};

export const TOOL_DECLARATIONS = [
  {
    name: 'get_spending_summary',
    description:
      'Totals of income, expenses and savings for a date range, optionally filtered and broken down. Use for any question about amounts over time, e.g. "dining last month", "spending this year by month".',
    parameters: {
      type: 'OBJECT',
      properties: {
        from: { ...DATE, description: 'Start date, inclusive (YYYY-MM-DD). Omit for all history.' },
        to: { ...DATE, description: 'End date, inclusive (YYYY-MM-DD). Omit for today.' },
        category: { type: 'STRING', enum: CATEGORIES },
        type: { type: 'STRING', enum: TX_TYPES },
        bucket: { type: 'STRING', enum: BUCKETS },
        groupBy: { type: 'STRING', enum: ['category', 'bucket', 'month', 'type'] }
      }
    }
  },
  {
    name: 'find_transactions',
    description:
      'Search transactions, newest first. Use to find ids before editing or deleting something not in recentTransactions, or to list specific entries.',
    parameters: {
      type: 'OBJECT',
      properties: {
        text: { type: 'STRING', description: 'Case-insensitive match on description' },
        from: DATE,
        to: DATE,
        category: { type: 'STRING', enum: CATEGORIES },
        type: { type: 'STRING', enum: TX_TYPES },
        minAmount: { type: 'NUMBER' },
        maxAmount: { type: 'NUMBER' },
        limit: { type: 'INTEGER', description: 'Max results, default 20, max 50' }
      }
    }
  },
  {
    name: 'get_budget_status',
    description: 'Plan, bucket targets vs. actuals and category spending vs. limits for one month.',
    parameters: {
      type: 'OBJECT',
      properties: { month: { type: 'STRING', description: 'YYYY-MM. Omit for the current month.' } }
    }
  },
  {
    name: 'log_transactions',
    description: 'Record new transactions the user tells you about.',
    parameters: {
      type: 'OBJECT',
      properties: {
        transactions: {
          type: 'ARRAY',
          items: { type: 'OBJECT', properties: TX_FIELDS, required: ['description', 'amount', 'type', 'bucket', 'category', 'date'] }
        }
      },
      required: ['transactions']
    }
  },
  {
    name: 'edit_transactions',
    description: 'Correct existing transactions by id. Include only fields that change.',
    parameters: {
      type: 'OBJECT',
      properties: {
        edits: {
          type: 'ARRAY',
          items: { type: 'OBJECT', properties: { id: { type: 'STRING' }, ...TX_FIELDS }, required: ['id'] }
        }
      },
      required: ['edits']
    }
  },
  {
    name: 'delete_transactions',
    description: 'Remove existing transactions by id.',
    parameters: {
      type: 'OBJECT',
      properties: { ids: { type: 'ARRAY', items: { type: 'STRING' } } },
      required: ['ids']
    }
  },
  {
    name: 'update_plan',
    description:
      'Change the budget plan. Only when the user explicitly asks to set a target, limit or split. Include only fields being changed; for the split, only the ratios the user mentioned (the app rebalances the rest).',
    parameters: {
      type: 'OBJECT',
      properties: {
        monthlyIncomeTarget: { type: 'NUMBER' },
        needsRatio: { type: 'NUMBER' },
        wantsRatio: { type: 'NUMBER' },
        savingsRatio: { type: 'NUMBER' },
        categoryLimitUpdates: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: { category: { type: 'STRING', enum: CATEGORIES }, limit: { type: 'NUMBER' } },
            required: ['category', 'limit']
          }
        }
      }
    }
  },
  {
    name: 'calculate_returns',
    description:
      'Project what an investment grows to, after Indian tax, with a tax breakdown. Use for any "what will X become" question. Never compute returns yourself. A card with the breakdown and sliders is shown automatically.',
    parameters: {
      type: 'OBJECT',
      properties: {
        instrument: { type: 'STRING', enum: Object.keys(INSTRUMENTS), description: INSTRUMENT_HELP },
        mode: { type: 'STRING', enum: CALC_MODES, description: 'lumpsum (one-time), monthly (SIP/RD) or yearly contributions' },
        amount: { type: 'NUMBER', description: 'Amount per contribution, in amountCurrency' },
        amountCurrency: { type: 'STRING', enum: ['INR', 'USD'], description: 'Currency of amount; USD is converted at today\'s rate. Default INR' },
        years: { type: 'NUMBER' },
        annualReturnPct: { type: 'NUMBER', description: "Omit to use the user's default for this instrument" },
        stepUpPct: { type: 'NUMBER', description: 'Yearly increase in monthly/yearly contributions' }
      },
      required: ['instrument', 'mode', 'amount', 'years']
    }
  },
  {
    name: 'required_investment',
    description:
      'How much to invest (lumpsum, monthly or yearly) to have a target amount in hand after tax. A card is shown automatically.',
    parameters: {
      type: 'OBJECT',
      properties: {
        instrument: { type: 'STRING', enum: Object.keys(INSTRUMENTS), description: INSTRUMENT_HELP },
        mode: { type: 'STRING', enum: CALC_MODES },
        targetAmount: { type: 'NUMBER', description: 'Rupees wanted in hand after tax' },
        years: { type: 'NUMBER' },
        annualReturnPct: { type: 'NUMBER', description: "Omit to use the user's default for this instrument" },
        stepUpPct: { type: 'NUMBER' },
        targetInTodaysMoney: { type: 'BOOLEAN', description: "True if the target is in today's money and should be grown by inflation" }
      },
      required: ['instrument', 'mode', 'targetAmount', 'years']
    }
  },
  {
    name: 'show_card',
    description:
      'Show a visual card under your reply for the current month: "summary" (income/spent/saved), "buckets" (needs/wants/savings vs. plan) or "categories" (category spending vs. limits).',
    parameters: {
      type: 'OBJECT',
      properties: { type: { type: 'STRING', enum: CARD_TYPES.filter((t) => t !== 'none') } },
      required: ['type']
    }
  }
];

const inRange = (tx, from, to) => (!from || tx.date >= from) && (!to || tx.date <= to);
const signed = (tx) => (tx.type === 'income' ? tx.amount : -tx.amount);
const MAX_FIND = 50;

function matches(tx, args) {
  return (
    inRange(tx, isValidDate(args.from) ? args.from : null, isValidDate(args.to) ? args.to : null) &&
    (!args.category || tx.category === args.category) &&
    (!args.type || tx.type === args.type) &&
    (!args.bucket || tx.bucket === args.bucket)
  );
}

function getSpendingSummary(args, { transactions }) {
  const rows = transactions.filter((tx) => matches(tx, args));
  const totals = { income: 0, expenses: 0, savings: 0 };
  const groups = {};
  rows.forEach((tx) => {
    const key = tx.type === 'income' ? 'income' : tx.type === 'savings' ? 'savings' : 'expenses';
    totals[key] += tx.amount;
    if (args.groupBy) {
      const g = args.groupBy === 'month' ? tx.date.slice(0, 7) : tx[args.groupBy];
      groups[g] ??= { amount: 0, count: 0 };
      groups[g].amount += tx.amount;
      groups[g].count += 1;
    }
  });
  return {
    from: isValidDate(args.from) ? args.from : rows.reduce((m, t) => (t.date < m ? t.date : m), today()),
    to: isValidDate(args.to) ? args.to : today(),
    transactionCount: rows.length,
    totals,
    ...(args.groupBy && {
      breakdown: Object.entries(groups)
        .map(([key, v]) => ({ [args.groupBy]: key, ...v }))
        .sort((a, b) => (args.groupBy === 'month' ? a.month.localeCompare(b.month) : b.amount - a.amount))
    })
  };
}

function findTransactions(args, { transactions }) {
  const text = typeof args.text === 'string' ? args.text.trim().toLowerCase() : '';
  const rows = transactions
    .filter(
      (tx) =>
        matches(tx, args) &&
        (!text || tx.description.toLowerCase().includes(text)) &&
        (args.minAmount == null || tx.amount >= args.minAmount) &&
        (args.maxAmount == null || tx.amount <= args.maxAmount)
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const limit = Math.min(MAX_FIND, Math.max(1, Number(args.limit) || 20));
  return {
    matchCount: rows.length,
    netTotal: rows.reduce((s, tx) => s + signed(tx), 0),
    transactions: rows.slice(0, limit),
    ...(rows.length > limit && { note: `Showing ${limit} of ${rows.length}. Narrow the search to see more.` })
  };
}

export function budgetStatus({ transactions, plan }, month) {
  const metrics = computeMetrics(transactions, plan, month);
  return {
    month: metrics.month,
    plan,
    totals: {
      income: metrics.totalIncome,
      expenses: metrics.totalExpenses,
      savings: metrics.totalSavings,
      unallocated: metrics.netCashflow
    },
    buckets: metrics.bucketList.map((b) => ({ bucket: b.key, targetPercent: b.ratio, target: b.target, actual: b.actual })),
    categories: CATEGORIES.filter((c) => c !== 'Salary & Income').map((c) => ({
      category: c,
      spent: metrics.byCategory[c] || 0,
      limit: plan.categoryLimits[c] ?? null
    }))
  };
}

function calcParams(args, settings) {
  if (!INSTRUMENTS[args.instrument]) return { error: `Unknown instrument ${args.instrument}` };
  if (!CALC_MODES.includes(args.mode)) return { error: `mode must be one of ${CALC_MODES.join(', ')}` };
  const years = Number(args.years);
  if (!(years >= 0.25 && years <= 60)) return { error: 'years must be between 0.25 and 60' };
  const ratePct = Number.isFinite(args.annualReturnPct) ? args.annualReturnPct : settings.defaultReturns[args.instrument];
  return {
    params: { instrument: args.instrument, mode: args.mode, years, ratePct, stepUpPct: Number(args.stepUpPct) || 0 }
  };
}

// What the model needs to describe a projection; the card shows the rest.
function summarize(result, range) {
  const { instrumentLabel, mode, amount, years, ratePct, invested, grossValue, tax, taxLines, inHand, postTaxReturnPct, todaysMoney, notes, nps } = result;
  return {
    instrument: instrumentLabel, mode, amount, years, assumedReturnPct: ratePct,
    invested, grossValue, tax, taxBreakdown: taxLines, inHand, postTaxReturnPct, inTodaysMoney: todaysMoney,
    ...(range && { atLowerAndHigherReturn: range }),
    ...(nps && { nps }),
    notes, taxRules: TAX_RULES.label
  };
}

// Converts a USD amount to rupees, returning a note for the model and card.
async function toInr(amount, currency) {
  if (currency !== 'USD') return { amount };
  const { rate, date } = await usdToInr();
  return { amount: Math.round(amount * rate), fx: { usd: amount, rate, date } };
}

// Runs one function call. `state` is the budget including changes staged
// earlier in this turn; `pending` accumulates the actions to apply afterwards.
// Returns (a promise of) the response object sent back to the model.
export async function executeTool(name, args = {}, state, pending, fmt, settings) {
  const ids = new Set(state.transactions.map((t) => t.id));
  switch (name) {
    case 'get_spending_summary':
      return getSpendingSummary(args, state);
    case 'find_transactions':
      return findTransactions(args, state);
    case 'get_budget_status':
      return budgetStatus(state, /^\d{4}-\d{2}$/.test(args.month ?? '') ? args.month : undefined);

    case 'log_transactions': {
      const items = Array.isArray(args.transactions) ? args.transactions : [];
      const valid = items.filter((t) => normalizeTransaction(t));
      pending.transactions.push(...items);
      return { logged: valid.length, rejected: items.length - valid.length };
    }
    case 'edit_transactions': {
      const edits = Array.isArray(args.edits) ? args.edits : [];
      const found = edits.filter((e) => ids.has(e?.id));
      pending.transactionEdits.push(...edits);
      return { edited: found.length, unknownIds: edits.filter((e) => !ids.has(e?.id)).map((e) => e?.id) };
    }
    case 'delete_transactions': {
      const list = Array.isArray(args.ids) ? args.ids : [];
      pending.deleteTransactionIds.push(...list);
      return { deleted: list.filter((id) => ids.has(id)).length, unknownIds: list.filter((id) => !ids.has(id)) };
    }
    case 'update_plan': {
      const { applied, skipped } = applyPlanUpdate(state.plan, args, fmt);
      const prev = pending.planUpdate ?? {};
      pending.planUpdate = {
        ...prev,
        ...args,
        categoryLimitUpdates: [...(prev.categoryLimitUpdates ?? []), ...(args.categoryLimitUpdates ?? [])]
      };
      return { applied, rejected: skipped };
    }
    case 'calculate_returns': {
      const { params, error } = calcParams(args, settings.planning);
      if (error) return { error };
      if (!(Number(args.amount) > 0)) return { error: 'amount must be positive' };
      const { amount, fx } = await toInr(Number(args.amount), args.amountCurrency);
      params.amount = amount;
      const result = project(params, settings.calc);
      const range = projectRange(params, settings.calc);
      pending.calcs.push({ kind: 'returns', params, settings: settings.calc, fx });
      return {
        ...(fx && { converted: `$${fx.usd} at ₹${fx.rate}/USD (${fx.date}) = ₹${amount}` }),
        ...summarize(result, range)
      };
    }
    case 'required_investment': {
      const { params, error } = calcParams(args, settings.planning);
      if (error) return { error };
      let target = Number(args.targetAmount);
      if (!(target > 0)) return { error: 'targetAmount must be positive' };
      if (args.targetInTodaysMoney) target = Math.round(target * (1 + settings.calc.inflationPct / 100) ** params.years);
      const amount = requiredContribution(params, target, settings.calc);
      if (amount == null) {
        return { error: `No ${params.mode} amount in ${INSTRUMENTS[params.instrument].label} reaches this target (e.g. PPF is capped at ₹1.5L a year)` };
      }
      params.amount = amount;
      pending.calcs.push({ kind: 'required', params, target, settings: settings.calc });
      return { requiredAmount: amount, perContribution: params.mode, targetInHand: target, ...summarize(project(params, settings.calc)) };
    }
    case 'show_card':
      if (!CARD_TYPES.includes(args.type) || args.type === 'none') return { error: `Unknown card type ${args.type}` };
      pending.card = args.type;
      return { shown: args.type };
    default:
      return { error: `Unknown tool ${name}` };
  }
}
