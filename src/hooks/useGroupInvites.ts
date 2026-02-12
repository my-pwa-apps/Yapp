import { useEffect, useState } from 'react';
import { ref, onValue, get } from 'firebase/database';
import { db } from '../firebase';

export interface GroupInvite {
  chatId: string;
  chatName: string;
  invitedBy: string;  // admin's display name
  timestamp: number;
}

/**
 * Listen for group invites targeting the current user.
 * Scans all chats for pendingMembers/{uid} with type 'invite'.
 */
export function useGroupInvites(uid: string | undefined) {
  const [invites, setInvites] = useState<GroupInvite[]>([]);

  useEffect(() => {
    if (!uid) return;
    // Listen to all chats (we read the whole chats node anyway in useChats)
    const chatsRef = ref(db, 'chats');
    const unsub = onValue(chatsRef, (snap) => {
      const result: GroupInvite[] = [];
      snap.forEach((child) => {
        const val = child.val();
        if (
          val.type === 'group' &&
          val.pendingMembers &&
          val.pendingMembers[uid] &&
          val.pendingMembers[uid].type === 'invite'
        ) {
          result.push({
            chatId: child.key!,
            chatName: val.name || 'Group',
            invitedBy: val.pendingMembers[uid].fromName,
            timestamp: val.pendingMembers[uid].timestamp,
          });
        }
      });
      setInvites(result);
    });
    return () => unsub();
  }, [uid]);

  return invites;
}
