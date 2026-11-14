import { getJson } from './http';

// Indian mutual fund NAVs from mfapi.in (free, no key, AMFI data, daily).
const BASE = 'https://api.mfapi.in/mf';

// mfapi dates are DD-MM-YYYY
const toIso = (d) => d.split('-').reverse().join('-');

export async function searchFunds(query) {
  const list = await getJson(`${BASE}/search?q=${encodeURIComponent(query)}`);
  return (Array.isArray(list) ? list : []).map((f) => ({ schemeCode: String(f.schemeCode), name: f.schemeName }));
}

export async function latestNav(schemeCode) {
  const data = await getJson(`${BASE}/${schemeCode}/latest`);
  const row = data?.data?.[0];
  if (!row) throw new Error(`No NAV for scheme ${schemeCode}`);
  return { nav: Number(row.nav), date: toIso(row.date), name: data.meta?.scheme_name, category: data.meta?.scheme_category };
}

// NAV on a date (or the last trading day before it), for working out units
// from an amount invested on that date.
export async function navOn(schemeCode, isoDate) {
  const data = await getJson(`${BASE}/${schemeCode}`);
  const rows = data?.data ?? [];
  const row = rows.find((r) => toIso(r.date) <= isoDate);
  if (!row) throw new Error(`No NAV on or before ${isoDate} for scheme ${schemeCode}`);
  return { nav: Number(row.nav), date: toIso(row.date) };
}
