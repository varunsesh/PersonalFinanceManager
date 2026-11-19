import { useState } from 'react';
import ApiKeyModal from './components/ApiKeyModal';
import Header from './components/Header';
import ManualEntryModal from './components/ManualEntryModal';
import SettingsModal from './components/SettingsModal';
import BackupModal from './components/BackupModal';
import Chat from './pages/Chat';
import Dashboard from './pages/Dashboard';
import { useChatStore } from './store/chatStore';
import { useStoresHydrated } from './store/useHydration';
import logoUrl from './assets/logo.svg';

export default function App() {
  const hydrated = useStoresHydrated();
  const markUpdatesSeen = useChatStore((s) => s.markUpdatesSeen);
  // Primary top-level view: 'chat' (default) | 'dashboard'
  const [activeView, setActiveView] = useState('chat');
  const [dashboardTarget, setDashboardTarget] = useState({ tab: 'month', ledgerTab: 'transactions', seq: 0 });
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showBackup, setShowBackup] = useState(false);

  const changeView = (view) => {
    setActiveView(view);
    if (view === 'dashboard') markUpdatesSeen();
  };

  const openDashboard = (target) => {
    const next =
      typeof target === 'string'
        ? { tab: target }
        : target && typeof target === 'object' && 'tab' in target
          ? target
          : {};
    setDashboardTarget((prev) => ({
      tab: next.tab || 'month',
      ledgerTab: next.ledgerTab || 'transactions',
      seq: prev.seq + 1
    }));
    changeView('dashboard');
  };

  if (!hydrated) {
    return (
      <div className="h-full bg-slate-50 flex flex-col items-center justify-center gap-3 text-sm text-slate-400">
        <img src={logoUrl} alt="" className="w-14 h-14 rounded-2xl shadow-md animate-pulse" />
        Loading your budget…
      </div>
    );
  }

  return (
    <div className="h-full bg-slate-50 text-slate-900 flex flex-col font-sans overflow-hidden">
      <Header
        activeView={activeView}
        onChangeView={changeView}
        onOpenKeyModal={() => setShowKeyModal(true)}
        onOpenManualEntry={() => setShowManualModal(true)}
        onOpenSettings={() => setShowSettings(true)}
        onOpenBackup={() => setShowBackup(true)}
      />

      {activeView === 'chat' ? (
        <Chat
          onOpenDashboard={openDashboard}
          onOpenSettings={() => setShowSettings(true)}
          onRequireApiKey={() => setShowKeyModal(true)}
        />
      ) : (
        <Dashboard target={dashboardTarget} />
      )}

      {showKeyModal && <ApiKeyModal onClose={() => setShowKeyModal(false)} />}
      {showManualModal && <ManualEntryModal onClose={() => setShowManualModal(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showBackup && <BackupModal onClose={() => setShowBackup(false)} />}
    </div>
  );
}
