import { Bot, Sparkles } from 'lucide-react';

export default function TypingIndicator() {
  return (
    <div className="flex gap-2.5">
      <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
        <Bot className="w-4 h-4 animate-pulse" />
      </div>
      <div className="bg-slate-100 text-slate-500 rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-xs flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
        <span>Logging to IndexedDB...</span>
      </div>
    </div>
  );
}
