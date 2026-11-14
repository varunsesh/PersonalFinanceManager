import { CATEGORIES, currentMonth, today } from './constants';
import { applyAssistantResult } from './assistantActions';
import { TOOL_DECLARATIONS, budgetStatus, executeTool } from './tools';

const HISTORY_TURNS = 10;
const MAX_TOOL_ROUNDS = 6;
const MODEL = 'gemini-2.5-flash';

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

function systemInstruction(state, currency) {
  const date = today();
  const earliest = state.transactions.reduce((m, t) => (t.date < m ? t.date : m), date);
  return `You are FinChat, a warm, concise personal finance assistant inside a local-first mobile budget tracker. You act only through the tools provided.
Today's date is ${date}. Currency symbol: "${currency}".
The user has ${state.transactions.length} transactions from ${earliest} to today.

This month's budget status (${currentMonth()}):
${JSON.stringify(budgetStatus(state))}

Investments: ${state.holdings?.length ? `${state.holdings.length} holdings: ${state.holdings.map((h) => `${h.id} ${h.name}`).join('; ')}. Call get_portfolio for values.` : 'none recorded yet.'}

What you know about the user (saved with the remember tool; use it when advising):
${state.memories?.length ? state.memories.map((m) => `- ${m.id} [${m.topic}] ${m.text}`).join('\n') : '- nothing yet'}

Goals: ${state.goals?.length ? state.goals.map((g) => `${g.id} ${g.name}`).join('; ') + '. Call get_goals for progress.' : 'none yet.'}

Most recent transactions (with ids):
${JSON.stringify(state.transactions.slice(0, 10))}

Rules:
1. Logging: any statement that money was or is being spent, earned, received, saved, invested or transferred is a transaction, even when phrased as a habit ("I save 12k a month in PPF", "my salary is 1.5L"). Call log_transactions. Never re-log transactions from earlier turns.
   - type: "expense" | "income" | "savings" (money moved into savings or investments is "savings")
   - bucket: "needs" or "wants" for expenses; "income" for income; "savings" for savings
   - category: one of ${CATEGORIES.join(', ')}
   - date: YYYY-MM-DD, default ${date}
   - For a recurring amount, log ONE transaction for the current month; convert yearly amounts to monthly (divide by 12, round) and say so. Never log future months.
2. Plan changes: call update_plan ONLY when the user explicitly asks to set or change a target, limit or split. Never change a limit just because money was logged in that category.
3. Corrections: for "that was 450 not 480", "delete the uber one" and similar, call edit_transactions or delete_transactions with the id. If the transaction isn't in the recent list, call find_transactions first. If it's still ambiguous, ask instead of guessing.
4. Questions: for anything beyond this month's status above (other months, date ranges, trends, specific merchants), call get_spending_summary, find_transactions or get_budget_status. Never estimate or invent numbers.
5. Call show_card when a visual helps: "summary", "buckets" or "categories" (current month only).
6. Investments: for any projection, maturity value, "how much will X become" or "how much should I invest" question, call calculate_returns or required_investment. Never do the maths yourself. Use the user's stated return if given; otherwise omit it to use their saved default. Pick the instrument carefully (Indian stocks and IPOs are equity_in; US stocks, ETFs and IPOs held directly are us_stock; US/international funds bought through an Indian fund house are intl_fund). In the reply, give the after-tax amount in hand and the main tax line, mention that market returns are assumptions, and leave the full breakdown to the card. These are projections and suggestions; the user decides.
7. Holdings (investments the user owns, not new spending): when the user says they hold or bought an investment, call add_holding; for changes call update_holding or remove_holding. For an Indian mutual fund call search_mutual_funds first and choose the Direct Growth plan unless the user says Regular/IDCW; if several schemes still fit, ask. For US stocks/ETFs use the ticker (search_us_stocks if unsure) and the number of shares. Never invent units, values or rates; ask for what's missing. Questions about net worth, holdings or gains: call get_portfolio (and show_card "portfolio"). Buying an investment with this month's money is ALSO a savings transaction; only log it if the user describes it as new money moved this month.
8. Goals: when the user states something they're saving for, call create_goal (ask for the amount and timeframe if missing; ask whether the amount is in today's money for goals more than a few years away). Offer to link relevant holdings with link_holding_to_goal, and tag savings with goalId when the user says what it's for (tagged savings add to the goal's balance, so don't tag money that went into a holding already linked to that goal; update the holding instead). For "am I on track?", call get_goals and show_card "goals". When suggesting how to split money between goals or which instrument to use, present it as a suggestion with the reasoning and let the user decide; never change goals or links without the user asking.
9. Memory: you only see the last few chat messages, so call remember whenever the user shares something lasting about themselves (age, dependants, job, employer benefits, risk appetite, preferences, plans). Use update_memory when a fact changes and forget when asked. Don't announce routine saves at length; a short mention is enough. Never store passwords, PINs, PAN, Aadhaar or account numbers.
10. Write plain text only, no Markdown (no **, # or tables); short "- " bullet lines are fine. Write rupees in Indian style (₹21,71,499 or ₹21.7L). Your final text reply must only describe what the tool results confirm. The app shows badges, budget-limit warnings and an Undo button itself, so don't repeat those.
Lines starting with "[Applied: ...]" or "[Undone by user: ...]" in earlier turns are added by the app to record what is actually saved. Never write them yourself.`;
}

