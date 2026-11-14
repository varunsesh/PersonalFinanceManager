import { CATEGORIES, currentMonth, today } from './constants';

const HISTORY_TURNS = 10;
const RATIO_KEYS = ['needs', 'wants', 'savings'];
const TX_TYPES = ['expense', 'income', 'savings'];
export const CARD_TYPES = ['none', 'summary', 'buckets', 'categories'];

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

function isValidDate(s) {
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
    date: isValidDate(t.date) ? t.date : today()
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

// Numbers the model needs to answer budget questions accurately.
export function buildBudgetSnapshot(plan, metrics, transactions) {
  return {
    plan,
    month: metrics.month,
    totals: {
      income: metrics.totalIncome,
      expenses: metrics.totalExpenses,
      savings: metrics.totalSavings,
      unallocated: metrics.netCashflow
    },
    buckets: metrics.bucketList.map((b) => ({
      bucket: b.key,
      targetPercent: b.ratio,
      target: b.target,
      actual: b.actual
    })),
    categories: CATEGORIES.filter((c) => c !== 'Salary & Income').map((c) => ({
      category: c,
      spent: metrics.byCategory[c] || 0,
      limit: plan.categoryLimits[c] ?? null
    })),
    // ids let the model refer to existing transactions when editing or deleting
    recentTransactions: transactions.slice(0, 25)
  };
}

// Convert prior chat messages to Gemini turns. Badges are appended so the model
// knows what the app actually saved, not just what it said it would save.
export function toGeminiHistory(messages) {
  const turns = [];
  messages
    .filter((m) => !m.isError)
    .slice(-HISTORY_TURNS)
    .forEach((m) => {
      const role = m.role === 'user' ? 'user' : 'model';
      let text = m.badges?.length ? `${m.text}\n[Applied: ${m.badges.join('; ')}]` : m.text;
      if (m.undone) text += '\n[Undone by user: none of the above changes are in effect]';
      const last = turns[turns.length - 1];
      if (last?.role === role) last.parts[0].text += `\n\n${text}`;
      else turns.push({ role, parts: [{ text }] });
    });
  while (turns.length > 0 && turns[0].role !== 'user') turns.shift();
  return turns;
}

export async function callGeminiBudgetParser({ userMessage, history, snapshot, currency, apiKey }) {
  if (!apiKey) {
    throw new Error('NO_API_KEY');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;

  const date = today();
  const systemInstruction = `You are FinChat, an intelligent personal finance and budgeting assistant embedded inside a local-first mobile budget tracker.
Today's date is ${date}. Active currency symbol is "${currency}".

Current budget snapshot. Totals, buckets and categories cover the current month (${currentMonth()}) only; recentTransactions may include earlier months:
${JSON.stringify(snapshot)}

Your job:
1. Parse the user's LATEST message to extract any NEW financial transactions (expenses, income, or savings transfers) AND/OR updates to their budget plan. Never re-log transactions from earlier turns.
2. Classify each transaction:
   - type: "expense" | "income" | "savings" (money moved into savings or investments is "savings", not "expense")
   - bucket: "needs" or "wants" for expenses; "income" for income; "savings" for savings
   - category: MUST be one of: ${CATEGORIES.join(', ')}
   - amount: a positive number in currency units, without symbols
   - date: YYYY-MM-DD (default to "${date}" unless the user specifies otherwise)
3. Transactions vs. plan updates:
   - Any statement that money was or is being spent, earned, received, saved, invested or transferred is a TRANSACTION, even when phrased as a habit ("I save 12k a month in PPF", "I put 50k a year into NPS", "my salary is 1.5L").
   - Change the plan ONLY when the user explicitly asks to set or change a target, limit, budget or split ("set dining limit to 8000", "make my income target 1.5L", "change the split to 50/25/25"). Never change a category limit just because the user logged money in that category.
   - For a recurring amount, log ONE transaction for the current month. Convert yearly amounts to a monthly amount (divide by 12 and round) and say so in the reply. Never log future months.
   - Log each separate amount in a message as its own transaction.
4. Corrections: when the user corrects or removes something already logged ("that was 450 not 480", "delete the uber one", "undo the coffee"), use "transactionEdits" or "deleteTransactionIds" with the id from recentTransactions. Never log a new transaction to fix an old one. If it's unclear which transaction they mean, ask instead of guessing.
5. For plan updates, include ONLY the fields the user asked to change. For the needs/wants/savings split, return only the ratios the user mentioned; the app rebalances the others to total 100.
6. If the user asks about their spending or budget health, answer using the numbers in the snapshot. Do not invent figures. Set "card" to show the numbers visually: "summary" for overall income/spending/savings, "buckets" for the needs/wants/savings split, "categories" for category spending vs. limits. Otherwise use "none".
7. Give a warm, concise "reply" that only describes what you actually put in "transactions", "transactionEdits", "deleteTransactionIds" and "planUpdate". The app shows budget-limit warnings itself, so don't repeat them.
Lines starting with "[Applied: ...]" or "[Undone by user: ...]" in earlier turns are added by the app to record what is actually saved. Never write them yourself.`;

  const responseSchema = {
    type: 'OBJECT',
    properties: {
      reply: {
        type: 'STRING',
        description: 'Conversational response confirming logged items, plan updates, or answering financial questions.'
      },
      transactions: {
        type: 'ARRAY',
        description: 'Zero or more new transactions extracted from the latest message.',
        items: {
          type: 'OBJECT',
          properties: {
            description: { type: 'STRING' },
            amount: { type: 'NUMBER' },
            type: { type: 'STRING', enum: TX_TYPES },
            bucket: { type: 'STRING', enum: ['needs', 'wants', 'savings', 'income'] },
            category: { type: 'STRING', enum: CATEGORIES },
            date: { type: 'STRING', description: 'YYYY-MM-DD' }
          },
          required: ['description', 'amount', 'type', 'bucket', 'category', 'date']
        }
      },
      transactionEdits: {
        type: 'ARRAY',
        description: 'Corrections to existing transactions. Include only the fields that change.',
        items: {
          type: 'OBJECT',
          properties: {
            id: { type: 'STRING', description: 'id from recentTransactions' },
            description: { type: 'STRING', nullable: true },
            amount: { type: 'NUMBER', nullable: true },
            type: { type: 'STRING', enum: TX_TYPES, nullable: true },
            bucket: { type: 'STRING', enum: ['needs', 'wants', 'savings', 'income'], nullable: true },
            category: { type: 'STRING', enum: CATEGORIES, nullable: true },
            date: { type: 'STRING', nullable: true, description: 'YYYY-MM-DD' }
          },
          required: ['id']
        }
      },
      deleteTransactionIds: {
        type: 'ARRAY',
        description: 'ids from recentTransactions to remove.',
        items: { type: 'STRING' }
      },
      card: {
        type: 'STRING',
        enum: CARD_TYPES,
        description: 'Visual card to show under the reply.'
      },
      planUpdate: {
        type: 'OBJECT',
        nullable: true,
        description: 'Only the plan fields the user asked to change; omit everything else.',
        properties: {
          monthlyIncomeTarget: { type: 'NUMBER', nullable: true },
          needsRatio: { type: 'NUMBER', nullable: true },
          wantsRatio: { type: 'NUMBER', nullable: true },
          savingsRatio: { type: 'NUMBER', nullable: true },
          categoryLimitUpdates: {
            type: 'ARRAY',
            nullable: true,
            items: {
              type: 'OBJECT',
              properties: {
                category: { type: 'STRING', enum: CATEGORIES },
                limit: { type: 'NUMBER' }
              },
              required: ['category', 'limit']
            }
          }
        }
      }
    },
    required: ['reply', 'transactions']
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [...history, { role: 'user', parts: [{ text: userMessage }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema
      }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('Empty response from Gemini');
  return JSON.parse(rawText);
}
