import { CreditCard, Trash2 } from 'lucide-react';
import { CATEGORY_COLORS } from '../lib/constants';
import { useDbStore, useFormatMoney } from '../store/dbStore';

export default function TransactionsTable({ transactions }) {
  const deleteTransaction = useDbStore((s) => s.deleteTransaction);
  const creditCards = useDbStore((s) => s.creditCards);
  const cardName = (id) => creditCards.find((c) => c.id === id)?.name;
  const formatMoney = useFormatMoney();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-400 bg-slate-50/40">
            <th className="py-2.5 px-3 font-semibold">Date</th>
            <th className="py-2.5 px-3 font-semibold">Description</th>
            <th className="py-2.5 px-3 font-semibold">Category</th>
            <th className="py-2.5 px-3 font-semibold text-right">Amount</th>
            <th className="py-2.5 px-2 w-8"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-xs">
          {transactions.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-10 text-center text-slate-400">
                No matching transactions found.
              </td>
            </tr>
          ) : (
            transactions.map((tx) => {
              const isIncome = tx.type === 'income' || tx.bucket === 'income';
              const isSavings = tx.type === 'savings' || tx.bucket === 'savings';
              const isCardPayment = tx.type === 'card_payment';
              const card = tx.cardId && cardName(tx.cardId);
              return (
                <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">{tx.date}</td>
                  <td className="py-2.5 px-3 font-medium text-slate-800">
                    {tx.description}
                    {card && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-slate-100 px-1 py-px text-[10px] font-medium text-slate-500">
                        <CreditCard className="h-2.5 w-2.5" /> {card}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    {isCardPayment ? (
                      <span className="text-slate-500">Card bill payment</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-slate-600">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: CATEGORY_COLORS[tx.category] || '#64748b' }}
                        />
                        {tx.category}
                      </span>
                    )}
                  </td>
                  <td
                    className={`py-2.5 px-3 text-right font-bold whitespace-nowrap ${
                      isIncome ? 'text-emerald-600' : isSavings ? 'text-indigo-600' : isCardPayment ? 'text-slate-400' : 'text-slate-800'
                    }`}
                  >
                    {isIncome ? '+' : isCardPayment ? '' : '-'}
                    {formatMoney(tx.amount)}
                  </td>
                  <td className="py-2.5 px-2 text-right">
                    {/* EMI instalments come from their plan (Cards tab) */}
                    {!tx.emiId && (
                      <button
                        onClick={() => deleteTransaction(tx.id)}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
