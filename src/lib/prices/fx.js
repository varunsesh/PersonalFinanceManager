// USD→INR reference rate from Frankfurter (free, no key, updated each working
// day). Cached for the session.
let cached = null;

export async function usdToInr() {
  if (cached && Date.now() - cached.fetchedAt < 6 * 60 * 60 * 1000) return cached;
  const res = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR');
  if (!res.ok) throw new Error(`Exchange rate unavailable (${res.status})`);
  const data = await res.json();
  const rate = data?.rates?.INR;
  if (!rate) throw new Error('Exchange rate unavailable');
  cached = { rate, date: data.date, fetchedAt: Date.now() };
  return cached;
}
