import { useState } from 'react';
import { Mic, Send, Square } from 'lucide-react';
import { useVoiceInput } from '../hooks/useVoiceInput';

// Calls onSend with the text; clears the input only if onSend returns true.
// Voice input shows the transcript live and sends it when the user stops
// talking; typing or pressing Send while listening cancels the auto-send.
export default function ChatInput({ onSend, disabled }) {
  const [value, setValue] = useState('');
  const voice = useVoiceInput({
    onText: setValue,
    onFinal: (text) => {
      if (onSend(text)) setValue('');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (voice.listening) voice.cancel();
    if (onSend(value)) setValue('');
  };

  const toggleVoice = () => {
    if (voice.listening) {
      voice.stop();
    } else {
      setValue('');
      voice.start();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-3 border-t border-slate-200 bg-white shrink-0">
      {voice.error && <div className="mb-2 px-1 text-[11px] font-medium text-rose-600">{voice.error}</div>}
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            if (voice.listening) voice.cancel();
            setValue(e.target.value);
          }}
          placeholder={voice.listening ? 'Listening…' : 'Tell me an expense or budget goal...'}
          className="min-w-0 flex-1 text-sm bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
        />
        {voice.supported && (
          <button
            type="button"
            onClick={toggleVoice}
            disabled={disabled}
            aria-label={voice.listening ? 'Stop voice input' : 'Start voice input'}
            className={`px-3 py-2.5 rounded-xl flex items-center justify-center transition-colors disabled:opacity-40 ${
              voice.listening
                ? 'bg-rose-500 text-white animate-pulse'
                : 'bg-slate-100 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700'
            }`}
          >
            {voice.listening ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
        )}
        <button
          type="submit"
          disabled={!value.trim() || disabled}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-4 py-2.5 rounded-xl flex items-center justify-center transition-colors shadow-sm"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </form>
  );
}
