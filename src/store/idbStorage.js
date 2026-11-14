// IndexedDB-backed storage for zustand's persist middleware, with a
// localStorage fallback when IndexedDB is unavailable.
const DB_NAME = 'FinChatLocalBudgetDB';
const DB_VERSION = 1;
const STORE_NAME = 'app_state';

// A single shared connection: every write awaits the same promise, so readwrite
// transactions are created (and therefore committed) in the order they were
// requested.
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

async function idbRequest(mode, run) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const req = run(tx.objectStore(STORE_NAME));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const lsKey = (key) => `${DB_NAME}_${key}`;

async function storageGet(key) {
  try {
    return (await idbRequest('readonly', (store) => store.get(key))) ?? null;
  } catch {
    try {
      const raw = localStorage.getItem(lsKey(key));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}

async function storageSet(key, value) {
  try {
    await idbRequest('readwrite', (store) => store.put(value, key));
  } catch {
    try {
      localStorage.setItem(lsKey(key), JSON.stringify(value));
    } catch {
      // Ignore quota errors
    }
  }
}

async function storageRemove(key) {
  try {
    await idbRequest('readwrite', (store) => store.delete(key));
  } catch {
    // Ignore
  }
  try {
    localStorage.removeItem(lsKey(key));
  } catch {
    // Ignore
  }
}

// `legacyKeys` are the per-field keys the app used before zustand. If the
// store has never been saved under its new name, they are read and returned as
// its initial state so existing data on the device carries over.
export function createIdbStorage(legacyKeys = []) {
  return {
    async getItem(name) {
      const saved = await storageGet(name);
      if (saved) return saved;
      const legacy = {};
      for (const key of legacyKeys) {
        const value = await storageGet(key);
        if (value != null) legacy[key] = value;
      }
      return Object.keys(legacy).length > 0 ? { state: legacy, version: 0 } : null;
    },
    setItem: (name, value) => storageSet(name, value),
    removeItem: (name) => storageRemove(name)
  };
}
