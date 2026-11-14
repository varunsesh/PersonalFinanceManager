import { getJson } from './http';

// USD→INR reference rate from Frankfurter (free, no key, updated each working
// day). Cached for the session.
let cached = null;

export async function usdToInr() {
  if (cached && Date.now() - cached.fetchedAt < 6 * 60 * 60 * 1000) return cached;
  const data = await getJson('https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR');
  const rate = data?.rates?.INR;
  if (!rate) throw new Error('Exchange rate unavailable');
  cached = { rate, date: data.date, fetchedAt: Date.now() };
  return cached;
}
