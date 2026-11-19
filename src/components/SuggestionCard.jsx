import { useEffect, useState } from 'react';
import { Lightbulb, MessageSquare, SlidersHorizontal } from 'lucide-react';
import { formatShortINR } from '../lib/budget';
import { useChatStore } from '../store/chatStore';
import { useDbStore } from '../store/dbStore';

const ADJUSTABLE = new Set(['surplus_split', 'emergency_fund', 'fd_maturity', 'create_goal', 'plan_update', 'log_savings', 'link_holding']);

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

function FieldRow({ label, value, min = '0', max, step = 'any', onChange }) {
  return (
    <label className="flex items-center justify-between gap-2 py-1 text-xs text-slate-700">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-right text-xs tabular-nums"
      />
    </label>
  );
}

export default function SuggestionCard({ suggestion: s, onAsk, onAccepted }) {
  const goals = useDbStore((st) => st.goals);
  const setOutcome = useDbStore((st) => st.setSuggestionOutcome);
  const acceptSuggestion = useChatStore((st) => st.acceptSuggestion);
  const [editing, setEditing] = useState(false);
  const [proposal, setProposal] = useState(s.proposal);

  useEffect(() => {
    if (!editing) setProposal(s.proposal);
  }, [s.proposal, editing]);

  const handleAccept = () => {
    if (acceptSuggestion(s, proposal)) onAccepted?.();
  };

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
        <div className="rounded-lg bg-slate-50 px-2.5 py-1">
          <FieldRow
            label="Months of expenses"
            value={proposal.months}
            min="1"
            max="24"
            step="1"
            onChange={(months) => setProposal({ ...proposal, months })}
          />
        </div>
      )}
      {s.kind === 'fd_maturity' && (
        <div className="divide-y divide-slate-100 rounded-lg bg-slate-50 px-2.5 py-0.5">
          <label className="flex items-center justify-between gap-2 py-1.5 text-xs text-slate-700">
            <span>Add to goal</span>
            <select
              value={proposal.goalId ?? ''}
              onChange={(e) => setProposal({ ...proposal, goalId: e.target.value || null })}
              className="max-w-[60%] rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs"
            >
              <option value="">None (keep as cash)</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          {editing && (
            <FieldRow
              label="Matured amount"
              value={proposal.value}
              min="0"
              step="500"
              onChange={(value) => setProposal({ ...proposal, value })}
            />
          )}
        </div>
      )}
      {s.kind === 'create_goal' && (
        <div className="divide-y divide-slate-100 rounded-lg bg-slate-50 px-2.5 py-0.5">
          {editing ? (
            <>
              <FieldRow
                label="Target amount"
                value={proposal.targetAmount}
                min="1000"
                step="5000"
                onChange={(targetAmount) => setProposal({ ...proposal, targetAmount })}
              />
              <FieldRow
                label="Years"
                value={proposal.years}
                min="0.25"
                max="60"
                step="0.5"
                onChange={(years) => setProposal({ ...proposal, years })}
              />
            </>
          ) : (
            <div className="flex items-center justify-between py-1.5 text-xs text-slate-700">
              <span className="truncate">{proposal.name}</span>
              <span className="font-semibold tabular-nums text-slate-800">
                {formatShortINR(proposal.targetAmount)} · {proposal.years} yr{Number(proposal.years) === 1 ? '' : 's'}
              </span>
            </div>
          )}
        </div>
      )}
      {s.kind === 'log_savings' && (
        <div className="divide-y divide-slate-100 rounded-lg bg-slate-50 px-2.5 py-0.5">
          {editing ? (
            <FieldRow
              label="Amount"
              value={proposal.amount}
              min="100"
              step="500"
              onChange={(amount) => setProposal({ ...proposal, amount })}
            />
          ) : (
            <div className="flex items-center justify-between py-1.5 text-xs text-slate-700">
              <span className="truncate">{proposal.description || 'Save this month'}</span>
              <span className="font-semibold tabular-nums text-slate-800">{formatShortINR(proposal.amount)}</span>
            </div>
          )}
          {goals.length > 0 && (
            <label className="flex items-center justify-between gap-2 py-1.5 text-xs text-slate-700">
              <span>Tag to goal</span>
              <select
                value={proposal.goalId ?? ''}
                onChange={(e) => setProposal({ ...proposal, goalId: e.target.value || null })}
                className="max-w-[60%] rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs"
              >
                <option value="">None</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      {s.kind === 'plan_update' && editing && (
        <div className="divide-y divide-slate-100 rounded-lg bg-slate-50 px-2.5 py-0.5">
          {proposal.monthlyIncomeTarget != null && (
            <FieldRow
              label="Income target"
              value={proposal.monthlyIncomeTarget}
              min="1000"
              step="1000"
              onChange={(monthlyIncomeTarget) => setProposal({ ...proposal, monthlyIncomeTarget })}
            />
          )}
          {proposal.category && proposal.limit != null && (
            <FieldRow
              label={`${proposal.category} limit`}
              value={proposal.limit}
              min="0"
              step="500"
              onChange={(limit) => setProposal({ ...proposal, limit })}
            />
          )}
          {proposal.needsRatio != null && (
            <FieldRow
              label="Needs %"
              value={proposal.needsRatio}
              min="0"
              max="100"
              step="1"
              onChange={(needsRatio) => setProposal({ ...proposal, needsRatio })}
            />
          )}
          {proposal.wantsRatio != null && (
            <FieldRow
              label="Wants %"
              value={proposal.wantsRatio}
              min="0"
              max="100"
              step="1"
              onChange={(wantsRatio) => setProposal({ ...proposal, wantsRatio })}
            />
          )}
          {proposal.savingsRatio != null && (
            <FieldRow
              label="Savings %"
              value={proposal.savingsRatio}
              min="0"
              max="100"
              step="1"
              onChange={(savingsRatio) => setProposal({ ...proposal, savingsRatio })}
            />
          )}
        </div>
      )}
      {s.kind === 'link_holding' && (
        <div className="divide-y divide-slate-100 rounded-lg bg-slate-50 px-2.5 py-0.5">
          {editing ? (
            <FieldRow
              label="Share (%)"
              value={proposal.sharePct ?? 100}
              min="1"
              max="100"
              step="5"
              onChange={(sharePct) => setProposal({ ...proposal, sharePct })}
            />
          ) : (
            <div className="flex items-center justify-between py-1.5 text-xs text-slate-700">
              <span className="truncate">
                {proposal.holdingName || 'Holding'} → {proposal.goalName || 'Goal'}
              </span>
              <span className="font-semibold tabular-nums text-slate-800">{proposal.sharePct ?? 100}%</span>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {s.acceptLabel && (
          <button
            type="button"
            onClick={handleAccept}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            {s.acceptLabel}
          </button>
        )}
        {s.chatPrompt && onAsk && (
          <button
            type="button"
            onClick={() => onAsk(s.chatPrompt)}
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            <MessageSquare className="h-3 w-3" /> Ask FinChat
          </button>
        )}
        {ADJUSTABLE.has(s.kind) && (
          <button
            type="button"
            onClick={() => setEditing(!editing)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            <SlidersHorizontal className="h-3 w-3" /> {editing ? 'Done' : 'Adjust'}
          </button>
        )}
        <button
          type="button"
          onClick={() => setOutcome(s.id, 'dismissed')}
          className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-100"
        >
          {s.acceptLabel ? 'Dismiss' : 'Got it'}
        </button>
      </div>
    </div>
  );
}
