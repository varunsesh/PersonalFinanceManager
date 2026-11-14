import { getJson } from './http';

// US stock/ETF prices from Finnhub (free key, 60 calls/minute, personal use).
const BASE = 'https://finnhub.io/api/v1';

export async function usQuote(symbol, apiKey) {
  if (!apiKey) throw new Error('Add a Finnhub key in Settings for US prices');
  const q = await getJson(`${BASE}/quote?symbol=${encodeURIComponent(symbol)}`, { 'X-Finnhub-Token': apiKey });
  if (!q || !q.c) throw new Error(`No price for ${symbol}`);
  return { price: q.c, date: new Date(q.t * 1000).toISOString().slice(0, 10) };
}

export async function searchUsSymbols(query, apiKey) {
  if (!apiKey) throw new Error('Add a Finnhub key in Settings for US prices');
  const r = await getJson(`${BASE}/search?q=${encodeURIComponent(query)}&exchange=US`, { 'X-Finnhub-Token': apiKey });
  return (r?.result ?? []).slice(0, 8).map((s) => ({ symbol: s.symbol, name: s.description, type: s.type }));
}
