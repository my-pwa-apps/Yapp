import { useEffect, useState } from 'react';
import {
  ref,
  get,
  onValue,
  push,
  update,
} from 'firebase/database';
import { db } from '../firebase';
import type { Message } from '../types';
import { sendPushToUsers } from '../utils/sendPushNotification';

export function useMessages(chatId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!chatId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const msgsRef = ref(db, `messages/${chatId}`);
    const unsub = onValue(msgsRef, (snap) => {
      const data: Message[] = [];
      snap.forEach((child) => {
        data.push({ ...child.val(), id: child.key! });
      });
      // Sort by timestamp ascending
      data.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
      setMessages(data);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [chatId]);

  return { messages, loading };
}

export async function sendMessage(
  chatId: string,
  senderId: string,
  senderName: string,
  text: string,
  encryption?: { ciphertext: string; iv: string }
) {
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
  extra?: { voiceDuration?: number }
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

export async function setTyping(chatId: string, uid: string, isTyping: boolean) {
  await update(ref(db, `chats/${chatId}/typing`), { [uid]: isTyping });
}
