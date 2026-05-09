import { useEffect, useState } from 'react';
import {
  ref,
  onValue,
  get,
  update,
} from 'firebase/database';
import { db } from '../firebase';
import { isE2EMockMode } from '../utils/e2eMockData';

/**
 * Hook that subscribes to the current user's blocked users list.
 */
export function useBlockedUsers(uid: string | undefined) {
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isE2EMockMode()) {
      setBlockedUsers(new Set());
      return;
    }
    if (!uid) return;
    const blockedRef = ref(db, `blockedUsers/${uid}`);
    const unsub = onValue(blockedRef, (snap) => {
      const ids = new Set<string>();
      snap.forEach((child) => { ids.add(child.key!); });
      setBlockedUsers(ids);
    });
    return () => unsub();
  }, [uid]);

  return blockedUsers;
}

/**
 * Hook that subscribes to users who have blocked the current user.
 * Used to prevent the current user from interacting with users who blocked them.
 */
export function useBlockedByUsers(uid: string | undefined) {
  const [blockedBy, setBlockedBy] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isE2EMockMode()) {
      setBlockedBy(new Set());
      return;
    }
    if (!uid) return;
    const blockedByRef = ref(db, `blockedBy/${uid}`);
    const unsub = onValue(blockedByRef, (snap) => {
      const ids = new Set<string>();
      snap.forEach((child) => { ids.add(child.key!); });
      setBlockedBy(ids);
    });
    return () => unsub();
  }, [uid]);

  return blockedBy;
}

/**
 * Check if either user has blocked the other (one-shot check).
 */
export async function isBlocked(uid1: string, uid2: string): Promise<boolean> {
  if (isE2EMockMode()) return false;
  const [snap1, snap2] = await Promise.all([
    get(ref(db, `blockedUsers/${uid1}/${uid2}`)),
    get(ref(db, `blockedUsers/${uid2}/${uid1}`)),
  ]);
  return snap1.exists() || snap2.exists();
}

/**
 * Block a user: adds to blockedUsers, removes from contacts, unfollows both ways,
 * and cleans up pending contact requests.
 */
export async function blockUser(currentUid: string, targetUid: string): Promise<void> {
  const updates: Record<string, unknown> = {
    [`blockedUsers/${currentUid}/${targetUid}`]: true,
    [`blockedBy/${targetUid}/${currentUid}`]: true,
    [`contacts/${currentUid}/${targetUid}`]: null,
    [`contacts/${targetUid}/${currentUid}`]: null,
    [`yappFollowing/${currentUid}/${targetUid}`]: null,
    [`yappFollowing/${targetUid}/${currentUid}`]: null,
    [`yappFollowers/${currentUid}/${targetUid}`]: null,
    [`yappFollowers/${targetUid}/${currentUid}`]: null,
    [`contactRequests/${currentUid}/${targetUid}`]: null,
    [`contactRequests/${targetUid}/${currentUid}`]: null,
  };
  await update(ref(db), updates);
}

/**
 * Unblock a user.
 */
export async function unblockUser(currentUid: string, targetUid: string): Promise<void> {
  await update(ref(db), {
    [`blockedUsers/${currentUid}/${targetUid}`]: null,
    [`blockedBy/${targetUid}/${currentUid}`]: null,
  });
}
