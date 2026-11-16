import { useState } from 'react';
import { Lightbulb, MessageSquare, SlidersHorizontal } from 'lucide-react';
import { formatShortINR } from '../lib/budget';
import { useChatStore } from '../store/chatStore';
import { useDbStore } from '../store/dbStore';

const ADJUSTABLE = new Set(['surplus_split', 'emergency_fund', 'fd_maturity']);

function SplitRows({ rows, editing, onChange }) {
  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  return (
    <div className="divide-y divide-slate-100 rounded-lg bg-slate-50 px-2.5">
      {rows.map((r, i) => (
        <div key={r.goalId} className="flex items-center justify-between gap-2 py-1.5 text-xs">
          <span className="truncate text-slate-700">{r.name}</span>
          {editing ? (
            <input
              type="number"
              min="0"
              step="500"
              value={r.amount}
              onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
              className="w-24 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs tabular-nums"
            />
          ) : (
            <span className="font-semibold tabular-nums text-slate-800">{formatShortINR(r.amount)}</span>
          )}
        </div>
      ))}
      <div className="flex justify-between py-1.5 text-[11px] text-slate-500">
        <span>Total</span>
        <span className="font-semibold tabular-nums">{formatShortINR(total)}</span>
      </div>
    </div>
  );
}

export default function SuggestionCard({ suggestion: s, onAsk }) {
  const goals = useDbStore((st) => st.goals);
  const setOutcome = useDbStore((st) => st.setSuggestionOutcome);
  const acceptSuggestion = useChatStore((st) => st.acceptSuggestion);
  const [editing, setEditing] = useState(false);
  const [proposal, setProposal] = useState(s.proposal);

  return (
    <div className="space-y-2.5 rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-3 shadow-sm">
      <div className="flex items-start gap-2">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <div className="space-y-1">
          <div className="text-xs font-bold text-slate-800">{s.title}</div>
          <p className="text-[11px] leading-relaxed text-slate-600">{s.reason}</p>
        </div>
      </div>

      {s.kind === 'surplus_split' && (
        <SplitRows rows={proposal.rows} editing={editing} onChange={(rows) => setProposal({ ...proposal, rows })} />
      )}
      {s.kind === 'emergency_fund' && editing && (
        <label className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700">
          Months of expenses
          <input
            type="number"
            min="1"
            max="24"
            value={proposal.months}
            onChange={(e) => setProposal({ ...proposal, months: e.target.value })}
            className="w-16 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs"
          />
        </label>
      )}
      {s.kind === 'fd_maturity' && (
        <label className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700">
          Add to goal
          <select
            value={proposal.goalId ?? ''}
            disabled={!editing}
            onChange={(e) => setProposal({ ...proposal, goalId: e.target.value || null })}
            className="max-w-[60%] rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs disabled:opacity-80"
          >
            <option value="">None (keep as cash)</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {s.acceptLabel && (
          <button
            onClick={() => acceptSuggestion(s, proposal)}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            {s.acceptLabel}
          </button>
        )}
        {s.chatPrompt && onAsk && (
          <button
            onClick={() => onAsk(s.chatPrompt)}
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            <MessageSquare className="h-3 w-3" /> Ask FinChat
          </button>
        )}
        {ADJUSTABLE.has(s.kind) && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            <SlidersHorizontal className="h-3 w-3" /> Adjust
          </button>
        )}
        <button
          onClick={() => setOutcome(s.id, 'dismissed')}
          className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-100"
        >
          {s.acceptLabel ? 'Dismiss' : 'Got it'}
        </button>
      </div>
    </div>
  );
}
