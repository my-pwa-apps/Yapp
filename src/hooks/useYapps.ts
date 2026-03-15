import { useEffect, useMemo, useState } from 'react';
import {
  ref,
  onValue,
  get,
  push,
  set,
  update,
  query,
  limitToLast,
  orderByValue,
  runTransaction,
} from 'firebase/database';
import { db } from '../firebase';
import type { Yapp } from '../types';
import { isBlocked } from './useBlockedUsers';

/* ─── Feed hook ─── */

function useIndexedYapps(yappIds: string[], sorter: (a: Yapp, b: Yapp) => number) {
  const [yapps, setYapps] = useState<Yapp[]>([]);
  const [loading, setLoading] = useState(true);
  const idsKey = yappIds.slice().sort().join('|');

  useEffect(() => {
    if (yappIds.length === 0) {
      setYapps([]);
      setLoading(false);
      return;
    }

    const listeners = new Map<string, () => void>();
    const yappData = new Map<string, Yapp>();
    const pending = new Set(yappIds);

    const publish = () => {
      const next = Array.from(yappData.values()).sort(sorter);
      setYapps(next);
      if (pending.size === 0) {
        setLoading(false);
      }
    };

    setLoading(true);
    for (const yappId of yappIds) {
      const unsub = onValue(
        ref(db, `yapps/${yappId}`),
        (snap) => {
          if (snap.exists()) {
            const value = snap.val();
            yappData.set(yappId, { ...value, id: yappId, privacy: value.privacy ?? 'public' });
          } else {
            yappData.delete(yappId);
          }
          pending.delete(yappId);
          publish();
        },
        () => {
          pending.delete(yappId);
          yappData.delete(yappId);
          publish();
        }
      );
      listeners.set(yappId, unsub);
    }

    return () => listeners.forEach((unsub) => unsub());
  }, [idsKey]);

  return { yapps, loading };
}

function readIndexIds(snapshot: { forEach: (action: (child: { key: string | null }) => void) => void }) {
  const ids: string[] = [];
  snapshot.forEach((child) => {
    if (child.key) ids.push(child.key);
  });
  return ids;
}

export function useYapps(uid: string | undefined, contacts: Set<string>) {
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const contactKey = Array.from(contacts).sort().join('|');

  useEffect(() => {
    if (!uid) {
      setVisibleIds([]);
      return;
    }

    let publicIds: string[] = [];
    const privateByAuthor = new Map<string, string[]>();

    const publish = () => {
      const merged = new Set<string>(publicIds);
      for (const ids of privateByAuthor.values()) {
        for (const id of ids) merged.add(id);
      }
      setVisibleIds(Array.from(merged));
    };

    const publicRef = query(ref(db, 'publicYappIds'), orderByValue(), limitToLast(200));
    const publicUnsub = onValue(publicRef, (snap) => {
      publicIds = readIndexIds(snap);
      publish();
    }, () => {
      publicIds = [];
      publish();
    });

    const authorIds = Array.from(new Set([uid, ...contacts]));
    const privateUnsubs = authorIds.map((authorId) => {
      const authorRef = query(ref(db, `privateAuthorYappIds/${authorId}`), orderByValue(), limitToLast(authorId === uid ? 200 : 100));
      return onValue(authorRef, (snap) => {
        privateByAuthor.set(authorId, readIndexIds(snap));
        publish();
      }, () => {
        privateByAuthor.delete(authorId);
        publish();
      });
    });

    return () => {
      publicUnsub();
      privateUnsubs.forEach((unsub) => unsub());
    };
  }, [uid, contactKey]);

  return useIndexedYapps(visibleIds, (a, b) => b.timestamp - a.timestamp);
}

/* ─── Replies hook ─── */

export function useReplies(parentId: string | undefined) {
  const [replyIds, setReplyIds] = useState<string[]>([]);
  useEffect(() => {
    if (!parentId) {
      setReplyIds([]);
      return;
    }
    const replyRef = query(ref(db, `replyYappIds/${parentId}`), orderByValue(), limitToLast(200));
    const unsub = onValue(replyRef, (snap) => {
      setReplyIds(readIndexIds(snap));
    }, () => setReplyIds([]));
    return () => unsub();
  }, [parentId]);

  const { yapps, loading } = useIndexedYapps(replyIds, (a, b) => a.timestamp - b.timestamp);
  return { replies: yapps, loading };
}

/* ─── User yapps hook ─── */

