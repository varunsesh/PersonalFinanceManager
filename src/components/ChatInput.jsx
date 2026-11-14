import { useState } from 'react';
import { Send } from 'lucide-react';

// Calls onSend with the text; clears the input only if onSend returns true.
export default function ChatInput({ onSend, disabled }) {
  const [value, setValue] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (onSend(value)) setValue('');
  };

  return (
    <form onSubmit={handleSubmit} className="p-3 border-t border-slate-200 bg-white flex gap-2 shrink-0">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Tell me an expense or budget goal..."
        className="flex-1 text-sm bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
      />
      <button
        type="submit"
        disabled={!value.trim() || disabled}
        className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-4 py-2.5 rounded-xl flex items-center justify-center transition-colors shadow-sm"
      >
        <Send className="w-4 h-4" />
      </button>
    </form>
  );
}
