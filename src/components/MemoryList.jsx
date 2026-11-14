import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { MAX_MEMORIES, validateMemory } from '../lib/memory';
import { useDbStore } from '../store/dbStore';

// Facts the assistant remembers about the user; editable here as well as by chat.
export default function MemoryList() {
  const memories = useDbStore((s) => s.memories);
  const addMemory = useDbStore((s) => s.addMemory);
  const removeMemory = useDbStore((s) => s.removeMemory);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(null);

  const add = (e) => {
    e.preventDefault();
    if (memories.length >= MAX_MEMORIES) {
      setError(`Up to ${MAX_MEMORIES} facts; delete some first.`);
      return;
    }
    const { text, topic, error: err } = validateMemory(draft, 'other');
    if (err) {
      setError(err);
      return;
    }
    const now = new Date().toISOString();
    addMemory({ id: `mem-${Date.now()}`, text, topic, createdAt: now, updatedAt: now });
    setDraft('');
    setError(null);
  };

  return (
    <div className="space-y-2 pt-1">
      {memories.length === 0 ? (
        <p className="text-[11px] text-slate-400">Nothing yet. Tell the chat about yourself, e.g. “I'm 30 and my employer adds 10% to NPS”.</p>
      ) : (
        <ul className="space-y-1">
          {memories.map((m) => (
            <li key={m.id} className="flex items-start gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700">
              <span className="mt-px shrink-0 rounded bg-white px-1 text-[9px] font-semibold uppercase tracking-wider text-slate-400">{m.topic}</span>
              <span className="flex-1">{m.text}</span>
              <button onClick={() => removeMemory(m.id)} className="shrink-0 text-slate-300 hover:text-rose-600" aria-label={`Forget: ${m.text}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a fact, e.g. Prefers index funds"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs"
        />
        <button type="submit" disabled={!draft.trim()} className="rounded-lg bg-slate-100 px-2.5 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-40" aria-label="Add fact">
          <Plus className="h-3.5 w-3.5" />
        </button>
      </form>
      {error && <p className="text-[11px] font-medium text-rose-600">{error}</p>}
    </div>
  );
}
