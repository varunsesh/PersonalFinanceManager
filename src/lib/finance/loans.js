// Reducing-balance loan maths (home, car, personal loans). Interest is charged
// monthly on the outstanding balance; EMIs are paid at the end of each month.

const monthlyRate = (ratePct) => ratePct / 12 / 100;

export function emiFor(principal, ratePct, months) {
  const r = monthlyRate(ratePct);
  if (r === 0) return principal / months;
  const f = (1 + r) ** months;
  return (principal * r * f) / (f - 1);
}

export function principalFor(emi, ratePct, months) {
  const r = monthlyRate(ratePct);
  if (r === 0) return emi * months;
  return (emi * (1 - (1 + r) ** -months)) / r;
}

// Months needed to repay; null if the EMI doesn't even cover the interest.
export function monthsFor(principal, ratePct, emi) {
  const r = monthlyRate(ratePct);
  if (r === 0) return Math.ceil(principal / emi);
  if (emi <= principal * r) return null;
  return Math.ceil(-Math.log(1 - (principal * r) / emi) / Math.log(1 + r) - 1e-9);
}

// Annual rate implied by an EMI; null if the EMI repays less than the loan.
export function rateFor(principal, months, emi) {
  if (emi * months < principal) return null;
  let lo = 0;
  let hi = 100;
  for (let i = 0; i < 100; i += 1) {
    const mid = (lo + hi) / 2;
    if (emiFor(principal, mid, months) > emi) hi = mid;
    else lo = mid;
  }
  return Math.round(((lo + hi) / 2) * 100) / 100;
}

// Fills in whichever of principal / ratePct / months / emi is missing.
// Returns { params } or { error }.
export function solveLoan({ principal, ratePct, months, emi }) {
  const has = (v) => Number.isFinite(v) && v > 0;
  const known = { principal: has(principal), ratePct: Number.isFinite(ratePct) && ratePct >= 0, months: has(months), emi: has(emi) };
  const missing = Object.keys(known).filter((k) => !known[k]);
  if (missing.length > 1) return { error: `Need three of loan amount, rate, tenure and EMI; missing ${missing.join(', ')}` };
  if (known.ratePct && ratePct > 50) return { error: 'Interest rate must be 50% or less' };
  if (known.months && months > 480) return { error: 'Tenure must be 40 years or less' };

  const solved = missing[0] ?? 'emi';
  let p = { principal, ratePct, months, emi };
  if (solved === 'emi') p.emi = emiFor(principal, ratePct, months);
  if (solved === 'principal') p.principal = principalFor(emi, ratePct, months);
  if (solved === 'months') {
    p.months = monthsFor(principal, ratePct, emi);
    if (p.months == null) return { error: `An EMI of ${Math.round(emi)} doesn't cover the monthly interest, so the loan never gets repaid` };
    if (p.months > 480) return { error: 'This EMI would take more than 40 years to repay the loan' };
  }
  if (solved === 'ratePct') {
    p.ratePct = rateFor(principal, months, emi);
    if (p.ratePct == null) return { error: 'This EMI repays less than the loan amount, so no interest rate fits' };
  }
  p = { ...p, principal: Math.round(p.principal), emi: Math.round(p.emi) };
  return { params: p, solved };
}

// Full repayment picture. The last payment differs slightly from the EMI.
export function amortize({ principal, ratePct, months, emi }) {
  const r = monthlyRate(ratePct);
  const pay = emi ?? emiFor(principal, ratePct, months);
  let balance = principal;
  let totalInterest = 0;
  const years = [];
  for (let m = 1; m <= months && balance > 0.5; m += 1) {
    const interest = balance * r;
    // The last instalment clears whatever rounding the EMI left behind.
    const principalPart = m === months ? balance : Math.min(pay - interest, balance);
    balance -= principalPart;
    totalInterest += interest;
    const y = Math.ceil(m / 12);
    if (!years[y - 1]) years[y - 1] = { year: y, principal: 0, interest: 0, balance: 0 };
    years[y - 1].principal += principalPart;
    years[y - 1].interest += interest;
    years[y - 1].balance = Math.max(0, balance);
  }
  const round = (x) => Math.round(x);
  return {
    emi: round(pay),
    months,
    totalInterest: round(totalInterest),
    totalPaid: round(principal + totalInterest),
    interestSharePct: Math.round((totalInterest / (principal + totalInterest)) * 100),
    byYear: years.map((y) => ({ year: y.year, principal: round(y.principal), interest: round(y.interest), balance: round(y.balance) }))
  };
}