export function useUserYapps(authorId: string | undefined, viewerUid: string | undefined, includePrivate: boolean) {
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  useEffect(() => {
    if (!authorId || !viewerUid) {
      setVisibleIds([]);
      return;
    }

    let publicIds: string[] = [];
    let privateIds: string[] = [];

    const publish = () => {
      setVisibleIds(Array.from(new Set([...publicIds, ...privateIds])));
    };

    const publicRef = query(ref(db, `publicAuthorYappIds/${authorId}`), orderByValue(), limitToLast(200));
    const publicUnsub = onValue(publicRef, (snap) => {
      publicIds = readIndexIds(snap);
      publish();
    }, () => {
      publicIds = [];
      publish();
    });

    let privateUnsub = () => {};
    if (includePrivate || authorId === viewerUid) {
      const privateRef = query(ref(db, `privateAuthorYappIds/${authorId}`), orderByValue(), limitToLast(200));
      privateUnsub = onValue(privateRef, (snap) => {
        privateIds = readIndexIds(snap);
        publish();
      }, () => {
        privateIds = [];
        publish();
      });
    }

    return () => {
      publicUnsub();
      privateUnsub();
    };
  }, [authorId, viewerUid, includePrivate]);

  return useIndexedYapps(visibleIds, (a, b) => b.timestamp - a.timestamp);
}

/* ─── Likes hook ─── */

export function useYappLikes(yappId: string | undefined, uid: string | undefined) {
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    if (!yappId || !uid) return;
    const likeRef = ref(db, `yappLikes/${yappId}/${uid}`);
    const unsub = onValue(likeRef, (snap) => setLiked(snap.exists()));
    return () => unsub();
  }, [yappId, uid]);

  return liked;
}

/* ─── Contacts hook ─── */

export function useContacts(uid: string | undefined) {
  const [contactIds, setContactIds] = useState<string[]>([]);

  useEffect(() => {
    if (!uid) return;
    const contactsRef = ref(db, `contacts/${uid}`);
    const unsub = onValue(contactsRef, (snap) => {
      const ids: string[] = [];
      snap.forEach((child) => { ids.push(child.key!); });
      setContactIds(ids);
    });
    return () => unsub();
  }, [uid]);

  return useMemo(() => new Set(contactIds), [contactIds]);
}

/* ─── Following hook ─── */

export function useFollowing(uid: string | undefined) {
  const [followingIds, setFollowingIds] = useState<string[]>([]);

  useEffect(() => {
    if (!uid) return;
    const followRef = ref(db, `yappFollowing/${uid}`);
    const unsub = onValue(followRef, (snap) => {
      const ids: string[] = [];
      snap.forEach((child) => { ids.push(child.key!); });
      setFollowingIds(ids);
    });
    return () => unsub();
  }, [uid]);

  return useMemo(() => new Set(followingIds), [followingIds]);
}

export function useFollowerCount(uid: string | undefined) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!uid) return;
    const ref_ = ref(db, `yappFollowers/${uid}`);
    const unsub = onValue(ref_, (snap) => setCount(snap.size));
    return () => unsub();
  }, [uid]);

  return count;
}

export function useFollowingCount(uid: string | undefined) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!uid) return;
    const ref_ = ref(db, `yappFollowing/${uid}`);
    const unsub = onValue(ref_, (snap) => setCount(snap.size));
    return () => unsub();
  }, [uid]);

  return count;
}

/* ─── Actions ─── */

export async function postYapp(
  authorId: string,
  authorName: string,
  authorPhotoURL: string | null,
  text: string,
  mediaURL?: string,
  mediaType?: 'image' | 'gif' | 'sticker' | 'voice',
  parentId?: string,
  voiceDuration?: number,
  privacy: 'public' | 'contacts' = 'public',
): Promise<string> {
  if (!authorId || !authorName) throw new Error('Missing author info');
  if (text.length > 5000) throw new Error('Yapp text exceeds maximum length');
  if (authorName.length > 30) throw new Error('Author name exceeds maximum length');
  const yappsRef = ref(db, 'yapps');
  const newRef = push(yappsRef);
  const yapp: Omit<Yapp, 'id'> = {
    authorId,
    authorName,
    authorPhotoURL,
    text,
    privacy,
    timestamp: Date.now(),
    likeCount: 0,
    replyCount: 0,
    reyappCount: 0,
    ...(mediaURL && { mediaURL }),
    ...(mediaType && { mediaType }),
    ...(voiceDuration != null && { voiceDuration }),
  };
  if (parentId) {
    yapp.parentId = parentId;
    // Increment reply count on parent
    const parentRef = ref(db, `yapps/${parentId}/replyCount`);
    await runTransaction(parentRef, (current) => (current || 0) + 1);
  }
  const yappId = newRef.key!;
  await set(newRef, { ...yapp, id: yappId });

  const indexUpdates: Record<string, number> = {};
  if (parentId) {
    indexUpdates[`replyYappIds/${parentId}/${yappId}`] = yapp.timestamp;
  } else if (privacy === 'contacts') {
    indexUpdates[`privateAuthorYappIds/${authorId}/${yappId}`] = yapp.timestamp;
  } else {
    indexUpdates[`publicYappIds/${yappId}`] = yapp.timestamp;
    indexUpdates[`publicAuthorYappIds/${authorId}/${yappId}`] = yapp.timestamp;
  }

  await update(ref(db), indexUpdates);
  return yappId;
}

