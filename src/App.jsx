import { useState } from 'react';
import ApiKeyModal from './components/ApiKeyModal';
import Header from './components/Header';
import ManualEntryModal from './components/ManualEntryModal';
import Chat from './pages/Chat';
import Dashboard from './pages/Dashboard';
import { useChatStore } from './store/chatStore';
import { useStoresHydrated } from './store/useHydration';

export default function App() {
  const hydrated = useStoresHydrated();
  const markUpdatesSeen = useChatStore((s) => s.markUpdatesSeen);
  // Primary top-level view: 'chat' (default) | 'dashboard'
  const [activeView, setActiveView] = useState('chat');
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);

  const changeView = (view) => {
    setActiveView(view);
    if (view === 'dashboard') markUpdatesSeen();
  };

  if (!hydrated) {
    return (
      <div className="h-[100dvh] bg-slate-50 flex items-center justify-center text-sm text-slate-400">
        Loading your budget…
      </div>
    );
  }

  return (
    <div className="h-[100dvh] bg-slate-50 text-slate-900 flex flex-col font-sans overflow-hidden">
      <Header
        activeView={activeView}
        onChangeView={changeView}
        onOpenKeyModal={() => setShowKeyModal(true)}
        onOpenManualEntry={() => setShowManualModal(true)}
      />

      {activeView === 'chat' ? (
        <Chat
          onOpenDashboard={() => changeView('dashboard')}
          onRequireApiKey={() => setShowKeyModal(true)}
        />
      ) : (
        <Dashboard />
      )}

      {showKeyModal && <ApiKeyModal onClose={() => setShowKeyModal(false)} />}
      {showManualModal && <ManualEntryModal onClose={() => setShowManualModal(false)} />}
    </div>
  );
}
