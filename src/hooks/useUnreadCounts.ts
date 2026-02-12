import { useEffect, useState } from 'react';
import { ref, onValue, query, limitToLast } from 'firebase/database';
import { db } from '../firebase';
import type { Chat } from '../types';

/**
 * Listen to unread message counts for all user's chats.
 * Only checks the last 50 messages per chat for performance.
 */
export function useUnreadCounts(chats: Chat[], currentUid: string | undefined) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const chatIds = chats.map(c => c.id).join(',');

  useEffect(() => {
    if (!currentUid || !chatIds) return;

    const ids = chatIds.split(',');
    const unsubs: (() => void)[] = [];

    ids.forEach((chatId) => {
      const msgsRef = query(ref(db, `messages/${chatId}`), limitToLast(50));
      const unsub = onValue(msgsRef, (snap) => {
        let unread = 0;
        snap.forEach((child) => {
          const msg = child.val();
          if (
            msg.senderId !== currentUid &&
            msg.type !== 'system' &&
            (!msg.readBy || !msg.readBy[currentUid])
          ) {
            unread++;
          }
        });
        setCounts((prev) => {
          if (prev[chatId] === unread) return prev;
          return { ...prev, [chatId]: unread };
        });
      });
      unsubs.push(unsub);
    });

    return () => unsubs.forEach((u) => u());
  }, [chatIds, currentUid]);

  return counts;
}
