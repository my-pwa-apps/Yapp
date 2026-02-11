import { useEffect, useState } from 'react';
import {
  ref,
  onValue,
  get,
  set,
  push,
  update,
  query,
  orderByChild,
  serverTimestamp,
} from 'firebase/database';
import { db } from '../firebase';
import type { Chat, UserProfile } from '../types';

/** Helper: convert members record {uid: true} to array */
export function membersToArray(members: Record<string, boolean> | undefined): string[] {
  return members ? Object.keys(members) : [];
}

export function useChats(uid: string | undefined) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;
    const chatsRef = ref(db, 'chats');
    const unsub = onValue(chatsRef, (snap) => {
      const data: Chat[] = [];
      snap.forEach((child) => {
        const val = child.val();
        // Only include chats where user is a member
        if (val.members && val.members[uid]) {
          data.push({ ...val, id: child.key! });
        }
      });
      // Sort by lastMessage timestamp descending
      data.sort((a, b) => {
        const ta = a.lastMessage?.timestamp ?? a.createdAt ?? 0;
        const tb = b.lastMessage?.timestamp ?? b.createdAt ?? 0;
        return tb - ta;
      });
      setChats(data);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [uid]);

  return { chats, loading };
}

/** Find or create a 1-to-1 chat (including self-chat) */
export async function findOrCreateDirectChat(
  currentUser: UserProfile,
  otherUid: string
): Promise<string> {
  const chatsRef = ref(db, 'chats');
  const snap = await get(chatsRef);
  const isSelfChat = otherUid === currentUser.uid;

  // Search existing direct chats
  if (snap.exists()) {
    let existingId: string | null = null;
    snap.forEach((child) => {
      const val = child.val();
      if (val.type !== 'direct') return;
      const memberKeys = Object.keys(val.members || {});
      if (isSelfChat) {
        // Self-chat: only 1 member key, which is the current user
        if (memberKeys.length === 1 && val.members?.[currentUser.uid]) {
          existingId = child.key!;
        }
      } else {
        if (
          val.members?.[currentUser.uid] &&
          val.members?.[otherUid] &&
          memberKeys.length === 2
        ) {
          existingId = child.key!;
        }
      }
    });
    if (existingId) return existingId;
  }

  // Create new direct chat
  const newChatRef = push(chatsRef);
  const members = isSelfChat
    ? { [currentUser.uid]: true }
    : { [currentUser.uid]: true, [otherUid]: true };
  const newChat = {
    type: 'direct',
    members,
    createdBy: currentUser.uid,
    createdAt: Date.now(),
  };
  await set(newChatRef, newChat);
  return newChatRef.key!;
}

/** Create a group chat */
export async function createGroupChat(
  currentUser: UserProfile,
  name: string,
  memberUids: string[]
): Promise<string> {
  const allMembers: Record<string, boolean> = { [currentUser.uid]: true };
  memberUids.forEach((uid) => { allMembers[uid] = true; });

  const newChatRef = push(ref(db, 'chats'));
  const chatId = newChatRef.key!;

  const newChat = {
    type: 'group',
    name,
    members: allMembers,
    admins: { [currentUser.uid]: true },
    createdBy: currentUser.uid,
    createdAt: Date.now(),
  };
  await set(newChatRef, newChat);

  // Send system message
  const msgRef = push(ref(db, `messages/${chatId}`));
  await set(msgRef, {
    chatId,
    senderId: 'system',
    senderName: 'System',
    text: `${currentUser.displayName} created the group "${name}"`,
    timestamp: Date.now(),
    readBy: {},
    type: 'system',
  });

  return chatId;
}

/** Add member to group */
export async function addGroupMember(chatId: string, uid: string, addedByName: string) {
  await update(ref(db, `chats/${chatId}/members`), { [uid]: true });

  const msgRef = push(ref(db, `messages/${chatId}`));
  await set(msgRef, {
    chatId,
    senderId: 'system',
    senderName: 'System',
    text: `${addedByName} added a new member`,
    timestamp: Date.now(),
    readBy: {},
    type: 'system',
  });
}

/** Search users by email */
export async function searchUsers(emailQuery: string, currentUid: string): Promise<UserProfile[]> {
  const usersRef = query(ref(db, 'users'), orderByChild('email'));
  const snap = await get(usersRef);
  const results: UserProfile[] = [];
  snap.forEach((child) => {
    const val = child.val() as UserProfile;
    if (val.email === emailQuery && val.uid !== currentUid) {
      results.push(val);
    }
  });
  return results;
}

/** Get user profile by uid */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await get(ref(db, `users/${uid}`));
  return snap.exists() ? (snap.val() as UserProfile) : null;
}
