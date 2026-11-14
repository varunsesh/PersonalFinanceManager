import { INSTRUMENTS, TAX_RULES } from './taxRules';

// Projections for each instrument, after tax, with a line-by-line breakdown.
// Rates are annual percentages and are treated as compound annual growth
// (CAGR), except FD/RD (quarterly compounding) and PPF (monthly accrual,
// credited yearly), which follow how those products actually work.
//
// settings: { slabPct, inflationPct, inrDepreciationPct, npsAnnuityPct }
// params:   { instrument, mode: 'lumpsum'|'monthly'|'yearly', amount, years,
//             ratePct, stepUpPct? }

const round = (n) => Math.round(n);
const withCess = (tax) => tax * (1 + TAX_RULES.cessPct / 100);

// Contribution schedule: [{ month, amount }], month 0 = today.
function schedule({ mode, amount, years, stepUpPct = 0 }) {
  const months = Math.round(years * 12);
  const list = [];
  if (mode === 'lumpsum') {
    list.push({ month: 0, amount });
  } else if (mode === 'yearly') {
    for (let y = 0; y < Math.ceil(years); y++) list.push({ month: y * 12, amount: amount * (1 + stepUpPct / 100) ** y });
  } else {
    for (let m = 0; m < months; m++) list.push({ month: m, amount: amount * (1 + stepUpPct / 100) ** Math.floor(m / 12) });
  }
  return { months, list };
}

// Annualised return of a set of cashflows (contributions out, value in).
function irr(contributions, finalValue, months) {
  if (finalValue <= 0) return -100;
  const npv = (r) =>
    contributions.reduce((s, c) => s - c.amount / (1 + r) ** c.month, 0) + finalValue / (1 + r) ** months;
  let lo = -0.99;
  let hi = 1;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (npv(mid) > 0) lo = mid;
    else hi = mid;
  }
  return ((1 + lo) ** 12 - 1) * 100;
}

// Market-linked growth: each contribution compounds at the annual rate for
// the months it is held, so its holding period decides short vs long term.
function grow(list, months, ratePct) {
  return list.map((c) => {
    const value = c.amount * (1 + ratePct / 100) ** ((months - c.month) / 12);
    return { ...c, value, gain: value - c.amount, heldMonths: months - c.month };
  });
}

// Tax lines for a set of lots ({ gain, heldMonths }) sold together.
export function capitalGainsTax(instrument, lots, slabPct) {
  const lines = [];
  const sum = (arr) => arr.reduce((s, l) => s + Math.max(0, l.gain), 0);

  if (instrument === 'equity_in') {
    const r = TAX_RULES.equityIndia;
    const st = sum(lots.filter((l) => l.heldMonths <= r.longTermAfterMonths));
    const lt = sum(lots.filter((l) => l.heldMonths > r.longTermAfterMonths));
    const taxableLt = Math.max(0, lt - r.ltcgExemption);
    if (st > 0) lines.push({ label: `Short-term gains ₹${round(st).toLocaleString('en-IN')} × ${r.stcgPct}%`, amount: (st * r.stcgPct) / 100 });
    if (lt > 0) {
      lines.push({
        label: `Long-term gains ₹${round(lt).toLocaleString('en-IN')} − ₹1.25L exempt, × ${r.ltcgPct}%`,
        amount: (taxableLt * r.ltcgPct) / 100
      });
    }
  } else if (instrument === 'intl_fund' || instrument === 'us_stock') {
    const r = TAX_RULES.foreign;
    const st = sum(lots.filter((l) => l.heldMonths <= r.longTermAfterMonths));
    const lt = sum(lots.filter((l) => l.heldMonths > r.longTermAfterMonths));
    if (st > 0) lines.push({ label: `Short-term gains ₹${round(st).toLocaleString('en-IN')} × ${slabPct}% slab`, amount: (st * slabPct) / 100 });
    if (lt > 0) lines.push({ label: `Long-term gains ₹${round(lt).toLocaleString('en-IN')} × ${r.ltcgPct}% (no exemption)`, amount: (lt * r.ltcgPct) / 100 });
  } else {
    const g = sum(lots);
    if (g > 0) lines.push({ label: `Gains ₹${round(g).toLocaleString('en-IN')} × ${slabPct}% slab`, amount: (g * slabPct) / 100 });
  }
  return lines;
}

