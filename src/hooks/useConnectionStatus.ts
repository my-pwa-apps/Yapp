import { useEffect, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../firebase';

/**
 * Tracks Firebase RTDB connection status.
 * Returns true when connected, false when disconnected.
 */
export function useConnectionStatus() {
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    const connRef = ref(db, '.info/connected');
    const unsub = onValue(connRef, (snap) => {
      setConnected(snap.val() === true);
    });
    return () => unsub();
  }, []);

  return connected;
}
