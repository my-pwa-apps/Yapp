import { useEffect, useRef } from 'react';
import { ref, set, remove } from 'firebase/database';
import { db } from '../firebase';
import { VAPID_PUBLIC_KEY } from '../pushConfig';

/**
 * Subscribes the browser to Web Push and saves the PushSubscription
 * to Firebase RTDB at /pushSubscriptions/{uid}/{hash}.
 *
 * This only activates when VAPID_PUBLIC_KEY is configured.
 */
export function usePushSubscription(uid: string | undefined) {
  const subKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!uid || !VAPID_PUBLIC_KEY || !('serviceWorker' in navigator) || !('PushManager' in window)) return;

    let cancelled = false;

    const subscribe = async () => {
      try {
        const registration = await navigator.serviceWorker.ready;

        // Check current subscription
        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
          // Subscribe with the VAPID public key
          const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey,
          });
        }

        if (cancelled) return;

        // Save to RTDB
        const subJSON = subscription.toJSON();
        const hash = simpleHash(subscription.endpoint);
        subKeyRef.current = hash;

        await set(ref(db, `pushSubscriptions/${uid}/${hash}`), {
          endpoint: subJSON.endpoint,
          keys: subJSON.keys,
          createdAt: Date.now(),
        });
      } catch (err) {
        console.warn('[usePushSubscription] Could not subscribe:', err);
      }
    };

    subscribe();

    return () => {
      cancelled = true;
      // Clean up subscription reference on sign-out
      if (subKeyRef.current && uid) {
        remove(ref(db, `pushSubscriptions/${uid}/${subKeyRef.current}`)).catch(() => {});
      }
    };
  }, [uid]);
}

/** Convert a base64url string to a Uint8Array (for applicationServerKey) */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/** Simple hash for use as an RTDB key */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    hash = ((hash << 5) - hash + c) | 0;
  }
  return 'ps' + Math.abs(hash).toString(36);
}
