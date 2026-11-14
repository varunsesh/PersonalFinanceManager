import { Database, Download, KeyRound, LayoutDashboard, MessageSquare, Plus, Wallet } from 'lucide-react';
import { TODAY } from '../lib/constants';
import { useChatStore } from '../store/chatStore';
import { useDbStore } from '../store/dbStore';

function exportJSON() {
  const { currency, plan, transactions } = useDbStore.getState();
  const payload = {
    exportedAt: new Date().toISOString(),
    currency,
    plan,
    transactions
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `finchat-budget-${TODAY}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Header({ activeView, onChangeView, onOpenKeyModal, onOpenManualEntry }) {
  const apiKey = useDbStore((s) => s.apiKey);
  const currency = useDbStore((s) => s.currency);
  const setCurrency = useDbStore((s) => s.setCurrency);
  const hasNewUpdates = useChatStore((s) => s.hasNewUpdates);

  return (
    <header className="bg-white border-b border-slate-200 px-3 sm:px-4 py-2.5 shrink-0 z-20">
      <div className="max-w-5xl mx-auto flex flex-col gap-2.5">
        {/* Row 1: Brand + Controls */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
              <Wallet className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-bold text-base tracking-tight text-slate-900">FinChat</h1>
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                <Database className="w-2.5 h-2.5" /> Local
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={onOpenKeyModal}
              className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
                apiKey
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
              }`}
              title="Configure Gemini API Key"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{apiKey ? 'Key Set' : 'API Key'}</span>
            </button>

            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              aria-label="Currency"
              className="text-xs font-semibold bg-slate-100 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 focus:outline-none"
            >
              <option value="₹">₹</option>
              <option value="$">$</option>
              <option value="€">€</option>
              <option value="£">£</option>
            </select>

            <button
              onClick={onOpenManualEntry}
              className="inline-flex items-center gap-1 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1.5 rounded-lg shadow-sm transition-colors"
              title="Manual Entry"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add</span>
            </button>

            <button
              onClick={exportJSON}
              className="inline-flex items-center text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 p-1.5 rounded-lg transition-colors"
              title="Export JSON Backup"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Row 2: Full-Width Top Tab Switcher (Chat Default vs Dashboard) */}
        <div className="grid grid-cols-2 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
          <button
            type="button"
            onClick={() => onChangeView('chat')}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              activeView === 'chat'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Chat</span>
          </button>

          <button
            type="button"
            onClick={() => onChangeView('dashboard')}
            className={`relative flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              activeView === 'dashboard'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Dashboard</span>
            {hasNewUpdates && activeView !== 'dashboard' && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
