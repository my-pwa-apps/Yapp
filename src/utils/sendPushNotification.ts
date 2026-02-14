import { ref, get } from 'firebase/database';
import { db } from '../firebase';
import { PUSH_WORKER_URL, PUSH_API_KEY } from '../pushConfig';

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Send a Web Push notification to one or more users via the Cloudflare Worker.
 *
 * Reads each recipient's push subscriptions from Firebase RTDB
 * and forwards them to the Worker, which delivers the actual push.
 */
export async function sendPushToUsers(
  recipientUids: string[],
  payload: PushPayload
): Promise<void> {
  if (!PUSH_WORKER_URL || !PUSH_API_KEY) return;
  if (recipientUids.length === 0) return;

  // Collect all push subscriptions for the recipients
  const subscriptions: { endpoint: string; keys: { p256dh: string; auth: string } }[] = [];

  for (const uid of recipientUids) {
    try {
      const snap = await get(ref(db, `pushSubscriptions/${uid}`));
      if (snap.exists()) {
        const entries = snap.val() as Record<string, {
          endpoint: string;
          keys: { p256dh: string; auth: string };
        }>;
        Object.values(entries).forEach((entry) => {
          if (entry.endpoint && entry.keys?.p256dh && entry.keys?.auth) {
            subscriptions.push({
              endpoint: entry.endpoint,
              keys: entry.keys,
            });
          }
        });
      }
    } catch {
      // Skip this user if we can't read their subscriptions
    }
  }

  if (subscriptions.length === 0) return;

  try {
    await fetch(`${PUSH_WORKER_URL}/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': PUSH_API_KEY,
      },
      body: JSON.stringify({ subscriptions, payload }),
    });
  } catch (err) {
    console.warn('[sendPushToUsers] Failed to send push:', err);
  }
}
