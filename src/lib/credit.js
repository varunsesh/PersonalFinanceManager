import { today } from './constants';
import { emiFor } from './finance/loans';

// Credit cards. Three kinds of entry touch a card:
//   - a swipe: an ordinary expense with `cardId`. It counts against the budget
//     on the day it was made and adds to the card's balance.
//   - a bill payment: a transaction of type 'card_payment' with `cardId`. It
//     moves money from the bank to the card, so it lowers the balance but is
//     never counted as spending (the swipes already were).
//   - an EMI plan (cardEmis): a purchase repaid in monthly instalments. Each
//     instalment (principal + interest) counts as that month's expense, and a
//     processing fee counts in the purchase month. Instalments aren't stored;
//     ledger() derives the ones due so far, so editing a plan updates them.
//
// card = { id, name, limit?, dueDay?, openingBalance?, createdAt }
// emi  = { id, cardId, description, category, bucket, principal, ratePct,
//          months, purchaseDate, startDate (first instalment), fee, createdAt }

export const isCardPayment = (t) => t.type === 'card_payment';

// Same day `k` months later, clamped to the end of shorter months.
export function addMonths(iso, k) {
  const [y, m, d] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + k;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const day = Math.min(d, new Date(ny, nm, 0).getDate());
  const pad = (n) => String(n).padStart(2, '0');
  return `${ny}-${pad(nm)}-${pad(day)}`;
}

// Every instalment of a plan: { n, date, amount, principal, interest, balance }.
// Amounts are whole rupees; the last instalment clears what rounding left.
export function emiSchedule(plan) {
  const r = plan.ratePct / 12 / 100;
  const emi = Math.round(emiFor(plan.principal, plan.ratePct, plan.months));
  let balance = plan.principal;
  const rows = [];
  for (let n = 1; n <= plan.months; n += 1) {
    const interest = Math.round(balance * r);
    const principal = n === plan.months ? balance : Math.min(balance, emi - interest);
    balance -= principal;
    rows.push({ n, date: addMonths(plan.startDate, n - 1), amount: principal + interest, principal, interest, balance });
  }
  return rows;
}

// Instalments (and the processing fee) due on or before `isoToday`, as
// read-only expense transactions marked with `emiId`.
export function emiTransactions(plan, isoToday = today()) {
  const base = { type: 'expense', bucket: plan.bucket, category: plan.category, cardId: plan.cardId, emiId: plan.id };
  const rows = emiSchedule(plan)
    .filter((i) => i.date <= isoToday)
    .map((i) => ({
      ...base,
      id: `${plan.id}-i${i.n}`,
      date: i.date,
      description: `${plan.description} EMI ${i.n}/${plan.months}`,
      amount: i.amount
    }));
  if (plan.fee > 0 && plan.purchaseDate <= isoToday) {
    rows.push({ ...base, id: `${plan.id}-fee`, date: plan.purchaseDate, description: `${plan.description} EMI processing fee`, amount: plan.fee });
  }
  return rows;
}

// Stored transactions plus EMI instalments due so far. This is what budgets,
// summaries and the transaction list read.
export function ledger(transactions, emis = [], isoToday = today()) {
  if (!emis.length) return transactions;
  return [...transactions, ...emis.flatMap((p) => emiTransactions(p, isoToday))];
}

export const ledgerOf = (state, isoToday) => ledger(state.transactions, state.cardEmis ?? [], isoToday);

function emiStatus(plan, isoToday) {
  const schedule = emiSchedule(plan);
  const due = schedule.filter((i) => i.date <= isoToday);
  const last = due[due.length - 1];
  const next = schedule[due.length];
  return {
    id: plan.id,
    cardId: plan.cardId,
    description: plan.description,
    category: plan.category,
    principal: plan.principal,
    ratePct: plan.ratePct,
    months: plan.months,
    emi: schedule[0]?.amount ?? 0,
    paidCount: due.length,
    principalLeft: last ? last.balance : plan.principal,
    totalInterest: schedule.reduce((s, i) => s + i.interest, 0),
    fee: plan.fee ?? 0,
    nextDate: next?.date ?? null,
    endDate: schedule[schedule.length - 1]?.date ?? plan.startDate,
    done: !next
  };
}

// The next date with the card's due day, on or after today.
function nextDueDate(dueDay, isoToday) {
  if (!dueDay) return null;
  // A due day of 31 lands on the last day of shorter months
  const inMonth = (k) => {
    const [y, m] = addMonths(`${isoToday.slice(0, 7)}-01`, k).split('-').map(Number);
    const day = Math.min(dueDay, new Date(y, m, 0).getDate());
    return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };
  return inMonth(0) >= isoToday ? inMonth(0) : inMonth(1);
}

// Balance, limit use, this month's activity and EMIs for each card.
//   balance: opening balance + swipes + EMI instalments/fees billed - payments
//   emiPrincipalLeft: principal of EMI instalments not billed yet (blocks limit)
export function cardOverview({ creditCards = [], transactions = [], cardEmis = [] }, isoToday = today()) {
  const month = isoToday.slice(0, 7);
  const rows = ledger(transactions, cardEmis, isoToday).filter((t) => t.cardId && t.date <= isoToday);
  const cards = creditCards.map((card) => {
    let spends = 0;
    let emiBilled = 0;
    let paid = 0;
    let spentThisMonth = 0;
    let paidThisMonth = 0;
    rows.forEach((t) => {
      if (t.cardId !== card.id) return;
      const inMonth = t.date.startsWith(month);
      if (isCardPayment(t)) {
        paid += t.amount;
        if (inMonth) paidThisMonth += t.amount;
      } else if (t.type === 'expense') {
        if (t.emiId) emiBilled += t.amount;
        else spends += t.amount;
        if (inMonth) spentThisMonth += t.amount;
      }
    });
    const emis = cardEmis.filter((p) => p.cardId === card.id).map((p) => emiStatus(p, isoToday));
    const active = emis.filter((e) => !e.done);
    const emiPrincipalLeft = active.reduce((s, e) => s + e.principalLeft, 0);
    const balance = Math.round((card.openingBalance ?? 0) + spends + emiBilled - paid);
    const totalOwed = Math.max(0, balance) + emiPrincipalLeft;
    return {
      id: card.id,
      name: card.name,
      limit: card.limit ?? null,
      dueDay: card.dueDay ?? null,
      nextDueDate: nextDueDate(card.dueDay, isoToday),
      balance,
      emiPrincipalLeft,
      totalOwed,
      available: card.limit ? card.limit - totalOwed : null,
      utilisationPct: card.limit ? Math.round((totalOwed / card.limit) * 100) : null,
      monthlyEmi: active.reduce((s, e) => s + e.emi, 0),
      thisMonth: { spent: Math.round(spentThisMonth), paid: Math.round(paidThisMonth) },
      emis: active,
      completedEmis: emis.length - active.length
    };
  });
  return {
    asOf: isoToday,
    cards,
    totalBalance: cards.reduce((s, c) => s + c.balance, 0),
    totalEmiPrincipalLeft: cards.reduce((s, c) => s + c.emiPrincipalLeft, 0),
    totalOwed: cards.reduce((s, c) => s + c.totalOwed, 0)
  };
}