function finish({ params, settings, list, months, invested, grossValue, taxLines, inHand, extra = {}, notes = [] }) {
  const baseTax = taxLines.reduce((s, l) => s + l.amount, 0);
  const lines = taxLines.map((l) => ({ ...l, amount: round(l.amount) }));
  if (baseTax > 0) lines.push({ label: `Cess ${TAX_RULES.cessPct}%`, amount: round((baseTax * TAX_RULES.cessPct) / 100) });
  const tax = round(withCess(baseTax));
  const net = inHand ?? grossValue - tax;
  return {
    instrument: params.instrument,
    instrumentLabel: INSTRUMENTS[params.instrument]?.label ?? params.instrument,
    mode: params.mode,
    amount: params.amount,
    years: params.years,
    ratePct: params.ratePct,
    stepUpPct: params.stepUpPct || 0,
    invested: round(invested),
    grossValue: round(grossValue),
    gains: round(grossValue - invested),
    taxLines: lines,
    tax,
    inHand: round(net),
    postTaxReturnPct: Math.round(irr(list, net, months) * 10) / 10,
    todaysMoney: round(net / (1 + settings.inflationPct / 100) ** params.years),
    taxRules: TAX_RULES.label,
    notes,
    ...extra
  };
}

function marketLinked(params, settings) {
  const { months, list } = schedule(params);
  const notes = [];
  let ratePct = params.ratePct;
  if (params.instrument === 'us_stock') {
    // US returns are in dollars; the rupee's fall adds to them in INR terms.
    ratePct = ((1 + params.ratePct / 100) * (1 + settings.inrDepreciationPct / 100) - 1) * 100;
    notes.push(`${params.ratePct}% in USD + ${settings.inrDepreciationPct}%/yr rupee depreciation ≈ ${ratePct.toFixed(1)}% in INR`);
    notes.push('US dividends (25% withheld in the US) and TCS on remittances above ₹10L/yr are not included');
  }
  const lots = grow(list, months, ratePct);
  const invested = list.reduce((s, c) => s + c.amount, 0);
  const grossValue = lots.reduce((s, l) => s + l.value, 0);
  if (params.instrument === 'equity_in') notes.push('Assumes everything is sold in one financial year, so the ₹1.25L exemption is used once');
  return finish({
    params, settings, list, months, invested, grossValue,
    taxLines: capitalGainsTax(params.instrument, lots, settings.slabPct),
    notes
  });
}

function fd(params, settings) {
  // Quarterly compounding; a monthly mode is a recurring deposit.
  const { months, list } = schedule(params);
  const q = params.ratePct / 400;
  const grossValue = list.reduce((s, c) => s + c.amount * (1 + q) ** ((months - c.month) / 3), 0);
  const invested = list.reduce((s, c) => s + c.amount, 0);
  const interest = grossValue - invested;
  return finish({
    params, settings, list, months, invested, grossValue,
    taxLines: [{ label: `Interest ₹${round(interest).toLocaleString('en-IN')} × ${settings.slabPct}% slab`, amount: (interest * settings.slabPct) / 100 }],
    notes: ['FD interest is taxed every year as it accrues (TDS applies above the threshold); shown here as one total']
  });
}