async function generate(apiKey, body) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API error (${res.status}): ${errText}`);
  }
  const data = await res.json();
  const candidate = data?.candidates?.[0];
  if (!candidate?.content?.parts) {
    const reason = candidate?.finishReason || data?.promptFeedback?.blockReason || 'no content';
    throw new Error(`Empty response from Gemini (${reason})`);
  }
  return candidate.content;
}

// Runs one user turn as a function-calling loop. Query tools are answered
// locally against the budget plus anything staged earlier in the turn; action
// tools are validated and collected into `pending`, which the caller applies
// (and can later undo) in one step.
// Returns { reply, idBase, transactions, transactionEdits, deleteTransactionIds, planUpdate, card, toolCalls }.
export async function runAssistant({ userMessage, history, state, currency, apiKey, fmt, settings }) {
  if (!apiKey) {
    throw new Error('NO_API_KEY');
  }

  const pending = { idBase: Date.now(), transactions: [], transactionEdits: [], deleteTransactionIds: [], planUpdate: null, card: null, calcs: [],
    holdingsAdded: [], holdingEdits: [], holdingRemoveIds: [],
    goalsAdded: [], goalEdits: [], goalRemoveIds: [],
    memoriesAdded: [], memoryEdits: [], memoryRemoveIds: [] };
  const toolCalls = [];
  const contents = [...history, { role: 'user', parts: [{ text: userMessage }] }];
  const request = {
    systemInstruction: { parts: [{ text: systemInstruction(state, currency) }] },
    tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
    toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
    generationConfig: { temperature: 0.2 }
  };

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const content = await generate(apiKey, { ...request, contents });
    const calls = content.parts.filter((p) => p.functionCall).map((p) => p.functionCall);
    if (calls.length === 0) {
      // The model sometimes copies the app's history markers; they belong to
      // the app, so strip them from what it says.
      const reply = content.parts
        .filter((p) => p.text && !p.thought)
        .map((p) => p.text)
        .join('')
        .replace(/\s*\[(Applied|Undone by user):[^\]]*\]/g, '')
        .trim();
      return { ...pending, reply, toolCalls };
    }

    // Echo the model's turn unchanged (it may carry thought signatures), then
    // answer every call in the same order.
    contents.push(content);
    const staged = applyAssistantResult(pending, state, fmt);
    const responses = [];
    for (const call of calls) {
      let response;
      try {
        response = await executeTool(call.name, call.args ?? {}, staged, pending, fmt, settings);
      } catch (err) {
        response = { error: err.message };
      }
      toolCalls.push(call.name);
      responses.push({ functionResponse: { name: call.name, response } });
    }
    contents.push({ role: 'user', parts: responses });
  }

  return { ...pending, reply: 'Sorry, that took too many steps. Could you rephrase or split it up?', toolCalls };
}
