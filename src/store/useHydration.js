import { useEffect, useState } from 'react';
import { useChatStore } from './chatStore';
import { useDbStore } from './dbStore';

const STORES = [useDbStore, useChatStore];
const allHydrated = () => STORES.every((store) => store.persist.hasHydrated());

// True once every persisted store has loaded from IndexedDB. The UI waits for
// this so nothing is written over saved data before it has been read.
export function useStoresHydrated() {
  const [hydrated, setHydrated] = useState(allHydrated);
  useEffect(() => {
    const check = () => setHydrated(allHydrated());
    const unsubs = STORES.map((store) => store.persist.onFinishHydration(check));
    check();
    return () => unsubs.forEach((unsub) => unsub());
  }, []);
  return hydrated;
}
