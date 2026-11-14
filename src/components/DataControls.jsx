import { RotateCcw } from 'lucide-react';
import { INITIAL_MESSAGES, nowTime } from '../lib/constants';
import { useChatStore } from '../store/chatStore';
import { useDbStore } from '../store/dbStore';

export default function DataControls() {
  const clearTransactions = useDbStore((s) => s.clearTransactions);
  const resetToDemo = useDbStore((s) => s.resetToDemo);
  const resetMessages = useChatStore((s) => s.resetMessages);

  const startFreshBlank = () => {
    clearTransactions();
    resetMessages([
      {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        timestamp: nowTime(),
        text: 'Cleared sample data! Tell me your monthly income, savings goal, or log your first expense.'
      }
    ]);
  };

  const resetDemoData = () => {
    resetToDemo();
    resetMessages(INITIAL_MESSAGES);
  };

  return (
    <div className="flex items-center justify-between bg-white px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs">
      <span className="text-slate-500 font-medium">Local Database Controls</span>
      <div className="flex items-center gap-2">
        <button
          onClick={startFreshBlank}
          className="font-medium px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
        >
          Wipe Sample Data
        </button>
        <button
          onClick={resetDemoData}
          className="inline-flex items-center gap-1 font-medium px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
        >
          <RotateCcw className="w-3 h-3" /> Reset Demo
        </button>
      </div>
    </div>
  );
}
