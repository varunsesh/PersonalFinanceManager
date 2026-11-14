import { today } from './constants';
import { capitalGainsTax } from './finance/calculators';
import { INSTRUMENTS, TAX_RULES } from './finance/taxRules';
import { isValidDate } from './validation';
import { latestNav, navOn } from './prices/mf';
import { usQuote } from './prices/us';
import { usdToInr } from './prices/fx';

// Holdings: what the user owns and how each is valued.
//   source 'mf'     units × NAV from mfapi.in (schemeCode)
//   source 'us'     shares × Finnhub price × USD→INR (symbol)
//   source 'fd'     principal compounded quarterly since startDate
//   source 'manual' a value the user gives (PPF, NPS, Indian stocks, ...)
export const PRICE_TTL_MS = 6 * 60 * 60 * 1000;

const monthsBetween = (from, to) => {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm) + (td - fd) / 30;
};

export function currentValue(h, asOf = today()) {
  switch (h.source) {
    case 'mf':
      return h.units && h.price ? h.units * h.price : null;
    case 'us':
      return h.units && h.price && h.fxRate ? h.units * h.price * h.fxRate : null;
    case 'fd': {
      const end = h.maturityDate && h.maturityDate < asOf ? h.maturityDate : asOf;
      const years = Math.max(0, monthsBetween(h.startDate, end) / 12);
      return h.invested * (1 + h.ratePct / 400) ** (4 * years);
    }
    default:
      return h.manualValue ?? null;
  }
}

// Fetch prices for holdings whose price is missing or stale. Returns new
// holding objects (unchanged ones are returned as-is) plus any errors.
export async function refreshPrices(holdings, { finnhubKey, force = false } = {}) {
  const stale = (h) => force || !h.priceFetchedAt || Date.now() - h.priceFetchedAt > PRICE_TTL_MS;
  const errors = [];
  let fx = null;
  const next = await Promise.all(
    holdings.map(async (h) => {
      if (!stale(h) || (h.source !== 'mf' && h.source !== 'us')) return h;
      try {
        if (h.source === 'mf') {
          const { nav, date } = await latestNav(h.schemeCode);
          return { ...h, price: nav, priceDate: date, priceFetchedAt: Date.now() };
        }
        fx ??= await usdToInr();
        const { price, date } = await usQuote(h.symbol, finnhubKey);
        return { ...h, price, priceDate: date, fxRate: fx.rate, priceFetchedAt: Date.now() };
      } catch (err) {
        errors.push(`${h.name}: ${err.message}`);
        return h;
      }
    })
  );
  return { holdings: next, errors };
}

// Build a holding from what the model (or a form) provides, looking up
// prices as needed. Throws with a readable message if it can't be valued.
export async function createHolding(input, { finnhubKey }, id) {
  const instrument = input.instrument;
  if (!INSTRUMENTS[instrument]) throw new Error(`Unknown instrument ${instrument}`);
  const startDate = isValidDate(input.startDate) ? input.startDate : null;
  const base = {
    id,
    name: String(input.name || '').trim() || INSTRUMENTS[instrument].label,
    instrument,
    startDate,
    invested: Number(input.investedAmount) > 0 ? Number(input.investedAmount) : null
  };

  if (input.schemeCode) {
    const latest = await latestNav(input.schemeCode);
    let units = Number(input.units) > 0 ? Number(input.units) : null;
    const notes = [];
    if (!units && base.invested && startDate) {
      const then = await navOn(input.schemeCode, startDate);
      units = base.invested / then.nav;
      notes.push(`units from ₹${base.invested} at NAV ${then.nav} on ${then.date}`);
    }
    if (!units && Number(input.currentValue) > 0) {
      units = Number(input.currentValue) / latest.nav;
      notes.push(`units from current value at NAV ${latest.nav}`);
    }
    if (!units) throw new Error('For a mutual fund, give units, current value, or amount invested with the date (lumpsum)');
    return {
      ...base,
      name: base.name === INSTRUMENTS[instrument].label ? latest.name : base.name,
      source: 'mf',
      schemeCode: String(input.schemeCode),
      units: Math.round(units * 1000) / 1000,
      price: latest.nav,
      priceDate: latest.date,
      priceFetchedAt: Date.now(),
      notes
    };
  }

  if (input.symbol) {
    const units = Number(input.units);
    if (!(units > 0)) throw new Error('For a US stock or ETF, give the number of shares');
    const [quote, fx] = await Promise.all([usQuote(input.symbol.toUpperCase(), finnhubKey), usdToInr()]);
    return {
      ...base,
      source: 'us',
      symbol: input.symbol.toUpperCase(),
      units,
      price: quote.price,
      priceDate: quote.date,
      fxRate: fx.rate,
      priceFetchedAt: Date.now()
    };
  }

  if (instrument === 'fd') {
    const ratePct = Number(input.ratePct);
    if (!base.invested || !(ratePct > 0) || !startDate) throw new Error('For an FD, give the amount, interest rate and start date');
    const maturityDate = isValidDate(input.maturityDate) ? input.maturityDate : null;
    return { ...base, source: 'fd', ratePct, maturityDate };
  }

  const manualValue = Number(input.currentValue);
  if (!(manualValue > 0)) {
    if (['equity_in', 'intl_fund', 'debt_mf'].includes(instrument)) {
      throw new Error('Mutual fund needs a schemeCode: call search_mutual_funds first. (Indian stocks/IPOs: give currentValue.)');
    }
    throw new Error('Give the current value (or a US symbol to fetch prices)');
  }
  return { ...base, source: 'manual', manualValue, manualValueDate: today() };
}

