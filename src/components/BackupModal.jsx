import { useState } from 'react';
import { AlertTriangle, Download, HardDriveDownload, Upload, X } from 'lucide-react';
import { exportBackup, parseBackup, restoreBackup } from '../lib/backup';
import { useSettingsStore } from '../store/settingsStore';

const when = (iso) =>
  iso ? new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'never';

export default function BackupModal({ onClose }) {
  const lastBackupAt = useSettingsStore((s) => s.lastBackupAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(null); // parsed backup awaiting confirmation
  const [done, setDone] = useState(null);

  const doExport = async () => {
    setError(null);
    setBusy(true);
    try {
      await exportBackup();
      setDone('Backup created.');
    } catch (err) {
      // Closing the share sheet without choosing an app isn't an error
      if (!/cancel/i.test(err?.message ?? '')) setError(err?.message || 'Export failed.');
    } finally {
      setBusy(false);
    }
  };

  const pickFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setDone(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setPending(parseBackup(String(reader.result || '')));
      } catch (err) {
        setError(err.message);
      }
    };
    reader.readAsText(file);
  };

  const confirmRestore = () => {
    restoreBackup(pending.backup);
    setPending(null);
    setDone('Backup restored.');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <HardDriveDownload className="h-4 w-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">Backup & restore</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs leading-relaxed text-slate-600">
          Your data lives only on this phone. A backup file holds your transactions, plan, investments, goals, remembered
          facts, chat and settings (not API keys). Save it somewhere safe, like Google Drive.
        </p>
        <div className="text-[11px] text-slate-500">Last backup: <span className="font-semibold text-slate-700">{when(lastBackupAt)}</span></div>

        {pending ? (
          <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-start gap-2 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-semibold">Replace all data on this phone?</div>
                <div className="mt-1 text-amber-800">
                  Backup from {when(pending.summary.exportedAt)}: {pending.summary.transactions} transactions,{' '}
                  {pending.summary.holdings} investments, {pending.summary.goals} goals, {pending.summary.memories} remembered facts,{' '}
                  {pending.summary.messages} chat messages. Back up your current data first if you might need it.
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPending(null)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white">
                Cancel
              </button>
              <button onClick={confirmRestore} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700">
                Replace and restore
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={doExport}
              disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" /> Back up now
            </button>
            <label className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <Upload className="h-3.5 w-3.5" /> Restore…
              <input type="file" accept="application/json,.json" onChange={pickFile} className="hidden" />
            </label>
          </div>
        )}

        {error && <div className="text-xs font-medium text-rose-600">{error}</div>}
        {done && <div className="text-xs font-medium text-emerald-600">{done}</div>}
      </div>
    </div>
  );
}
