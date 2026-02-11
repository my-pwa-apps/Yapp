import { useEffect, useState } from 'react';
import {
  ref,
  onValue,
  push,
  set,
  update,
} from 'firebase/database';
import { db } from '../firebase';
import type { Message } from '../types';

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
  text: string
) {
  const timestamp = Date.now();

  // Add message
  const msgRef = push(ref(db, `messages/${chatId}`));
  await set(msgRef, {
    chatId,
    senderId,
    senderName,
    text,
    timestamp,
    readBy: { [senderId]: true },
    type: 'text',
  });

  // Update chat's lastMessage
  await update(ref(db, `chats/${chatId}`), {
    lastMessage: {
      text,
      senderId,
      senderName,
      timestamp,
    },
  });
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
  const timestamp = Date.now();

  const msgRef = push(ref(db, `messages/${chatId}`));
  await set(msgRef, {
    chatId,
    senderId,
    senderName,
    text: previewText,
    timestamp,
    readBy: { [senderId]: true },
    type,
    mediaURL,
    ...(extra?.voiceDuration !== undefined ? { voiceDuration: extra.voiceDuration } : {}),
  });

  await update(ref(db, `chats/${chatId}`), {
    lastMessage: {
      text: previewText,
      senderId,
      senderName,
      timestamp,
    },
  });
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