// Totals, allocation and an estimate of tax if everything were sold today.
export function portfolioSummary(holdings, slabPct) {
  const asOf = today();
  const rows = holdings.map((h) => {
    const value = currentValue(h, asOf);
    const gain = value != null && h.invested != null ? value - h.invested : null;
    return { ...h, value, gain, gainPct: gain != null && h.invested ? (gain / h.invested) * 100 : null };
  });

  const total = rows.reduce((s, r) => s + (r.value ?? 0), 0);
  const invested = rows.reduce((s, r) => s + (r.invested ?? 0), 0);
  const byInstrument = {};
  rows.forEach((r) => {
    if (r.value == null) return;
    byInstrument[r.instrument] = (byInstrument[r.instrument] ?? 0) + r.value;
  });

  // Exit tax: lots grouped by instrument so the equity exemption is shared.
  // PPF and NPS are excluded (tax-free / annuity rules); FD interest is taxed
  // yearly, so only its accrued interest is estimated at the slab rate.
  const taxLines = [];
  const lotsBy = {};
  rows.forEach((r) => {
    if (r.gain == null || !r.startDate || ['ppf', 'nps'].includes(r.instrument)) return;
    if (r.instrument === 'fd') {
      if (r.gain > 0) taxLines.push({ label: `${r.name} interest × ${slabPct}%`, amount: (r.gain * slabPct) / 100 });
      return;
    }
    (lotsBy[r.instrument] ??= []).push({ gain: r.gain, heldMonths: monthsBetween(r.startDate, asOf) });
  });
  Object.entries(lotsBy).forEach(([instrument, lots]) => {
    capitalGainsTax(instrument, lots, slabPct).forEach((l) =>
      taxLines.push({ label: `${INSTRUMENTS[instrument].label}: ${l.label}`, amount: l.amount })
    );
  });
  const baseTax = taxLines.reduce((s, l) => s + l.amount, 0);
  const exitTax = Math.round(baseTax * (1 + TAX_RULES.cessPct / 100));

  return {
    asOf,
    total: Math.round(total),
    invested: Math.round(invested),
    gain: Math.round(total - invested),
    exitTax,
    afterTaxIfSold: Math.round(total - exitTax),
    taxLines: taxLines.map((l) => ({ ...l, amount: Math.round(l.amount) })),
    allocation: Object.entries(byInstrument)
      .map(([instrument, value]) => ({
        instrument,
        label: INSTRUMENTS[instrument].label,
        value: Math.round(value),
        pct: total > 0 ? Math.round((value / total) * 1000) / 10 : 0
      }))
      .sort((a, b) => b.value - a.value),
    holdings: rows.map((r) => ({
      id: r.id,
      name: r.name,
      instrument: r.instrument,
      source: r.source,
      symbol: r.symbol,
      units: r.units,
      invested: r.invested != null ? Math.round(r.invested) : null,
      value: r.value != null ? Math.round(r.value) : null,
      gain: r.gain != null ? Math.round(r.gain) : null,
      gainPct: r.gainPct != null ? Math.round(r.gainPct * 10) / 10 : null,
      priceDate: r.priceDate ?? r.manualValueDate ?? null,
      startDate: r.startDate
    }))
  };
}
