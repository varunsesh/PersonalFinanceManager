import { AlertTriangle, Bot, CheckCircle2, RotateCcw, User } from 'lucide-react';
import ChatCard from './ChatCard';
import LoanCard from './LoanCard';
import ReturnsCard from './ReturnsCard';

export default function ChatMessage({ message: m, onBadgeClick, onUndo, onAsk }) {
  const canUndo = Boolean(m.changes) && !m.undone;

  return (
    <div className={`flex gap-2.5 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
          m.role === 'user' ? 'bg-slate-800 text-white' : 'bg-indigo-100 text-indigo-700'
        }`}
      >
        {m.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-4 h-4" />}
      </div>
      <div
        className={`max-w-[84%] space-y-1.5 ${m.role === 'user' ? 'items-end' : 'items-start'} ${
          m.card || m.calcCards?.length ? 'w-full' : ''
        }`}
      >
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-line ${
            m.role === 'user'
              ? 'bg-indigo-600 text-white rounded-tr-sm'
              : 'bg-slate-100 text-slate-800 rounded-tl-sm'
          }`}
        >
          {m.text}
        </div>

        {m.card && <ChatCard card={m.card} onAsk={onAsk} />}
        {m.calcCards?.map((calc, i) => (
          calc.kind === 'loan' ? <LoanCard key={i} calc={calc} /> : <ReturnsCard key={i} calc={calc} />
        ))}

        {m.badges && m.badges.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {m.badges.map((b, i) => (
              <button
                key={i}
                type="button"
                onClick={onBadgeClick}
                disabled={m.undone}
                className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border transition-colors ${
                  m.undone
                    ? 'bg-slate-50 text-slate-400 border-slate-200 line-through'
                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                }`}
              >
                <CheckCircle2 className="w-3 h-3" />
                {b}
              </button>
            ))}
            {canUndo && (
              <button
                type="button"
                onClick={() => onUndo(m.id)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Undo
              </button>
            )}
            {m.undone && <span className="text-[11px] font-medium text-slate-400">Undone</span>}
          </div>
        )}

        {!m.undone && m.alerts && m.alerts.length > 0 && (
          <div className="space-y-1">
            {m.alerts.map((a, i) => (
              <div
                key={i}
                className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800"
              >
                <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                <span>{a}</span>
              </div>
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
