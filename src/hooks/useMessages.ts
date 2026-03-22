import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ref,
  get,
  onValue,
  push,
  update,
  remove,
  query,
  orderByChild,
  limitToLast,
  endBefore,
  onDisconnect,
} from 'firebase/database';
import { db } from '../firebase';
import type { Message } from '../types';
import { sendPushToUsers } from '../utils/sendPushNotification';

const PAGE_SIZE = 80;

export function useMessages(chatId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const olderMessagesRef = useRef<Message[]>([]);

  useEffect(() => {
    if (!chatId) {
      setMessages([]);
      setLoading(false);
      setHasMore(false);
      olderMessagesRef.current = [];
      return;
    }
    setLoading(true);
    olderMessagesRef.current = [];
    const msgsRef = query(ref(db, `messages/${chatId}`), orderByChild('timestamp'), limitToLast(PAGE_SIZE));
    const unsub = onValue(msgsRef, (snap) => {
      const data: Message[] = [];
      snap.forEach((child) => {
        data.push({ ...child.val(), id: child.key! });
      });
      data.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
      setHasMore(data.length >= PAGE_SIZE);
      setMessages([...olderMessagesRef.current, ...data]);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [chatId]);

  const loadMore = useCallback(async () => {
    if (!chatId || !hasMore) return;
    const oldest = messages[0];
    if (!oldest) return;
    const olderQuery = query(
      ref(db, `messages/${chatId}`),
      orderByChild('timestamp'),
      endBefore(oldest.timestamp ?? 0),
      limitToLast(PAGE_SIZE)
    );
    const snap = await get(olderQuery);
    const data: Message[] = [];
    snap.forEach((child) => {
      data.push({ ...child.val(), id: child.key! });
    });
    data.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
    setHasMore(data.length >= PAGE_SIZE);
    olderMessagesRef.current = [...data, ...olderMessagesRef.current];
    setMessages((prev) => [...data, ...prev]);
  }, [chatId, hasMore, messages]);

  return { messages, loading, hasMore, loadMore };
}

export async function sendMessage(
  chatId: string,
  senderId: string,
  senderName: string,
  text: string,
  encryption?: { ciphertext: string; iv: string },
  ephemeralTTL?: number,
  forwardable?: boolean,
) {
  if (!chatId || !senderId) throw new Error('Missing chatId or senderId');
  if (text.length > 50000) throw new Error('Message text exceeds maximum length');
  const msg: Record<string, unknown> = {
    chatId,
    senderId,
    senderName,
    text: encryption ? '🔒 Encrypted message' : text,
    timestamp: Date.now(),
    readBy: { [senderId]: true },
    type: 'text',
  };
  if (encryption) {
    msg.encrypted = true;
    msg.ciphertext = encryption.ciphertext;
    msg.iv = encryption.iv;
  }
  if (ephemeralTTL && ephemeralTTL > 0) {
    msg.ephemeralTTL = ephemeralTTL;
  }
  if (forwardable === false) {
    msg.forwardable = false;
  }
  await _pushMessage(chatId, msg);
}

/**
 * Send a media message (image, gif, sticker, voice).
 */
export async function sendMediaMessage(
  chatId: string,
  senderId: string,
  senderName: string,
  type: 'image' | 'gif' | 'sticker' | 'voice',
  mediaURL: string,
  previewText: string,
  extra?: { voiceDuration?: number; ephemeralTTL?: number }
) {
  await _pushMessage(chatId, {
    chatId,
    senderId,
    senderName,
    text: previewText,
    timestamp: Date.now(),
    readBy: { [senderId]: true },
    type,
    mediaURL,
    ...(extra?.voiceDuration !== undefined ? { voiceDuration: extra.voiceDuration } : {}),
    ...(extra?.ephemeralTTL && extra.ephemeralTTL > 0 ? { ephemeralTTL: extra.ephemeralTTL } : {}),
  });
}

/** Internal: push a message and update lastMessage atomically */
async function _pushMessage(
  chatId: string,
  msg: Record<string, unknown>
) {
  const msgKey = push(ref(db, `messages/${chatId}`)).key!;
  const updates: Record<string, unknown> = {};
  updates[`messages/${chatId}/${msgKey}`] = msg;
  const lastMessage: Record<string, unknown> = {
    text: msg.text,
    senderId: msg.senderId,
    senderName: msg.senderName,
    timestamp: msg.timestamp,
  };
  if (msg.encrypted) {
    lastMessage.encrypted = true;
    lastMessage.ciphertext = msg.ciphertext;
    lastMessage.iv = msg.iv;
  }
  updates[`chats/${chatId}/lastMessage`] = lastMessage;
  await update(ref(db), updates);

  // Send Web Push to other chat members (fire-and-forget)
  _pushNotifyMembers(
    chatId,
    msg.senderId as string,
    msg.senderName as string,
    msg.encrypted ? 'New message' : (msg.text as string)
  );
}

/** Fire-and-forget: send push notification to all chat members except sender */
async function _pushNotifyMembers(
  chatId: string,
  senderId: string,
  senderName: string,
  text: string
) {
  try {
    const membersSnap = await get(ref(db, `chats/${chatId}/members`));
    if (!membersSnap.exists()) return;
    const members = Object.keys(membersSnap.val());
    const recipients = members.filter((uid) => uid !== senderId);
    if (recipients.length === 0) return;

    // Check if this is a group chat for better notification title
    const chatSnap = await get(ref(db, `chats/${chatId}/name`));
    const groupName = chatSnap.exists() ? chatSnap.val() : null;
    const title = groupName
      ? `${senderName} in ${groupName}`
      : senderName;

    sendPushToUsers(recipients, {
      title,
      body: text.length > 100 ? text.slice(0, 100) + '…' : text,
      data: { type: 'message', chatId, tag: `msg-${chatId}` },
    }).catch(() => {});
  } catch {
    // Non-critical — don't break message sending
  }
}

export async function markMessagesRead(chatId: string, messageIds: string[], uid: string) {
  const updates: Record<string, boolean> = {};
  messageIds.forEach((id) => {
    updates[`messages/${chatId}/${id}/readBy/${uid}`] = true;
  });
  await update(ref(db), updates);
}

/** Edit a text message (only the sender can edit). */
export async function editMessage(
  chatId: string,
  messageId: string,
  newText: string,
) {
  const updates: Record<string, unknown> = {
    [`messages/${chatId}/${messageId}/text`]: newText,
    [`messages/${chatId}/${messageId}/edited`]: true,
    [`messages/${chatId}/${messageId}/editedAt`]: Date.now(),
  };
  await update(ref(db), updates);
}

/** Soft-delete a message (replaces content, keeps the row so read receipts aren't lost). */
export async function deleteMessage(chatId: string, messageId: string) {
  const updates: Record<string, unknown> = {
    [`messages/${chatId}/${messageId}/deleted`]: true,
    [`messages/${chatId}/${messageId}/text`]: '',
    [`messages/${chatId}/${messageId}/mediaURL`]: null,
  };
  await update(ref(db), updates);
}

/** Set the ephemeral (self-destruct) timer for a chat. 0 = off. */
export async function setEphemeralTTL(chatId: string, ttlSeconds: number) {
  await update(ref(db, `chats/${chatId}`), { ephemeralTTL: ttlSeconds || null });
}

/** Set the expiry timestamp on an ephemeral message once it's been read by a recipient. */
export async function setEphemeralExpiry(chatId: string, messageId: string, ttlSeconds: number) {
  const expiry = Date.now() + ttlSeconds * 1000;
  await update(ref(db), {
    [`messages/${chatId}/${messageId}/ephemeralExpiry`]: expiry,
  });
}

/** Delete a message permanently (used for expired ephemeral messages). */
export async function purgeMessage(chatId: string, messageId: string) {
  await remove(ref(db, `messages/${chatId}/${messageId}`));
}

/** Forward a message to another chat. */
export async function forwardMessage(
  targetChatId: string,
  senderId: string,
  senderName: string,
  originalMessage: Message,
) {
  if (originalMessage.ephemeralTTL) {
    throw new Error('Ephemeral messages cannot be forwarded');
  }
  const msg: Record<string, unknown> = {
    chatId: targetChatId,
    senderId,
    senderName,
    text: originalMessage.text,
    timestamp: Date.now(),
    readBy: { [senderId]: true },
    type: originalMessage.type,
    forwardedFrom: originalMessage.senderName,
  };
  if (originalMessage.mediaURL) {
    msg.mediaURL = originalMessage.mediaURL;
  }
  if (originalMessage.voiceDuration != null) {
    msg.voiceDuration = originalMessage.voiceDuration;
  }
  await _pushMessage(targetChatId, msg);
}

export async function setTyping(chatId: string, uid: string, isTyping: boolean) {
  const typingRef = ref(db, `chats/${chatId}/typing/${uid}`);
  await update(ref(db, `chats/${chatId}/typing`), { [uid]: isTyping });
  // Auto-clear typing indicator if client disconnects unexpectedly
  if (isTyping) {
    onDisconnect(typingRef).set(false).catch(() => {});
  }
}
