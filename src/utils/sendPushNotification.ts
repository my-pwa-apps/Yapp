import { auth } from '../firebase';
import { PUSH_WORKER_URL } from '../pushConfig';

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Send a Web Push notification to one or more users via the Cloudflare Worker.
 *
 * The worker validates the caller using the current Firebase ID token,
 * resolves the recipients' push subscriptions server-side, and delivers the push.
 */
export async function sendPushToUsers(
  recipientUids: string[],
  payload: PushPayload
): Promise<void> {
  if (!PUSH_WORKER_URL) return;
  if (recipientUids.length === 0) return;

  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) return;

  try {
    await fetch(`${PUSH_WORKER_URL}/push`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ recipientUids, payload }),
    });
  } catch (err) {
    console.warn('[sendPushToUsers] Failed to send push:', err);
  }
}
