import { Bot, CheckCircle2, User } from 'lucide-react';

export default function ChatMessage({ message: m, onBadgeClick }) {
  return (
    <div className={`flex gap-2.5 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
          m.role === 'user' ? 'bg-slate-800 text-white' : 'bg-indigo-100 text-indigo-700'
        }`}
      >
        {m.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-4 h-4" />}
      </div>
      <div className={`max-w-[84%] space-y-1.5 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-line ${
            m.role === 'user'
              ? 'bg-indigo-600 text-white rounded-tr-sm'
              : 'bg-slate-100 text-slate-800 rounded-tl-sm'
          }`}
        >
          {m.text}
        </div>
        {m.badges && m.badges.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {m.badges.map((b, i) => (
              <button
                key={i}
                type="button"
                onClick={onBadgeClick}
                className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition-colors"
              >
                <CheckCircle2 className="w-3 h-3" />
                {b}
              </button>
            ))}
          </div>
        )}
        <div className={`text-[10px] text-slate-400 ${m.role === 'user' ? 'text-right' : 'text-left'}`}>
          {m.timestamp}
        </div>
      </div>
    </div>
  );
}
