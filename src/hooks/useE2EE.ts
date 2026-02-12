import { useCallback, useEffect, useRef, useState } from 'react';
import { ref, get, set } from 'firebase/database';
import { db } from '../firebase';
import {
  deriveDirectChatKey,
  unwrapGroupKeyForMember,
  importPublicKey,
  encrypt as e2eeEncrypt,
  decrypt as e2eeDecrypt,
  getCachedChatKey,
  setCachedChatKey,
  generateGroupKey,
  wrapGroupKeyForMember,
} from './useCrypto';
import type { Chat, Message } from '../types';

export interface CryptoKeys {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}

/**
 * Resolve the AES-GCM key for a chat (cached after first derivation).
 */
export async function resolveChatKey(
  chat: Chat,
  currentUid: string,
  privateKey: CryptoKey
): Promise<CryptoKey | null> {
  const cached = getCachedChatKey(chat.id);
  if (cached) return cached;

  try {
    if (chat.type === 'direct') {
      const otherUid =
        Object.keys(chat.members).find((m) => m !== currentUid) || currentUid;
      const snap = await get(ref(db, `users/${otherUid}/publicKey`));
      if (!snap.exists()) return null; // other user hasn't set up E2EE
      const otherPub = await importPublicKey(snap.val());
      const key = await deriveDirectChatKey(privateKey, otherPub, chat.id);
      setCachedChatKey(chat.id, key);
      return key;
    } else {
      // Group chat — unwrap the group key
      const wrapSnap = await get(
        ref(db, `chats/${chat.id}/encryptedGroupKey/${currentUid}`)
      );
      if (!wrapSnap.exists()) return null;
      const { wrappedKey, iv, wrappedBy } = wrapSnap.val();
      const wrapperPubSnap = await get(
        ref(db, `users/${wrappedBy}/publicKey`)
      );
      if (!wrapperPubSnap.exists()) return null;
      const wrapperPub = await importPublicKey(wrapperPubSnap.val());
      const key = await unwrapGroupKeyForMember(
        wrappedKey,
        iv,
        privateKey,
        wrapperPub,
        chat.id
      );
      setCachedChatKey(chat.id, key);
      return key;
    }
  } catch (e) {
    console.warn('[E2EE] Failed to resolve chat key:', e);
    return null;
  }
}

/**
 * Enable E2EE for an existing group chat by generating and distributing a group key.
 */
export async function enableGroupEncryption(
  chatId: string,
  memberUids: string[],
  cryptoKeys: CryptoKeys
): Promise<boolean> {
  try {
    const groupKey = await generateGroupKey();
    const wrappedKeys: Record<string, { wrappedKey: string; iv: string; wrappedBy: string }> = {};
    const currentUid = memberUids[0]; // caller is first
    for (const uid of memberUids) {
      const pubSnap = await get(ref(db, `users/${uid}/publicKey`));
      if (!pubSnap.exists()) continue;
      const memberPub = await importPublicKey(pubSnap.val());
      const { wrappedKey, iv } = await wrapGroupKeyForMember(
        groupKey, cryptoKeys.privateKey, memberPub, chatId
      );
      wrappedKeys[uid] = { wrappedKey, iv, wrappedBy: currentUid };
    }
    if (Object.keys(wrappedKeys).length === 0) return false;
    await set(ref(db, `chats/${chatId}/encryptedGroupKey`), wrappedKeys);
    setCachedChatKey(chatId, groupKey);
    return true;
  } catch (e) {
    console.error('[E2EE] Failed to enable group encryption:', e);
    return false;
  }
}

/**
 * React hook: provides encrypt/decrypt functions for the active chat.
 */
export function useChatEncryption(
  chat: Chat | null,
  currentUid: string,
  keys: CryptoKeys | null
) {
  const [chatKey, setChatKey] = useState<CryptoKey | null>(null);
  const resolvingRef = useRef<string | null>(null);

  useEffect(() => {
    if (!chat || !keys) {
      setChatKey(null);
      return;
    }
    const cached = getCachedChatKey(chat.id);
    if (cached) {
      setChatKey(cached);
      return;
    }
    if (resolvingRef.current === chat.id) return;
    resolvingRef.current = chat.id;
    resolveChatKey(chat, currentUid, keys.privateKey)
      .then((key) => {
        setChatKey(key);
        resolvingRef.current = null;
      })
      .catch(() => {
        resolvingRef.current = null;
      });
  }, [chat?.id, currentUid, keys]);

  /** Encrypt plaintext for the current chat. Returns null if E2EE is not available. */
  const encryptMessage = useCallback(
    async (
      text: string
    ): Promise<{ ciphertext: string; iv: string } | null> => {
      if (!chatKey) return null;
      try {
        return await e2eeEncrypt(text, chatKey);
      } catch {
        return null;
      }
    },
    [chatKey]
  );

  /** Decrypt a Message, returning the plaintext. Falls back gracefully. */
  const decryptMessage = useCallback(
    async (msg: Message): Promise<string> => {
      if (!msg.encrypted || !msg.ciphertext || !msg.iv) return msg.text;
      if (!chatKey) return '🔒 Encrypted message';
      try {
        return await e2eeDecrypt(msg.ciphertext, msg.iv, chatKey);
      } catch {
        return '🔒 Decryption failed';
      }
    },
    [chatKey]
  );

  return {
    chatKey,
    encryptMessage,
    decryptMessage,
    /** True when encryption is ready OR when the user simply has no keys (unencrypted fallback). */
    e2eeReady: !!chatKey || !keys,
  };
}
