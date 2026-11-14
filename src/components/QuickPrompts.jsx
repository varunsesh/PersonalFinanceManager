const QUICK_PROMPTS = [
  'Spent 480 on coffee & snacks',
  'Invested 10000 in index fund',
  'Set dining limit to 8000',
  'How is my budget looking?'
];

export default function QuickPrompts({ onSelect, disabled }) {
  return (
    <div className="px-3 py-2 border-t border-slate-100 bg-slate-50/70 flex gap-1.5 overflow-x-auto shrink-0">
      {QUICK_PROMPTS.map((chip) => (
        <button
          key={chip}
          type="button"
          onClick={() => onSelect(chip)}
          disabled={disabled}
          className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-full bg-white hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 border border-slate-200 transition-colors"
        >
          {chip}
        </button>
      ))}
    </div>
  );
}
