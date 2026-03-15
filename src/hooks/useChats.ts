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
import { isBlocked } from './useBlockedUsers';
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
    const indexRef = ref(db, `userChats/${uid}`);
    const chatListeners = new Map<string, () => void>();
    const chatData = new Map<string, Chat>();
    let initialLoad = true;

    const updateChats = () => {
      const sorted = Array.from(chatData.values()).sort((a, b) => {
        const ta = a.lastMessage?.timestamp ?? a.createdAt ?? 0;
        const tb = b.lastMessage?.timestamp ?? b.createdAt ?? 0;
        return tb - ta;
      });
      setChats(sorted);
      if (initialLoad) {
        setLoading(false);
        initialLoad = false;
      }
    };

    const indexUnsub = onValue(indexRef, (snap) => {
      const currentIds = new Set<string>();
      snap.forEach((child) => { currentIds.add(child.key!); });

      // Remove listeners for chats no longer in index
      for (const [chatId, unsub] of chatListeners) {
        if (!currentIds.has(chatId)) {
          unsub();
          chatListeners.delete(chatId);
          chatData.delete(chatId);
        }
      }

      // Add listeners for new chats
      for (const chatId of currentIds) {
        if (!chatListeners.has(chatId)) {
          const chatRef = ref(db, `chats/${chatId}`);
          const chatUnsub = onValue(chatRef, (chatSnap) => {
            if (chatSnap.exists()) {
              chatData.set(chatId, { ...chatSnap.val(), id: chatId });
            } else {
              chatData.delete(chatId);
            }
            updateChats();
          });
          chatListeners.set(chatId, chatUnsub);
        }
      }

      // If no chats, finish loading
      if (currentIds.size === 0) {
        updateChats();
      }
    }, () => {
      setLoading(false);
    });

    return () => {
      indexUnsub();
      chatListeners.forEach((unsub) => unsub());
    };
  }, [uid]);

  return { chats, loading };
}

/** Find or create a 1-to-1 chat (including self-chat) */
export async function findOrCreateDirectChat(
  currentUser: UserProfile,
  otherUid: string
): Promise<string> {
  const isSelfChat = otherUid === currentUser.uid;

  // Search existing direct chats via the user's chat index
  const indexSnap = await get(ref(db, `userChats/${currentUser.uid}`));
  if (indexSnap.exists()) {
    const chatIds = Object.keys(indexSnap.val());
    // Read all user's chats in parallel to find existing direct chat
    const chatSnaps = await Promise.all(
      chatIds.map((id) => get(ref(db, `chats/${id}`)).then((s) => ({ id, snap: s })))
    );
    for (const { id, snap } of chatSnaps) {
      if (!snap.exists()) continue;
      const val = snap.val();
      if (val.type !== 'direct') continue;
      const memberKeys = Object.keys(val.members || {});
      if (isSelfChat) {
        if (memberKeys.length === 1 && val.members?.[currentUser.uid]) return id;
      } else {
        if (val.members?.[currentUser.uid] && val.members?.[otherUid] && memberKeys.length === 2) return id;
      }
    }
  }

  // Create new direct chat
  const chatsRef = ref(db, 'chats');
  const newChatRef = push(chatsRef);
  const chatId = newChatRef.key!;
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

  // Update userChats index for all members
  const indexUpdates: Record<string, true> = {};
  indexUpdates[`userChats/${currentUser.uid}/${chatId}`] = true;
  if (!isSelfChat) {
    indexUpdates[`userChats/${otherUid}/${chatId}`] = true;
  }
  await update(ref(db), indexUpdates);

  return chatId;
}

