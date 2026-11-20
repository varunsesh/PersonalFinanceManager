import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { today } from './constants';
import { useChatStore } from '../store/chatStore';
import { useDbStore } from '../store/dbStore';
import { useSettingsStore } from '../store/settingsStore';

// A backup is one JSON file with everything the app stores, except API keys.
const APP = 'finchat';
const VERSION = 1;

export function buildBackup() {
  const db = useDbStore.getState();
  const { finnhubKey, updateSettings, setDefaultReturn, resetAssumptions, lastBackupAt, ...settings } =
    useSettingsStore.getState();
  return {
    app: APP,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      currency: db.currency,
      plan: db.plan,
      transactions: db.transactions,
      holdings: db.holdings,
      goals: db.goals ?? [],
      memories: db.memories ?? [],
      creditCards: db.creditCards ?? [],
      cardEmis: db.cardEmis ?? [],
      suggestionState: db.suggestionState,
      messages: useChatStore.getState().messages,
      settings
    }
  };
}

// Saves through the Android share sheet (Drive, Files, email, ...) in the
// app, or as a download in the browser.
export async function exportBackup() {
  const json = JSON.stringify(buildBackup(), null, 2);
  const fileName = `finchat-backup-${today()}.json`;
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({
      path: fileName,
      data: json,
      directory: Directory.Cache,
      encoding: Encoding.UTF8
    });
    await Share.share({ title: 'FinChat backup', files: [uri], dialogTitle: 'Save your FinChat backup' });
  } else {
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }
  useSettingsStore.getState().updateSettings({ lastBackupAt: new Date().toISOString() });
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

// Checks a backup file and summarises it for the confirmation screen.
// Throws with a readable message if it isn't a FinChat backup.
export function parseBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("This file isn't valid JSON.");
  }
  if (parsed?.app !== APP || !isObj(parsed.data)) throw new Error("This isn't a FinChat backup file.");
  if (parsed.version > VERSION) throw new Error('This backup is from a newer version of FinChat. Update the app first.');
  const d = parsed.data;
  for (const key of ['transactions', 'holdings', 'goals', 'memories', 'creditCards', 'cardEmis', 'messages']) {
    if (d[key] != null && !Array.isArray(d[key])) throw new Error(`The backup's ${key} are damaged.`);
  }
  if (!isObj(d.plan) || !isObj(d.plan.ratios) || !isObj(d.plan.categoryLimits)) throw new Error("The backup's budget plan is damaged.");
  return {
    backup: parsed,
    summary: {
      exportedAt: parsed.exportedAt,
      transactions: d.transactions?.length ?? 0,
      holdings: d.holdings?.length ?? 0,
      goals: d.goals?.length ?? 0,
      memories: d.memories?.length ?? 0,
      creditCards: d.creditCards?.length ?? 0,
      messages: d.messages?.length ?? 0
    }
  };
}

// Replaces all app data with the backup. API keys on this device are kept.
export function restoreBackup(backup) {
  const d = backup.data;
  useDbStore.setState({
    currency: d.currency || '₹',
    plan: d.plan,
    transactions: d.transactions ?? [],
    holdings: d.holdings ?? [],
    goals: d.goals ?? [],
    memories: d.memories ?? [],
    creditCards: d.creditCards ?? [],
    cardEmis: d.cardEmis ?? [],
    suggestionState: d.suggestionState ?? { dismissed: {}, accepted: {} },
    priceErrors: []
  });
  useChatStore.setState({ messages: d.messages ?? [], hasNewUpdates: true });
  if (isObj(d.settings)) {
    const { finnhubKey, ...settings } = d.settings;
    useSettingsStore.getState().updateSettings(settings);
  }
}