export async function deleteYapp(yappId: string, parentId?: string): Promise<void> {
  const snap = await get(ref(db, `yapps/${yappId}`));
  const yapp = snap.exists() ? snap.val() as Yapp : null;
  const updates: Record<string, null> = {
    [`yapps/${yappId}`]: null,
    [`yappLikes/${yappId}`]: null,
  };

  if (yapp?.parentId) {
    updates[`replyYappIds/${yapp.parentId}/${yappId}`] = null;
  } else if ((yapp?.privacy ?? 'public') === 'contacts' && yapp?.authorId) {
    updates[`privateAuthorYappIds/${yapp.authorId}/${yappId}`] = null;
  } else if (yapp?.authorId) {
    updates[`publicYappIds/${yappId}`] = null;
    updates[`publicAuthorYappIds/${yapp.authorId}/${yappId}`] = null;
  }

  await update(ref(db), updates);
  if (parentId) {
    const parentRef = ref(db, `yapps/${parentId}/replyCount`);
    await runTransaction(parentRef, (current) => Math.max((current || 1) - 1, 0));
  }
}

/** Edit a yapp's text (only the author can edit). */
export async function editYapp(yappId: string, newText: string): Promise<void> {
  await update(ref(db, `yapps/${yappId}`), {
    text: newText,
    edited: true,
    editedAt: Date.now(),
  });
}

export async function toggleLike(yappId: string, uid: string): Promise<void> {
  const likeRef = ref(db, `yappLikes/${yappId}/${uid}`);
  const countRef = ref(db, `yapps/${yappId}/likeCount`);
  // Use transaction on the like ref to avoid TOCTOU race from rapid taps
  const result = await runTransaction(likeRef, (current) => {
    return current ? null : true;
  });
  if (result.committed) {
    // result.snapshot reflects the NEW state after the transaction
    const isNowLiked = result.snapshot.exists();
    if (isNowLiked) {
      await runTransaction(countRef, (current) => (current || 0) + 1);
    } else {
      await runTransaction(countRef, (current) => Math.max((current || 1) - 1, 0));
    }
  }
}

export async function reyapp(
  yapp: Yapp,
  uid: string,
  displayName: string,
  photoURL: string | null,
): Promise<string> {
  // Cannot reyapp contacts-only yapps (would leak to unintended audiences)
  if ((yapp.privacy ?? 'public') === 'contacts') {
    throw new Error('Cannot reyapp contacts-only yapps');
  }
  const id = await postYapp(uid, displayName, photoURL, yapp.text, yapp.mediaURL, yapp.mediaType, undefined, undefined, 'public');
  // Mark the new yapp as a reyapp
  await update(ref(db, `yapps/${id}`), {
    reyappOf: yapp.id,
    reyappByUid: uid,
    reyappByName: displayName,
  });
  // Increment reyapp count on original
  const countRef = ref(db, `yapps/${yapp.id}/reyappCount`);
  await runTransaction(countRef, (current) => (current || 0) + 1);
  return id;
}

export async function followUser(uid: string, targetUid: string): Promise<boolean> {
  const blocked = await isBlocked(uid, targetUid);
  if (blocked) return false;
  await update(ref(db), {
    [`yappFollowing/${uid}/${targetUid}`]: true,
    [`yappFollowers/${targetUid}/${uid}`]: true,
  });
  return true;
}

export async function unfollowUser(uid: string, targetUid: string): Promise<void> {
  await update(ref(db), {
    [`yappFollowing/${uid}/${targetUid}`]: null,
    [`yappFollowers/${targetUid}/${uid}`]: null,
  });
}
