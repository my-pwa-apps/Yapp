import { useEffect, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../firebase';

export interface GroupInvite {
  chatId: string;
  chatName: string;
  invitedBy: string;  // admin's display name
  timestamp: number;
}

export interface GroupJoinRequest {
  chatId: string;
  chatName: string;
  uid: string;        // uid of the requester
  fromName: string;   // requester's display name
  timestamp: number;
}

/**
 * Listen for group invites targeting the current user
 * AND join requests for groups the current user admins.
 */
export function useGroupInvites(uid: string | undefined) {
  const [invites, setInvites] = useState<GroupInvite[]>([]);
  const [joinRequests, setJoinRequests] = useState<GroupJoinRequest[]>([]);

  useEffect(() => {
    if (!uid) return;
    const chatsRef = ref(db, 'chats');
    const unsub = onValue(chatsRef, (snap) => {
      const inv: GroupInvite[] = [];
      const req: GroupJoinRequest[] = [];
      snap.forEach((child) => {
        const val = child.val();
        if (val.type !== 'group' || !val.pendingMembers) return;

        // Invites targeting the current user
        if (val.pendingMembers[uid] && val.pendingMembers[uid].type === 'invite') {
          inv.push({
            chatId: child.key!,
            chatName: val.name || 'Group',
            invitedBy: val.pendingMembers[uid].fromName,
            timestamp: val.pendingMembers[uid].timestamp,
          });
        }

        // Join requests for groups the current user admins
        if (val.admins && val.admins[uid]) {
          Object.entries(val.pendingMembers).forEach(([pUid, pm]: [string, any]) => {
            if (pm.type === 'request') {
              req.push({
                chatId: child.key!,
                chatName: val.name || 'Group',
                uid: pUid,
                fromName: pm.fromName,
                timestamp: pm.timestamp,
              });
            }
          });
        }
      });
      setInvites(inv);
      setJoinRequests(req);
    });
    return () => unsub();
  }, [uid]);

  return { invites, joinRequests };
}
