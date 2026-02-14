import { useEffect, useState, useCallback } from 'react';
import {
  ref,
  onValue,
  push,
  set,
  get,
  remove,
  update,
  query,
  orderByChild,
  equalTo,
  limitToLast,
  runTransaction,
} from 'firebase/database';
import { db } from '../firebase';
import type { Yapp } from '../types';

/* ─── Feed hook ─── */

export function useYapps(uid: string | undefined) {
  const [yapps, setYapps] = useState<Yapp[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    const yappsRef = query(ref(db, 'yapps'), orderByChild('timestamp'), limitToLast(200));
    const unsub = onValue(
      yappsRef,
      (snap) => {
        const list: Yapp[] = [];
        snap.forEach((child) => {
          const val = child.val();
          // Only include top-level yapps in the feed (no replies)
          if (!val.parentId) {
            list.push({ ...val, id: child.key! });
          }
        });
        // Newest first
        list.sort((a, b) => b.timestamp - a.timestamp);
        setYapps(list);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [uid]);

  return { yapps, loading };
}

/* ─── Replies hook ─── */

export function useReplies(parentId: string | undefined) {
  const [replies, setReplies] = useState<Yapp[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!parentId) { setLoading(false); return; }
    const q = query(ref(db, 'yapps'), orderByChild('parentId'), equalTo(parentId));
    const unsub = onValue(
      q,
      (snap) => {
        const list: Yapp[] = [];
        snap.forEach((child) => {
          list.push({ ...child.val(), id: child.key! });
        });
        list.sort((a, b) => a.timestamp - b.timestamp);
        setReplies(list);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [parentId]);

  return { replies, loading };
}

/* ─── User yapps hook ─── */

export function useUserYapps(authorId: string | undefined) {
  const [yapps, setYapps] = useState<Yapp[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authorId) { setLoading(false); return; }
    const q = query(ref(db, 'yapps'), orderByChild('authorId'), equalTo(authorId));
    const unsub = onValue(
      q,
      (snap) => {
        const list: Yapp[] = [];
        snap.forEach((child) => {
          const val = child.val();
          if (!val.parentId) list.push({ ...val, id: child.key! });
        });
        list.sort((a, b) => b.timestamp - a.timestamp);
        setYapps(list);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [authorId]);

  return { yapps, loading };
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

/* ─── Following hook ─── */

export function useFollowing(uid: string | undefined) {
  const [following, setFollowing] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!uid) return;
    const followRef = ref(db, `yappFollowing/${uid}`);
    const unsub = onValue(followRef, (snap) => {
      const ids = new Set<string>();
      snap.forEach((child) => { ids.add(child.key!); });
      setFollowing(ids);
    });
    return () => unsub();
  }, [uid]);

  return following;
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

/* ─── Actions ─── */

export async function postYapp(
  authorId: string,
  authorName: string,
  authorPhotoURL: string | null,
  text: string,
  mediaURL?: string,
  mediaType?: 'image' | 'gif',
  parentId?: string,
): Promise<string> {
  const yappsRef = ref(db, 'yapps');
  const newRef = push(yappsRef);
  const yapp: Omit<Yapp, 'id'> = {
    authorId,
    authorName,
    authorPhotoURL,
    text,
    timestamp: Date.now(),
    likeCount: 0,
    replyCount: 0,
    reyappCount: 0,
  };
  if (mediaURL) (yapp as any).mediaURL = mediaURL;
  if (mediaType) (yapp as any).mediaType = mediaType;
  if (parentId) {
    (yapp as any).parentId = parentId;
    // Increment reply count on parent
    const parentRef = ref(db, `yapps/${parentId}/replyCount`);
    runTransaction(parentRef, (current) => (current || 0) + 1);
  }
  await set(newRef, { ...yapp, id: newRef.key! });
  return newRef.key!;
}

export async function deleteYapp(yappId: string, parentId?: string): Promise<void> {
  await remove(ref(db, `yapps/${yappId}`));
  await remove(ref(db, `yappLikes/${yappId}`));
  if (parentId) {
    const parentRef = ref(db, `yapps/${parentId}/replyCount`);
    runTransaction(parentRef, (current) => Math.max((current || 1) - 1, 0));
  }
}

export async function toggleLike(yappId: string, uid: string): Promise<void> {
  const likeRef = ref(db, `yappLikes/${yappId}/${uid}`);
  const snap = await get(likeRef);
  const countRef = ref(db, `yapps/${yappId}/likeCount`);
  if (snap.exists()) {
    await remove(likeRef);
    runTransaction(countRef, (current) => Math.max((current || 1) - 1, 0));
  } else {
    await set(likeRef, true);
    runTransaction(countRef, (current) => (current || 0) + 1);
  }
}

export async function reyapp(
  yapp: Yapp,
  uid: string,
  displayName: string,
  photoURL: string | null,
): Promise<string> {
  const id = await postYapp(uid, displayName, photoURL, yapp.text, yapp.mediaURL, yapp.mediaType);
  // Mark the new yapp as a reyapp
  await update(ref(db, `yapps/${id}`), {
    reyappOf: yapp.id,
    reyappByUid: uid,
    reyappByName: displayName,
  });
  // Increment reyapp count on original
  const countRef = ref(db, `yapps/${yapp.id}/reyappCount`);
  runTransaction(countRef, (current) => (current || 0) + 1);
  return id;
}

export async function followUser(uid: string, targetUid: string): Promise<void> {
  await set(ref(db, `yappFollowing/${uid}/${targetUid}`), true);
  await set(ref(db, `yappFollowers/${targetUid}/${uid}`), true);
}

export async function unfollowUser(uid: string, targetUid: string): Promise<void> {
  await remove(ref(db, `yappFollowing/${uid}/${targetUid}`));
  await remove(ref(db, `yappFollowers/${targetUid}/${uid}`));
}
