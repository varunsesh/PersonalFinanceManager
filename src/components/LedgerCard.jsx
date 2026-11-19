import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { CATEGORIES } from '../lib/constants';
import { useDbStore } from '../store/dbStore';
import CategoryLimitsTable from './CategoryLimitsTable';
import TransactionsTable from './TransactionsTable';

export default function LedgerCard({ initialTab = 'transactions', targetSeq }) {
  const transactions = useDbStore((s) => s.transactions);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab, targetSeq]);

  const filteredTransactions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return transactions.filter((tx) => {
      const matchesCat = categoryFilter === 'ALL' || tx.category === categoryFilter;
      const matchesSearch =
        !q || tx.description.toLowerCase().includes(q) || tx.category.toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
  }, [transactions, categoryFilter, searchQuery]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
        <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('transactions')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'transactions' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            Transactions ({transactions.length})
          </button>
          <button
            onClick={() => setActiveTab('plan')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'plan' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            Category Limits
          </button>
        </div>

        {activeTab === 'transactions' && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-44">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700"
            >
              <option value="ALL">All Categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {activeTab === 'transactions' ? (
        <TransactionsTable transactions={filteredTransactions} />
      ) : (
        <CategoryLimitsTable />
      )}
    </div>
  );
}
