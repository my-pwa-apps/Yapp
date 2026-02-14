import { useEffect, useState } from 'react';
import {
  ref,
  onValue,
  set,
  remove,
  get,
} from 'firebase/database';
import { db } from '../firebase';

/**
 * Hook that subscribes to the current user's blocked users list.
 */
export function useBlockedUsers(uid: string | undefined) {
  const [blockedUsers, setBlockedUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
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
  // Add to blocked lists (both directions for fast lookup)
  await set(ref(db, `blockedUsers/${currentUid}/${targetUid}`), true);
  await set(ref(db, `blockedBy/${targetUid}/${currentUid}`), true);

  // Remove from contacts (both directions)
  await remove(ref(db, `contacts/${currentUid}/${targetUid}`));
  await remove(ref(db, `contacts/${targetUid}/${currentUid}`));

  // Unfollow both directions
  await remove(ref(db, `yappFollowing/${currentUid}/${targetUid}`));
  await remove(ref(db, `yappFollowing/${targetUid}/${currentUid}`));
  await remove(ref(db, `yappFollowers/${currentUid}/${targetUid}`));
  await remove(ref(db, `yappFollowers/${targetUid}/${currentUid}`));

  // Remove pending contact requests (both directions)
  await remove(ref(db, `contactRequests/${currentUid}/${targetUid}`));
  await remove(ref(db, `contactRequests/${targetUid}/${currentUid}`));
}

/**
 * Unblock a user.
 */
export async function unblockUser(currentUid: string, targetUid: string): Promise<void> {
  await remove(ref(db, `blockedUsers/${currentUid}/${targetUid}`));
  await remove(ref(db, `blockedBy/${targetUid}/${currentUid}`));
}