/** Create a group chat */
export async function createGroupChat(
  currentUser: UserProfile,
  name: string,
  memberUids: string[],
  cryptoKeys?: { privateKey: CryptoKey; publicKey: CryptoKey }
): Promise<string> {
  if (!name || name.length > 50) throw new Error('Group name must be 1-50 characters');
  if (memberUids.length === 0) throw new Error('Group must have at least one other member');
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

  // Update userChats index for all members
  const indexUpdates: Record<string, true> = {};
  for (const uid of [currentUser.uid, ...memberUids]) {
    indexUpdates[`userChats/${uid}/${chatId}`] = true;
  }
  await update(ref(db), indexUpdates);

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
  await set(ref(db, `userChats/${uid}/${chatId}`), true);
  await sendSystemMessage(chatId, `${addedByName} added a new member`);
}

/** Remove member from group (admin action) */
export async function removeGroupMember(chatId: string, uid: string, removedByName: string, memberName: string) {
  const updates: Record<string, null> = {};
  updates[`userChats/${uid}/${chatId}`] = null;
  updates[`userPendingInvites/${uid}/${chatId}`] = null;
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
  updates[`userChats/${uid}/${chatId}`] = null;
  updates[`userPendingInvites/${uid}/${chatId}`] = null;
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

  // Add to userPendingInvites index so the invited user can discover this invite
  await set(ref(db, `userPendingInvites/${targetUid}/${chatId}`), true);

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
export async function approvePendingMember(chatId: string, uid: string, _approverName: string, memberName: string) {
  const updates: Record<string, true | null> = {
    [`chats/${chatId}/members/${uid}`]: true,
    [`chats/${chatId}/pendingMembers/${uid}`]: null,
    [`userChats/${uid}/${chatId}`]: true,
    [`userPendingInvites/${uid}/${chatId}`]: null,
  };
  await update(ref(db), updates);
  await sendSystemMessage(chatId, `${memberName} joined the group`);
}

/** Reject/decline a pending member */
export async function rejectPendingMember(chatId: string, uid: string) {
  await set(ref(db, `chats/${chatId}/pendingMembers/${uid}`), null);
  await remove(ref(db, `userPendingInvites/${uid}/${chatId}`));
}

/** Search users by email (uses indexed query) */
export async function searchUsers(emailQuery: string, currentUid: string): Promise<UserProfile[]> {
  const usersRef = query(ref(db, 'users'), orderByChild('email'), equalTo(emailQuery));
  const snap = await get(usersRef);
  const results: UserProfile[] = [];
  const candidates: UserProfile[] = [];
  snap.forEach((child) => {
    const val = child.val() as UserProfile;
    if (val.uid !== currentUid) {
      candidates.push(val);
    }
  });

  const allowed = await Promise.all(
    candidates.map(async (candidate) => ({
      candidate,
      blocked: await isBlocked(currentUid, candidate.uid),
    }))
  );

  for (const { candidate, blocked } of allowed) {
    if (!blocked) {
      results.push(candidate);
    }
  }

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

    const cleanupUpdates: Record<string, null> = {
      [`userChats/${currentUid}/${chatId}`]: null,
    };

    // Remove the contact relationship both ways
    if (otherUid && otherUid !== currentUid) {
      cleanupUpdates[`contacts/${currentUid}/${otherUid}`] = null;
      cleanupUpdates[`contacts/${otherUid}/${currentUid}`] = null;
      cleanupUpdates[`userChats/${otherUid}/${chatId}`] = null;
    }

    // Remove relationship/index entries before deleting the chat (membership required for those writes)
    await update(ref(db), cleanupUpdates);

    // Delete messages first (write rule requires chat membership), then chat
    await remove(ref(db, `messages/${chatId}`));
    await remove(ref(db, `chats/${chatId}`));
  } else {
    // Group chat: send system message first (write rule requires membership), then leave
    await sendSystemMessage(chatId, 'A member left the group');
    await update(ref(db), {
      [`userChats/${currentUid}/${chatId}`]: null,
      [`userPendingInvites/${currentUid}/${chatId}`]: null,
      [`chats/${chatId}/members/${currentUid}`]: null,
    });
  }
}
