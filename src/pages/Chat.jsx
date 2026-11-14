import { useEffect, useRef } from 'react';
import BalanceStrip from '../components/BalanceStrip';
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
  const apiKey = useDbStore((s) => s.apiKey);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
      <BalanceStrip onOpenDashboard={onOpenDashboard} />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m) => (
          <ChatMessage key={m.id} message={m} onBadgeClick={onOpenDashboard} />
        ))}
        {isSending && <TypingIndicator />}
        <div ref={chatEndRef} />
      </div>

      <QuickPrompts onSelect={send} disabled={isSending} />
      <ChatInput onSend={send} disabled={isSending} />
    </main>
  );
}
