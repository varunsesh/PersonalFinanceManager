import { useState } from 'react';
import { FileText, KeyRound, X } from 'lucide-react';
import { useDbStore } from '../store/dbStore';

export default function ApiKeyModal({ onClose }) {
  const apiKey = useDbStore((s) => s.apiKey);
  const setApiKey = useDbStore((s) => s.setApiKey);
  const [keyInput, setKeyInput] = useState(apiKey);

  const save = (value) => {
    setApiKey(value);
    onClose();
  };

  // Read .env or .txt file picked from phone storage
  const handleEnvFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = String(evt.target?.result || '');
      const envMatch = text.match(/(?:VITE_)?GEMINI_API_KEY\s*=\s*["']?([^\s"']+)["']?/i);
      const rawKeyMatch = text.match(/(AIza[0-9A-Za-z_-]{20,})/);
      const extracted = envMatch?.[1] || rawKeyMatch?.[1] || text.trim();
      setKeyInput(extracted);
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-indigo-600" />
            <h3 className="font-bold text-slate-900 text-sm">Gemini API Key Configuration</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          Your key is stored locally inside the app&apos;s private device storage and sent only to Google&apos;s Gemini API.
        </p>

        {/* Load from phone file (.env or .txt) */}
        <div className="p-3 rounded-xl bg-slate-50 border border-dashed border-slate-300 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>Load from a <code className="font-mono">.env</code> or <code className="font-mono">.txt</code> file on your phone</span>
          </div>
          <label className="shrink-0 cursor-pointer text-xs font-semibold bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 px-2.5 py-1.5 rounded-lg">
            Pick File
            <input
              type="file"
              accept=".env,.txt,text/plain,*/*"
              onChange={handleEnvFileUpload}
              className="hidden"
            />
          </label>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Gemini API Key</label>
          <input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="AIzaSy..."
            className="w-full text-sm font-mono border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex justify-between items-center pt-2">
          {apiKey ? (
            <button
              type="button"
              onClick={() => save('')}
              className="text-xs font-medium text-rose-600 hover:underline"
            >
              Remove Saved Key
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => save(keyInput)}
              className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm"
            >
              Save Key Locally
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
