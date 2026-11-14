// Indian tax rules used by the calculators. Rates change with budgets, so they
// live here as data rather than inside the formulas. Verified for FY 2026-27
// (Budget 2026 left capital gains and new-regime slabs unchanged).
// Surcharge is not modelled.
export const TAX_RULES = {
  label: 'FY 2026-27',
  cessPct: 4,
  // Listed Indian equity and equity-oriented mutual funds
  equityIndia: { longTermAfterMonths: 12, stcgPct: 20, ltcgPct: 12.5, ltcgExemption: 125000 },
  // International funds from Indian fund houses, and directly held foreign
  // stocks/ETFs: long-term after 24 months at 12.5% (no exemption); short-term
  // at the slab rate
  foreign: { longTermAfterMonths: 24, ltcgPct: 12.5 },
  // Debt funds bought after 1 Apr 2023: always at the slab rate
  // FD/RD interest: slab rate, taxed every year as it accrues
  ppf: { maxYearly: 150000, lockInYears: 15 },
  nps: { taxFreeLumpSumPct: 60, annuityPct: 40 }
};

// Instruments the calculators understand.
export const INSTRUMENTS = {
  fd: { label: 'Fixed deposit', marketLinked: false },
  ppf: { label: 'PPF', marketLinked: false },
  nps: { label: 'NPS', marketLinked: true },
  equity_in: { label: 'Indian equity (MF/stocks)', marketLinked: true },
  intl_fund: { label: 'International fund (Indian AMC)', marketLinked: true },
  us_stock: { label: 'US stocks/ETFs', marketLinked: true },
  debt_mf: { label: 'Debt fund', marketLinked: false }
};
