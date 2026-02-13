/**
 * Firebase Cloud Messaging — token registration and foreground message handling.
 *
 * SETUP REQUIRED:
 * 1. In Firebase Console → Project Settings → Cloud Messaging → Web Push certificates,
 *    click "Generate key pair" and paste the public key below as VAPID_KEY.
 * 2. Upgrade to the Blaze (pay-as-you-go) plan to enable Cloud Functions.
 * 3. Deploy the Cloud Function: `cd functions && npm install && cd .. && firebase deploy --only functions`
 */

import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { ref, set } from 'firebase/database';
import app, { db } from './firebase';

// ⚠️  Replace with your VAPID key from Firebase Console → Project Settings → Cloud Messaging
const VAPID_KEY = 'PASTE_YOUR_VAPID_KEY_HERE';

/**
 * Register for push notifications and save the FCM token to the database.
 * Returns the token on success, null on failure.
 */
export async function registerFCMToken(uid: string): Promise<string | null> {
  try {
    // Check browser support first
    const supported = await isSupported();
    if (!supported || !('serviceWorker' in navigator)) return null;

    const messaging = getMessaging(app);
    const sw = await navigator.serviceWorker.ready;

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: sw,
    });

    if (token) {
      await set(ref(db, `fcmTokens/${uid}/${token.slice(0, 20)}`), {
        token,
        platform: getPlatform(),
        lastActive: Date.now(),
      });
    }

    return token;
  } catch (err) {
    console.warn('FCM registration failed:', err);
    return null;
  }
}

/**
 * Remove a stored FCM token (e.g. on sign-out).
 */
export async function removeFCMToken(uid: string): Promise<void> {
  try {
    const supported = await isSupported();
    if (!supported) return;

    const messaging = getMessaging(app);
    const sw = await navigator.serviceWorker.ready;
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: sw,
    });
    if (token) {
      await set(ref(db, `fcmTokens/${uid}/${token.slice(0, 20)}`), null);
    }
  } catch { /* best-effort cleanup */ }
}

function getPlatform(): string {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Win/.test(ua)) return 'windows';
  if (/Mac/.test(ua)) return 'macos';
  return 'web';
}
