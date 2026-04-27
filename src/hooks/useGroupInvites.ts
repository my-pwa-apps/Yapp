import { useEffect, useState } from 'react';
import { ref, onValue, get } from 'firebase/database';
import { db } from '../firebase';
import type { Chat, PendingMember } from '../types';

export interface GroupInvite {
  chatId: string;
  chatName: string;
  invitedBy: string;  // admin's display name
  timestamp: number;
  encryptedKeyReady: boolean;
}

export interface GroupJoinRequest {
  chatId: string;
  chatName: string;
  uid: string;        // uid of the requester
  fromName: string;   // requester's display name
  timestamp: number;
}

/**
 * Listen for group invites targeting the current user (via userPendingInvites index)
 * AND join requests for groups the current user admins (via chats already loaded).
 */
export function useGroupInvites(uid: string | undefined, chats?: Chat[]) {
  const [invites, setInvites] = useState<GroupInvite[]>([]);
  const [joinRequests, setJoinRequests] = useState<GroupJoinRequest[]>([]);

  // Listen for pending invites via userPendingInvites index
  useEffect(() => {
    if (!uid) return;
    const indexRef = ref(db, `userPendingInvites/${uid}`);
    const unsub = onValue(indexRef, async (snap) => {
      if (!snap.exists()) {
        setInvites([]);
        return;
      }
      const chatIds = Object.keys(snap.val());
      // Read each invited chat to get details
      const inv: GroupInvite[] = [];
      const chatSnaps = await Promise.all(
        chatIds.map((id) => get(ref(db, `chats/${id}`)).then((s) => ({ id, snap: s })))
      );
      for (const { id, snap: chatSnap } of chatSnaps) {
        if (!chatSnap.exists()) continue;
        const val = chatSnap.val();
        if (val.pendingMembers?.[uid]?.type === 'invite') {
          inv.push({
            chatId: id,
            chatName: val.name || 'Group',
            invitedBy: val.pendingMembers[uid].fromName,
            timestamp: val.pendingMembers[uid].timestamp,
            encryptedKeyReady: !val.encryptedGroupKey || !!val.encryptedGroupKey[uid],
          });
        }
      }
      inv.sort((a, b) => b.timestamp - a.timestamp);
      setInvites(inv);
    });
    return () => unsub();
  }, [uid]);

  // Derive join requests from already-loaded chats where user is admin
  useEffect(() => {
    if (!uid || !chats) {
      setJoinRequests([]);
      return;
    }
    const req: GroupJoinRequest[] = [];
    for (const chat of chats) {
      if (chat.type !== 'group' || !chat.admins?.[uid] || !chat.pendingMembers) continue;
      for (const [pUid, pm] of Object.entries(chat.pendingMembers) as [string, PendingMember][]) {
        if (pm.type === 'request') {
          req.push({
            chatId: chat.id,
            chatName: chat.name || 'Group',
            uid: pUid,
            fromName: pm.fromName,
            timestamp: pm.timestamp,
          });
        }
      }
    }
    req.sort((a, b) => b.timestamp - a.timestamp);
    setJoinRequests(req);
  }, [uid, chats]);

  return { invites, joinRequests };
}
