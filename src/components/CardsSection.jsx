import { useMemo } from 'react';
import { CreditCard, Trash2 } from 'lucide-react';
import { formatShortINR } from '../lib/budget';
import { cardOverview } from '../lib/credit';
import { today } from '../lib/constants';
import { useDbStore } from '../store/dbStore';
import CreditCardList from './CreditCardList';

export default function CardsSection() {
  const creditCards = useDbStore((s) => s.creditCards);
  const cardEmis = useDbStore((s) => s.cardEmis);
  const transactions = useDbStore((s) => s.transactions);
  const removeCreditCard = useDbStore((s) => s.removeCreditCard);
  const removeCardEmi = useDbStore((s) => s.removeCardEmi);
  const date = today();

  const overview = useMemo(
    () => cardOverview({ creditCards, transactions, cardEmis }, date),
    [creditCards, transactions, cardEmis, date]
  );
  const inUse = (id) => transactions.some((t) => t.cardId === id) || cardEmis.some((e) => e.cardId === id);

  if (creditCards.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-5 text-center text-xs text-slate-500">
        No credit cards yet. Tell the chat about one, e.g. “Track my HDFC Regalia card, limit 3L, due on the 5th”, then log spends
        like “1,200 dinner on Regalia”, payments like “paid 25k Regalia bill” and EMIs like “bought a 60k phone on Regalia, 6 EMIs at 15%”.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-indigo-600" />
          <h3 className="text-sm font-bold text-slate-800">Credit cards</h3>
        </div>
        <span className="text-[11px] text-slate-500">
          Owed <span className="font-semibold text-slate-700">{formatShortINR(overview.totalOwed)}</span>
          {overview.totalEmiPrincipalLeft > 0 && ` · ${formatShortINR(overview.totalEmiPrincipalLeft)} in EMIs`}
        </span>
      </div>
      <CreditCardList
        overview={overview}
        cardAction={(c) =>
          !inUse(c.id) && (
            <button
              onClick={() => removeCreditCard(c.id)}
              className="mt-0.5 shrink-0 rounded p-1 text-slate-300 hover:text-rose-600"
              aria-label={`Remove card ${c.name}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )
        }
        emiAction={(e) => (
          <button
            onClick={() => removeCardEmi(e.id)}
            className="shrink-0 rounded p-1 text-slate-300 hover:text-rose-600"
            aria-label={`Delete EMI ${e.description}`}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      />
      <p className="mt-1 text-[10px] text-slate-400">
        Card spends count against your budget the day you make them; bill payments only lower the balance. EMI purchases count one
        instalment (principal + interest) per month. Balance = spends + EMIs billed − payments.
      </p>
    </div>
  );
}
