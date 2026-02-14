/**
 * End-to-end encryption utilities using Web Crypto API.
 *
 * Key hierarchy:
 *  - Identity: ECDH P-256 key pair (per user, backed up encrypted with login password)
 *  - Direct chat: ECDH(myPrivate, theirPublic) → HKDF → AES-GCM-256 key
 *  - Group chat: Random AES-GCM-256 key, wrapped per-member via ECDH-derived keys
 */

const PBKDF2_ITERATIONS = 600_000;
const AES_LENGTH = 256;

// ─── IndexedDB key store ──────────────────────────────────────────

const DB_NAME = 'yapp-e2ee';
const STORE = 'keys';

let cachedDB: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (cachedDB) return Promise.resolve(cachedDB);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => {
      cachedDB = req.result;
      cachedDB.onclose = () => { cachedDB = null; };
      resolve(cachedDB);
    };
    req.onerror = () => reject(req.error);
  });
}

function idbGet<T>(key: string): Promise<T | undefined> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

function idbPut(key: string, value: unknown): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

function idbClear(): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

// ─── Base64 helpers ───────────────────────────────────────────────

export function bufToBase64(buf: Uint8Array): string {
  let s = '';
  for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
  return btoa(s);
}

export function base64ToBuf(b64: string): Uint8Array {
  const s = atob(b64);
  const buf = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) buf[i] = s.charCodeAt(i);
  return buf;
}

// ─── Key generation ───────────────────────────────────────────────

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true, // extractable — needed for password-based backup
    ['deriveBits']
  );
}

// ─── Public key serialization ─────────────────────────────────────

export async function exportPublicKey(key: CryptoKey): Promise<string> {
  const jwk = await crypto.subtle.exportKey('jwk', key);
  return JSON.stringify(jwk);
}

export async function importPublicKey(jwkStr: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkStr) as JsonWebKey;
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );
}

// ─── Password-based private key backup ────────────────────────────

async function deriveFromPassword(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: AES_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptPrivateKey(
  privateKey: CryptoKey,
  password: string
): Promise<{ ciphertext: string; iv: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapping = await deriveFromPassword(password, salt);
  const jwk = await crypto.subtle.exportKey('jwk', privateKey);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrapping,
    new TextEncoder().encode(JSON.stringify(jwk))
  );
  return {
    ciphertext: bufToBase64(new Uint8Array(ct)),
    iv: bufToBase64(iv),
    salt: bufToBase64(salt),
  };
}

export async function decryptPrivateKey(
  data: { ciphertext: string; iv: string; salt: string },
  password: string
): Promise<CryptoKey> {
  const wrapping = await deriveFromPassword(password, base64ToBuf(data.salt));
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBuf(data.iv) },
    wrapping,
    base64ToBuf(data.ciphertext)
  );
  const jwk = JSON.parse(new TextDecoder().decode(pt)) as JsonWebKey;
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
}

// ─── Shared key derivation (direct chats) ─────────────────────────

export async function deriveDirectChatKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
  chatId: string
): Promise<CryptoKey> {
  const bits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: publicKey },
    privateKey,
    256
  );
  const hkdf = await crypto.subtle.importKey('raw', bits, 'HKDF', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(`yapp:${chatId}`),
    },
    hkdf,
    { name: 'AES-GCM', length: AES_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

// ─── AES-GCM message encryption ──────────────────────────────────

export async function encrypt(
  text: string,
  key: CryptoKey
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(text)
  );
  return { ciphertext: bufToBase64(new Uint8Array(ct)), iv: bufToBase64(iv) };
}

export async function decrypt(
  ciphertext: string,
  iv: string,
  key: CryptoKey
): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBuf(iv) },
    key,
    base64ToBuf(ciphertext)
  );
  return new TextDecoder().decode(pt);
}

// ─── Group key management ─────────────────────────────────────────

export async function generateGroupKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: AES_LENGTH },
    true, // extractable for wrapping/distribution
    ['encrypt', 'decrypt']
  );
}

export async function wrapGroupKeyForMember(
  groupKey: CryptoKey,
  myPrivateKey: CryptoKey,
  memberPublicKey: CryptoKey,
  chatId: string
): Promise<{ wrappedKey: string; iv: string }> {
  const sharedKey = await deriveDirectChatKey(
    myPrivateKey,
    memberPublicKey,
    `${chatId}:gk`
  );
  const raw = new Uint8Array(
    await crypto.subtle.exportKey('raw', groupKey)
  );
  const { ciphertext, iv } = await encrypt(bufToBase64(raw), sharedKey);
  return { wrappedKey: ciphertext, iv };
}

export async function unwrapGroupKeyForMember(
  wrappedKey: string,
  iv: string,
  myPrivateKey: CryptoKey,
  wrapperPublicKey: CryptoKey,
  chatId: string
): Promise<CryptoKey> {
  const sharedKey = await deriveDirectChatKey(
    myPrivateKey,
    wrapperPublicKey,
    `${chatId}:gk`
  );
  const rawB64 = await decrypt(wrappedKey, iv, sharedKey);
  return crypto.subtle.importKey(
    'raw',
    base64ToBuf(rawB64),
    { name: 'AES-GCM', length: AES_LENGTH },
    true, // extractable so it can be re-wrapped for new members
    ['encrypt', 'decrypt']
  );
}

// ─── Local key persistence (IndexedDB) ────────────────────────────

export async function saveKeysLocally(
  priv: CryptoKey,
  pub: CryptoKey
): Promise<void> {
  await idbPut('privateKey', priv);
  await idbPut('publicKey', pub);
}

export async function loadKeysLocally(): Promise<{
  privateKey: CryptoKey;
  publicKey: CryptoKey;
} | null> {
  try {
    const priv = await idbGet<CryptoKey>('privateKey');
    const pub = await idbGet<CryptoKey>('publicKey');
    if (priv && pub) return { privateKey: priv, publicKey: pub };
  } catch {
    /* IndexedDB not available or cleared */
  }
  return null;
}

export async function clearLocalKeys(): Promise<void> {
  try {
    await idbClear();
  } catch {
    /* ignore */
  }
}

// ─── Chat key cache (module-level singleton) ──────────────────────

const chatKeyCache = new Map<string, CryptoKey>();

export function getCachedChatKey(chatId: string): CryptoKey | undefined {
  return chatKeyCache.get(chatId);
}

export function setCachedChatKey(chatId: string, key: CryptoKey): void {
  chatKeyCache.set(chatId, key);
}

export function clearChatKeyCache(): void {
  chatKeyCache.clear();
}