function ppf(params, settings) {
  // Interest accrues monthly on the balance and is credited at year end.
  const notes = [];
  const yearlyCap = TAX_RULES.ppf.maxYearly;
  const yearly = params.mode === 'monthly' ? params.amount * 12 : params.amount;
  const scale = yearly > yearlyCap ? yearlyCap / yearly : 1;
  if (scale < 1) notes.push(`PPF deposits are capped at ₹1.5L a year; projected using ₹1.5L`);
  if (params.years < TAX_RULES.ppf.lockInYears) notes.push('PPF matures after 15 years; earlier withdrawals are limited');

  const { months, list: raw } = schedule(params);
  const list = raw.map((c) => ({ ...c, amount: c.amount * scale }));
  let balance = 0;
  let interest = 0;
  for (let m = 0; m < months; m++) {
    list.filter((c) => c.month === m).forEach((c) => (balance += c.amount));
    interest += (balance * params.ratePct) / 1200;
    if (m % 12 === 11) {
      balance += interest;
      interest = 0;
    }
  }
  balance += interest;
  const invested = list.reduce((s, c) => s + c.amount, 0);
  notes.push('PPF is tax-free (EEE); under the new regime there is no 80C deduction on deposits');
  return finish({ params, settings, list, months, invested, grossValue: balance, taxLines: [], notes });
}

function nps(params, settings) {
  const { months, list } = schedule(params);
  const lots = grow(list, months, params.ratePct);
  const invested = list.reduce((s, c) => s + c.amount, 0);
  const corpus = lots.reduce((s, l) => s + l.value, 0);
  const lumpSum = (corpus * TAX_RULES.nps.taxFreeLumpSumPct) / 100;
  const annuityCorpus = corpus - lumpSum;
  const pension = (annuityCorpus * settings.npsAnnuityPct) / 100 / 12;
  const pensionAfterTax = pension * (1 - withCess(settings.slabPct) / 100);
  return finish({
    params, settings, list, months, invested, grossValue: corpus,
    taxLines: [],
    inHand: corpus,
    extra: {
      nps: {
        lumpSum: round(lumpSum),
        annuityCorpus: round(annuityCorpus),
        monthlyPension: round(pension),
        monthlyPensionAfterTax: round(pensionAfterTax),
        annuityPct: settings.npsAnnuityPct
      }
    },
    notes: [
      `At exit, 60% (₹${round(lumpSum).toLocaleString('en-IN')}) can be withdrawn tax-free; 40% must buy an annuity`,
      `Annuity at ${settings.npsAnnuityPct}%: about ₹${round(pension).toLocaleString('en-IN')}/month, taxed at your slab (≈ ₹${round(pensionAfterTax).toLocaleString('en-IN')} after tax)`,
      'Employer NPS contributions are deductible under the new regime (80CCD(2)); your own are not'
    ]
  });
}

export function project(params, settings) {
  const p = { stepUpPct: 0, ...params, amount: Math.max(0, Number(params.amount) || 0), years: Math.max(0.25, Number(params.years) || 1) };
  switch (p.instrument) {
    case 'fd':
      return fd(p, settings);
    case 'ppf':
      return ppf(p, settings);
    case 'nps':
      return nps(p, settings);
    case 'equity_in':
    case 'intl_fund':
    case 'us_stock':
    case 'debt_mf':
      return marketLinked(p, settings);
    default:
      throw new Error(`Unknown instrument ${p.instrument}`);
  }
}

// Same projection at lower and higher returns, for market-linked instruments.
export function projectRange(params, settings, spread = 2) {
  if (!INSTRUMENTS[params.instrument]?.marketLinked) return null;
  return [params.ratePct - spread, params.ratePct + spread].map((ratePct) => ({
    ratePct,
    inHand: project({ ...params, ratePct }, settings).inHand
  }));
}

// Smallest contribution whose after-tax value reaches `target`, or null if no
// amount can (e.g. PPF's yearly cap).
export function requiredContribution(params, target, settings) {
  let lo = 0;
  let hi = Math.max(target, 1);
  while (project({ ...params, amount: hi }, settings).inHand < target) {
    if (hi > 1e12) return null;
    hi *= 2;
  }
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (project({ ...params, amount: mid }, settings).inHand >= target) hi = mid;
    else lo = mid;
  }
  return Math.ceil(hi / 100) * 100;
}
