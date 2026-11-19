import { useEffect, useRef, useState } from 'react';
import ThisMonthCard from '../components/ThisMonthCard';
import SuggestionsSheet from '../components/SuggestionsSheet';
import ChatInput from '../components/ChatInput';
import ChatMessage from '../components/ChatMessage';
import QuickPrompts from '../components/QuickPrompts';
import TypingIndicator from '../components/TypingIndicator';
import { useChatStore } from '../store/chatStore';
import { useDbStore } from '../store/dbStore';

export default function Chat({ onOpenDashboard, onOpenSettings, onRequireApiKey }) {
  const messages = useChatStore((s) => s.messages);
  const isSending = useChatStore((s) => s.isSending);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const undoMessage = useChatStore((s) => s.undoMessage);
  const apiKey = useDbStore((s) => s.apiKey);
  const feedRef = useRef(null);
  const prevCountRef = useRef(0);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Scroll only the feed when mounting, sending, or receiving new messages
  // (not when undoing an older message in place).
  useEffect(() => {
    const feed = feedRef.current;
    const isInitial = prevCountRef.current === 0;
    const grew = messages.length > prevCountRef.current;
    prevCountRef.current = messages.length;
    if (feed && (isInitial || grew || isSending)) {
      feed.scrollTo({ top: feed.scrollHeight, behavior: isInitial ? 'auto' : 'smooth' });
    }
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
          <ChatMessage
            key={m.id}
            message={m}
            onBadgeClick={onOpenDashboard}
            onOpenSettings={onOpenSettings}
            onUndo={undoMessage}
            onAsk={send}
          />
        ))}
        {isSending && <TypingIndicator />}
      </div>

      <QuickPrompts onSelect={send} disabled={isSending} />
      <ChatInput onSend={send} disabled={isSending} />
      {showSuggestions && <SuggestionsSheet onClose={() => setShowSuggestions(false)} onAsk={send} />}
    </main>
  );
}
