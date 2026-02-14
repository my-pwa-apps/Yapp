import { useEffect, useState } from 'react';
import {
  ref,
  onValue,
  set,
  remove,
  get,
} from 'firebase/database';
import { db } from '../firebase';
import type { ContactRequest, UserProfile } from '../types';
import { sendPushToUsers } from '../utils/sendPushNotification';
import { findOrCreateDirectChat } from './useChats';

/**
 * Hook that listens for incoming contact requests for the current user.
 */
export function useContactRequests(uid: string | undefined) {
  const [requests, setRequests] = useState<ContactRequest[]>([]);

  useEffect(() => {
    if (!uid) return;
    const reqRef = ref(db, `contactRequests/${uid}`);
    const unsub = onValue(reqRef, (snap) => {
      const data: ContactRequest[] = [];
      snap.forEach((child) => {
        const val = child.val();
        if (val.status === 'pending') {
          data.push({ ...val, id: child.key! });
        }
      });
      data.sort((a, b) => b.timestamp - a.timestamp);
      setRequests(data);
    }, () => setRequests([]));
    return () => unsub();
  }, [uid]);

  return requests;
}

/**
 * Send a contact request to another user.
 * Returns 'sent' if new request, 'already_sent' if pending, 'already_contacts' if chat exists.
 */
export async function sendContactRequest(
  currentUser: UserProfile,
  targetUser: UserProfile
): Promise<'sent' | 'already_sent' | 'already_contacts'> {
  // Check if already contacts
  const contactSnap = await get(ref(db, `contacts/${currentUser.uid}/${targetUser.uid}`));
  if (contactSnap.exists()) return 'already_contacts';

  // Check if request already sent
  const existingSnap = await get(ref(db, `contactRequests/${targetUser.uid}/${currentUser.uid}`));
  if (existingSnap.exists()) {
    const existing = existingSnap.val();
    if (existing.status === 'pending') return 'already_sent';
  }

  // Check if the other person already sent us a request — auto-accept
  const reverseSnap = await get(ref(db, `contactRequests/${currentUser.uid}/${targetUser.uid}`));
  if (reverseSnap.exists() && reverseSnap.val().status === 'pending') {
    await acceptContactRequest(currentUser, reverseSnap.val());
    return 'already_contacts';
  }

  // Send the request
  const request: Omit<ContactRequest, 'id'> = {
    from: currentUser.uid,
    fromName: currentUser.displayName,
    fromEmail: currentUser.email,
    to: targetUser.uid,
    timestamp: Date.now(),
    status: 'pending',
  };
  await set(ref(db, `contactRequests/${targetUser.uid}/${currentUser.uid}`), request);

  // Send push notification to the target user
  sendPushToUsers([targetUser.uid], {
    title: 'New Contact Request',
    body: `${currentUser.displayName} wants to connect with you`,
    data: { type: 'contact_request', tag: 'contact-request' },
  }).catch(() => {});

  return 'sent';
}

/**
 * Accept a contact request: add both as contacts and create a chat.
 */
export async function acceptContactRequest(
  currentUser: UserProfile,
  request: ContactRequest
): Promise<string> {
  // Add each other as contacts
  await set(ref(db, `contacts/${currentUser.uid}/${request.from}`), true);
  await set(ref(db, `contacts/${request.from}/${currentUser.uid}`), true);

  // Create or find the direct chat
  const chatId = await findOrCreateDirectChat(currentUser, request.from);

  // Remove the request
  await remove(ref(db, `contactRequests/${currentUser.uid}/${request.from}`));

  return chatId;
}

/**
 * Reject a contact request.
 */
export async function rejectContactRequest(
  currentUid: string,
  senderUid: string
) {
  await remove(ref(db, `contactRequests/${currentUid}/${senderUid}`));
}
