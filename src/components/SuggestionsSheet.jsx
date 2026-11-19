import { useEffect } from 'react';
import { Lightbulb, X } from 'lucide-react';
import { useSuggestions } from '../store/useSuggestions';
import SuggestionCard from './SuggestionCard';

// All current suggestions, opened from the chat's "this month" card.
export default function SuggestionsSheet({ onClose, onAsk }) {
  const suggestions = useSuggestions();

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-xs sm:items-center sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85%] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-bold text-slate-900">Suggestions</h3>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 overflow-y-auto p-4">
          {suggestions.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">Nothing to suggest right now. You&apos;re all caught up.</p>
          ) : (
            suggestions.map((s) => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                onAccepted={() => {
                  if (suggestions.length <= 1) onClose();
                }}
                onAsk={(prompt) => {
                  onClose();
                  onAsk(prompt);
                }}
              />
            ))
          )}
          <p className="text-[10px] leading-relaxed text-slate-400">
            Suggestions are based on your own data and the stored tax rules. They&apos;re not financial advice; nothing changes
            unless you accept, and accepted suggestions can be undone from the chat.
          </p>
        </div>
      </div>
    </div>
  );
}
