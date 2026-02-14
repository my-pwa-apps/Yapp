import { useEffect, useState } from 'react';
import {
  ref,
  onValue,
  get,
  set,
  push,
  update,
  remove,
  query,
  orderByChild,
  equalTo,
} from 'firebase/database';
import { db } from '../firebase';
import type { Chat, UserProfile } from '../types';
import {
  generateGroupKey,
  wrapGroupKeyForMember,
  importPublicKey,
} from './useCrypto';
import { sendPushToUsers } from '../utils/sendPushNotification';

/** Helper: convert members record {uid: true} to array */
export function membersToArray(members: Record<string, boolean> | undefined): string[] {
  return members ? Object.keys(members) : [];
}

/** Helper: check if a user is an admin of a chat */
export function isGroupAdmin(chat: Chat, uid: string): boolean {
  return !!(chat.admins && chat.admins[uid]);
}

/** Post a system message to a chat */
async function sendSystemMessage(chatId: string, text: string) {
  const msgRef = push(ref(db, `messages/${chatId}`));
  await set(msgRef, {
    chatId,
    senderId: 'system',
    senderName: 'System',
    text,
    timestamp: Date.now(),
    readBy: {},
    type: 'system',
  });
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
  memberUids: string[],
  cryptoKeys?: { privateKey: CryptoKey; publicKey: CryptoKey }
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

  // E2EE: distribute group key to all members
  if (cryptoKeys) {
    try {
      const groupKey = await generateGroupKey();
      const allUids = [currentUser.uid, ...memberUids];
      const wrappedKeys: Record<string, { wrappedKey: string; iv: string; wrappedBy: string }> = {};
      for (const uid of allUids) {
        const pubSnap = await get(ref(db, `users/${uid}/publicKey`));
        if (!pubSnap.exists()) continue;
        const memberPub = await importPublicKey(pubSnap.val());
        const { wrappedKey, iv } = await wrapGroupKeyForMember(
          groupKey, cryptoKeys.privateKey, memberPub, chatId
        );
        wrappedKeys[uid] = { wrappedKey, iv, wrappedBy: currentUser.uid };
      }
      if (Object.keys(wrappedKeys).length > 0) {
        await set(ref(db, `chats/${chatId}/encryptedGroupKey`), wrappedKeys);
      }
    } catch (e) {
      console.error('[E2EE] Failed to distribute group key:', e);
    }
  }

  await sendSystemMessage(chatId, `${currentUser.displayName} created the group "${name}"`);

  return chatId;
}

/** Add member to group (direct add, no approval) — currently unused but kept for future admin panel */
export async function addGroupMember(chatId: string, uid: string, addedByName: string) {
  await update(ref(db, `chats/${chatId}/members`), { [uid]: true });
  await sendSystemMessage(chatId, `${addedByName} added a new member`);
}

/** Remove member from group (admin action) */
export async function removeGroupMember(chatId: string, uid: string, removedByName: string, memberName: string) {
  const updates: Record<string, null> = {};
  updates[`chats/${chatId}/members/${uid}`] = null;
  updates[`chats/${chatId}/admins/${uid}`] = null;
  await update(ref(db), updates);
  await sendSystemMessage(chatId, `${removedByName} removed ${memberName}`);
}

/** Leave group (self-removal) */
export async function leaveGroup(chatId: string, uid: string, memberName: string) {
  // Send system message BEFORE removing member (write rule requires membership)
  await sendSystemMessage(chatId, `${memberName} left the group`);
  const updates: Record<string, null> = {};
  updates[`chats/${chatId}/members/${uid}`] = null;
  updates[`chats/${chatId}/admins/${uid}`] = null;
  await update(ref(db), updates);
}

