import { useEffect, useRef, useState } from 'react';
import ThisMonthCard from '../components/ThisMonthCard';
import SuggestionsSheet from '../components/SuggestionsSheet';
import ChatInput from '../components/ChatInput';
import ChatMessage from '../components/ChatMessage';
import QuickPrompts from '../components/QuickPrompts';
import TypingIndicator from '../components/TypingIndicator';
import { useChatStore } from '../store/chatStore';
import { useDbStore } from '../store/dbStore';

export default function Chat({ onOpenDashboard, onRequireApiKey }) {
  const messages = useChatStore((s) => s.messages);
  const isSending = useChatStore((s) => s.isSending);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const undoMessage = useChatStore((s) => s.undoMessage);
  const apiKey = useDbStore((s) => s.apiKey);
  const feedRef = useRef(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Scroll only the feed. scrollIntoView would also scroll every ancestor,
  // which pushed the whole page (and the header) up under the status bar.
  useEffect(() => {
    const feed = feedRef.current;
    if (feed) feed.scrollTo({ top: feed.scrollHeight, behavior: 'smooth' });
  }, [messages, isSending]);

  // Returns true if the message was sent, so the input knows to clear itself.
  const send = (text) => {
    if (!text.trim() || isSending) return false;
    if (!apiKey) {
      onRequireApiKey();
      return false;
    }
    sendMessage(text);
    return true;
  };

  return (
    <main className="flex-1 max-w-3xl w-full mx-auto flex flex-col overflow-hidden bg-white sm:my-3 sm:rounded-2xl sm:border sm:border-slate-200 sm:shadow-sm">
      <ThisMonthCard onOpenDashboard={onOpenDashboard} onOpenSuggestions={() => setShowSuggestions(true)} />

      <div ref={feedRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m) => (
          <ChatMessage key={m.id} message={m} onBadgeClick={onOpenDashboard} onUndo={undoMessage} onAsk={send} />
        ))}
        {isSending && <TypingIndicator />}
      </div>

      <QuickPrompts onSelect={send} disabled={isSending} />
      <ChatInput onSend={send} disabled={isSending} />
      {showSuggestions && <SuggestionsSheet onClose={() => setShowSuggestions(false)} onAsk={send} />}
    </main>
  );
}
