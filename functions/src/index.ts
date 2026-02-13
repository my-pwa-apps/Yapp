/**
 * Cloud Functions for Yapp — sends FCM push notifications when the app is backgrounded.
 *
 * Deploy: firebase deploy --only functions --project yappin-d355d
 * Requires: Firebase Blaze (pay-as-you-go) plan
 */

import { onValueCreated } from 'firebase-functions/v2/database';
import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { getMessaging } from 'firebase-admin/messaging';

initializeApp();

const DB_INSTANCE = 'yappin-d355d-default-rtdb';
const REGION = 'europe-west1';

// ─── helpers ───────────────────────────────────────────────────────────

interface TokenEntry { token: string; path: string }

/** Collect all FCM tokens for a list of UIDs, excluding the sender. */
async function getTokensForUsers(uids: string[]): Promise<TokenEntry[]> {
  const db = getDatabase();
  const tokens: TokenEntry[] = [];

  const snaps = await Promise.all(uids.map(uid => db.ref(`fcmTokens/${uid}`).get()));

  snaps.forEach((snap, i) => {
    if (!snap.exists()) return;
    const entries = snap.val() as Record<string, { token: string }>;
    for (const [key, val] of Object.entries(entries)) {
      if (val?.token) {
        tokens.push({ token: val.token, path: `fcmTokens/${uids[i]}/${key}` });
      }
    }
  });

  return tokens;
}

/** Send a data-only FCM message and clean up invalid tokens. */
async function sendPush(tokens: TokenEntry[], data: Record<string, string>) {
  if (tokens.length === 0) return;
  const messaging = getMessaging();
  const db = getDatabase();

  await Promise.allSettled(
    tokens.map(({ token, path }) =>
      messaging.send({
        token,
        data,
        webpush: { headers: { Urgency: 'high' } },
      }).catch(async (err: { code?: string }) => {
        if (
          err.code === 'messaging/registration-token-not-registered' ||
          err.code === 'messaging/invalid-registration-token'
        ) {
          await db.ref(path).remove().catch(() => {});
        }
      })
    )
  );
}

// ─── triggers ──────────────────────────────────────────────────────────

/** Notify chat members when a new message is created. */
export const onNewMessage = onValueCreated(
  { ref: '/messages/{chatId}/{msgId}', instance: DB_INSTANCE, region: REGION },
  async (event) => {
    const msg = event.data.val() as {
      senderId: string; senderName: string; text: string; type: string;
      chatId: string;
    } | null;
    if (!msg || msg.type === 'system') return;

    const chatId = event.params.chatId;
    const db = getDatabase();
    const membersSnap = await db.ref(`chats/${chatId}/members`).get();
    if (!membersSnap.exists()) return;

    const memberUids = Object.keys(membersSnap.val()).filter(uid => uid !== msg.senderId);
    if (memberUids.length === 0) return;

    // Get chat name for group chats
    const chatSnap = await db.ref(`chats/${chatId}`).get();
    const chatData = chatSnap.val() as { type: string; name?: string } | null;
    const isGroup = chatData?.type === 'group';
    const title = isGroup
      ? `${msg.senderName} in ${chatData?.name || 'Group'}`
      : msg.senderName;

    const body = msg.text.length > 100 ? msg.text.substring(0, 100) + '…' : msg.text;

    const tokens = await getTokensForUsers(memberUids);
    await sendPush(tokens, {
      title,
      body,
      chatId,
      type: 'message',
      tag: `msg-${chatId}`,
    });
  }
);

/** Notify user when they receive a new contact request. */
export const onContactRequest = onValueCreated(
  { ref: '/contactRequests/{targetUid}/{senderUid}', instance: DB_INSTANCE, region: REGION },
  async (event) => {
    const req = event.data.val() as {
      fromName: string; fromEmail: string;
    } | null;
    if (!req) return;

    const targetUid = event.params.targetUid;
    const tokens = await getTokensForUsers([targetUid]);
    await sendPush(tokens, {
      title: 'Contact Request',
      body: `${req.fromName} (${req.fromEmail}) wants to connect`,
      type: 'contactRequest',
      tag: `contact-${req.fromEmail}`,
    });
  }
);

/** Notify user when they're invited to a group, or admins when someone requests to join. */
export const onPendingMember = onValueCreated(
  { ref: '/chats/{chatId}/pendingMembers/{uid}', instance: DB_INSTANCE, region: REGION },
  async (event) => {
    const pending = event.data.val() as {
      type: 'invite' | 'request'; fromUid: string; fromName: string;
    } | null;
    if (!pending) return;

    const chatId = event.params.chatId;
    const uid = event.params.uid;
    const db = getDatabase();

    const chatSnap = await db.ref(`chats/${chatId}/name`).get();
    const chatName = (chatSnap.val() as string) || 'Group';

    if (pending.type === 'invite') {
      // Notify the invited user
      const tokens = await getTokensForUsers([uid]);
      await sendPush(tokens, {
        title: 'Group Invite',
        body: `${pending.fromName} invited you to "${chatName}"`,
        type: 'groupInvite',
        tag: `invite-${chatName}`,
      });
    } else {
      // Notify group admins about the join request
      const adminsSnap = await db.ref(`chats/${chatId}/admins`).get();
      if (!adminsSnap.exists()) return;
      const adminUids = Object.keys(adminsSnap.val()).filter(a => a !== pending.fromUid);
      if (adminUids.length === 0) return;

      const tokens = await getTokensForUsers(adminUids);
      await sendPush(tokens, {
        title: 'Join Request',
        body: `${pending.fromName} wants to join "${chatName}"`,
        type: 'joinRequest',
        tag: `join-${chatName}-${pending.fromName}`,
      });
    }
  }
);