/** Admin invites a user to the group — needs user's approval */
export async function inviteToGroup(chatId: string, targetUid: string, adminUid: string, adminName: string) {
  await update(ref(db, `chats/${chatId}/pendingMembers/${targetUid}`), {
    type: 'invite',
    fromUid: adminUid,
    fromName: adminName,
    timestamp: Date.now(),
  });

  // Send push notification to invited user
  const chatSnap = await get(ref(db, `chats/${chatId}/name`));
  const groupName = chatSnap.exists() ? chatSnap.val() : 'a group';
  sendPushToUsers([targetUid], {
    title: 'Group Invite',
    body: `${adminName} invited you to ${groupName}`,
    data: { type: 'group_invite', chatId, tag: `invite-${chatId}` },
  }).catch(() => {});
}

/** User requests to join a group — needs admin approval */
export async function requestToJoinGroup(chatId: string, uid: string, userName: string) {
  await update(ref(db, `chats/${chatId}/pendingMembers/${uid}`), {
    type: 'request',
    fromUid: uid,
    fromName: userName,
    timestamp: Date.now(),
  });

  // Send push notification to group admins
  const adminsSnap = await get(ref(db, `chats/${chatId}/admins`));
  if (adminsSnap.exists()) {
    const adminUids = Object.keys(adminsSnap.val());
    const chatSnap = await get(ref(db, `chats/${chatId}/name`));
    const groupName = chatSnap.exists() ? chatSnap.val() : 'your group';
    sendPushToUsers(adminUids, {
      title: 'Join Request',
      body: `${userName} wants to join ${groupName}`,
      data: { type: 'join_request', chatId, tag: `join-${chatId}` },
    }).catch(() => {});
  }
}

/** Approve a pending member (admin approves a join request, or user accepts an invite) */
export async function approvePendingMember(chatId: string, uid: string, approverName: string, memberName: string) {
  // Write members and pendingMembers separately so security rules at each path are evaluated correctly
  await set(ref(db, `chats/${chatId}/members/${uid}`), true);
  await set(ref(db, `chats/${chatId}/pendingMembers/${uid}`), null);
  await sendSystemMessage(chatId, `${memberName} joined the group`);
}

/** Reject/decline a pending member */
export async function rejectPendingMember(chatId: string, uid: string) {
  await set(ref(db, `chats/${chatId}/pendingMembers/${uid}`), null);
}

/** Search users by email (uses indexed query) */
export async function searchUsers(emailQuery: string, currentUid: string): Promise<UserProfile[]> {
  const usersRef = query(ref(db, 'users'), orderByChild('email'), equalTo(emailQuery));
  const snap = await get(usersRef);
  const results: UserProfile[] = [];
  snap.forEach((child) => {
    const val = child.val() as UserProfile;
    if (val.uid !== currentUid) {
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

/** Clear all messages in a chat (reset) */
export async function clearChatMessages(chatId: string) {
  await remove(ref(db, `messages/${chatId}`));
  // Remove lastMessage from chat
  await update(ref(db, `chats/${chatId}`), { lastMessage: null });
}

/** Delete a chat — removes user from members; for direct chats also removes contacts */
export async function deleteChat(chatId: string, currentUid: string) {
  const chatSnap = await get(ref(db, `chats/${chatId}`));
  if (!chatSnap.exists()) return;
  const chat = chatSnap.val();

  if (chat.type === 'direct') {
    const memberKeys = Object.keys(chat.members || {});
    const otherUid = memberKeys.find((m: string) => m !== currentUid);

    // Remove the contact relationship both ways
    if (otherUid && otherUid !== currentUid) {
      await remove(ref(db, `contacts/${currentUid}/${otherUid}`));
      await remove(ref(db, `contacts/${otherUid}/${currentUid}`));
    }

    // Delete messages first (write rule requires chat membership), then chat
    await remove(ref(db, `messages/${chatId}`));
    await remove(ref(db, `chats/${chatId}`));
  } else {
    // Group chat: send system message first (write rule requires membership), then leave
    await sendSystemMessage(chatId, 'A member left the group');
    await remove(ref(db, `chats/${chatId}/members/${currentUid}`));
  }
}
