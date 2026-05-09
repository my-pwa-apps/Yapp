import { useEffect, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../firebase';
import { isE2EMockMode } from '../utils/e2eMockData';

/**
 * Tracks Firebase RTDB connection status.
 * Returns true when connected, false when disconnected.
 */
export function useConnectionStatus() {
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    if (isE2EMockMode()) return;
    const connRef = ref(db, '.info/connected');
    const unsub = onValue(connRef, (snap) => {
      setConnected(snap.val() === true);
    });
    return () => unsub();
  }, []);

  return connected;
}
