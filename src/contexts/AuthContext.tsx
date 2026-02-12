import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  updatePassword as firebaseUpdatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  GoogleAuthProvider,
  signInWithPopup,
  User,
} from 'firebase/auth';
import {
  ref,
  set,
  get,
  update,
  onValue,
  serverTimestamp,
  onDisconnect,
} from 'firebase/database';
import { auth, db } from '../firebase';
import type { UserProfile, CryptoKeys } from '../types';
import {
  generateKeyPair,
  exportPublicKey,
  importPublicKey,
  encryptPrivateKey,
  decryptPrivateKey,
  saveKeysLocally,
  loadKeysLocally,
  clearLocalKeys,
  clearChatKeyCache,
} from '../hooks/useCrypto';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateStatus: (status: string) => Promise<void>;
  updateDisplayName: (displayName: string) => Promise<void>;
  updatePhotoURL: (photoURL: string | null) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  // E2EE
  cryptoKeys: CryptoKeys | null;
  needsKeyRecovery: boolean;
  recoverKeys: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [cryptoKeys, setCryptoKeys] = useState<CryptoKeys | null>(null);
  const [needsKeyRecovery, setNeedsKeyRecovery] = useState(false);
  const presenceUnsubRef = useRef<(() => void) | null>(null);

  /** Store a Google-compatible key backup (encrypted with UID) in privateKeys/{uid} */
  const ensureGoogleKeyBackup = async (uid: string, privateKey: CryptoKey) => {
    try {
      const gSnap = await get(ref(db, `privateKeys/${uid}`));
      if (!gSnap.exists() || !gSnap.val().encryptedPrivateKey) {
        const encPriv = await encryptPrivateKey(privateKey, uid);
        await set(ref(db, `privateKeys/${uid}`), { encryptedPrivateKey: encPriv });
      }
    } catch (e) {
      console.error('[E2EE] Failed to create Google key backup:', e);
    }
  };

  /** Load E2EE keys from IndexedDB → Google backup → flag password recovery */
  const loadLocalCryptoKeys = async (uid: string) => {
    try {
      const local = await loadKeysLocally();
      if (local) {
        setCryptoKeys(local);
        // Ensure Google backup exists
        await ensureGoogleKeyBackup(uid, local.privateKey);
        return;
      }
      // Try Google key backup (uid-encrypted) in privateKeys/{uid}
      try {
        const gSnap = await get(ref(db, `privateKeys/${uid}`));
        if (gSnap.exists() && gSnap.val().encryptedPrivateKey) {
          const privateKey = await decryptPrivateKey(gSnap.val().encryptedPrivateKey, uid);
          const pubSnap = await get(ref(db, `users/${uid}/publicKey`));
          if (pubSnap.exists()) {
            const publicKey = await importPublicKey(pubSnap.val());
            await saveKeysLocally(privateKey, publicKey);
            setCryptoKeys({ privateKey, publicKey });
            return;
          }
        }
      } catch { /* Google backup not available or failed */ }
      // Fall back: password-encrypted backup needs manual recovery
      const snap = await get(ref(db, `users/${uid}/encryptedPrivateKey`));
      if (snap.exists()) {
        setNeedsKeyRecovery(true);
      }
    } catch {
      /* IndexedDB unavailable */
    }
  };

  /** Decrypt private key from RTDB backup using password */
  const recoverKeysFromRTDB = async (uid: string, password: string) => {
    try {
      const snap = await get(ref(db, `users/${uid}`));
      if (!snap.exists()) return;
      const data = snap.val();
      if (data.encryptedPrivateKey && data.publicKey) {
        const privateKey = await decryptPrivateKey(data.encryptedPrivateKey, password);
        const publicKey = await importPublicKey(data.publicKey);
        await saveKeysLocally(privateKey, publicKey);
        setCryptoKeys({ privateKey, publicKey });
        setNeedsKeyRecovery(false);
        // Also create Google key backup for future Google sign-ins
        await ensureGoogleKeyBackup(uid, privateKey);
      } else {
        // Legacy user: generate keys
        await generateAndStoreKeys(uid, password);
      }
    } catch (e) {
      console.error('[E2EE] Key recovery failed:', e);
      throw e;
    }
  };

  /** Generate a fresh key pair, encrypt with password, write to RTDB & IndexedDB */
  const generateAndStoreKeys = async (uid: string, password: string) => {
    try {
      const keyPair = await generateKeyPair();
      const pubStr = await exportPublicKey(keyPair.publicKey);
      const encPriv = await encryptPrivateKey(keyPair.privateKey, password);
      await update(ref(db, `users/${uid}`), { publicKey: pubStr, encryptedPrivateKey: encPriv });
      await saveKeysLocally(keyPair.privateKey, keyPair.publicKey);
      setCryptoKeys({ privateKey: keyPair.privateKey, publicKey: keyPair.publicKey });
      // Also create Google key backup
      await ensureGoogleKeyBackup(uid, keyPair.privateKey);
    } catch (e) {
      console.error('[E2EE] Key generation failed:', e);
    }
  };

  /** Manual key recovery (called from KeyRecoveryModal) */
  const recoverKeys = async (password: string) => {
    if (!user) throw new Error('Not signed in');
    await recoverKeysFromRTDB(user.uid, password);
  };

  // Listen to auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const userRef = ref(db, `users/${firebaseUser.uid}`);
          const snap = await get(userRef);

          if (snap.exists()) {
            const data = snap.val() as UserProfile;
            // Normalize email to lowercase if needed
            const normalizedEmail = (firebaseUser.email || '').toLowerCase();
            if (data.email !== normalizedEmail) {
              data.email = normalizedEmail;
              await update(userRef, { email: normalizedEmail });
            }
            setProfile(data);
            await update(userRef, { online: true, lastSeen: serverTimestamp() });
          } else {
            // Create profile if missing
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
              email: (firebaseUser.email || '').toLowerCase(),
              photoURL: firebaseUser.photoURL || null,
              status: "Hey there! I'm using Yappin'",
              online: true,
              lastSeen: Date.now(),
              createdAt: Date.now(),
            };
            await set(userRef, newProfile);
            setProfile(newProfile);
          }

          // Set up presence via .info/connected — re-registers on every reconnect
          const connectedRef = ref(db, '.info/connected');
          const onlineRef = ref(db, `users/${firebaseUser.uid}/online`);
          const lastSeenRef = ref(db, `users/${firebaseUser.uid}/lastSeen`);
          // Clean up previous listener if re-running
          presenceUnsubRef.current?.();
          const connUnsub = onValue(connectedRef, (snap) => {
            if (snap.val() === true) {
              // Connection established — mark online and set up disconnect handlers
              onDisconnect(onlineRef).set(false);
              onDisconnect(lastSeenRef).set(serverTimestamp());
              set(onlineRef, true);
            }
          });
          presenceUnsubRef.current = connUnsub;

          // Load E2EE keys from IndexedDB (or flag for recovery)
          await loadLocalCryptoKeys(firebaseUser.uid);
        } catch (e) {
          console.error('[Auth] Database error:', e);
        }
      } else {
        // Clean up presence listener when signed out
        presenceUnsubRef.current?.();
        presenceUnsubRef.current = null;
        setProfile(null);
        setCryptoKeys(null);
        setNeedsKeyRecovery(false);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const userRef = ref(db, `users/${cred.user.uid}`);
      await update(userRef, { online: true, lastSeen: serverTimestamp() });
      const snap = await get(userRef);
      setProfile(snap.val() as UserProfile);
      // Recover E2EE keys
      await recoverKeysFromRTDB(cred.user.uid, password);
    } catch (err: any) {
      throw err;
    }
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    const uid = cred.user.uid;
    const userRef = ref(db, `users/${uid}`);
    const snap = await get(userRef);
    const isNewUser = !snap.exists();
    if (snap.exists()) {
      await update(userRef, { online: true, lastSeen: serverTimestamp() });
      setProfile(snap.val() as UserProfile);
    } else {
      const newProfile: UserProfile = {
        uid,
        displayName: cred.user.displayName || cred.user.email?.split('@')[0] || 'User',
        email: (cred.user.email || '').toLowerCase(),
        photoURL: cred.user.photoURL || null,
        status: "Hey there! I'm using Yappin'",
        online: true,
        lastSeen: Date.now(),
        createdAt: Date.now(),
      };
      await set(userRef, newProfile);
      setProfile(newProfile);
    }

    // E2EE: Try IndexedDB first
    try {
      const local = await loadKeysLocally();
      if (local) {
        setCryptoKeys(local);
        await ensureGoogleKeyBackup(uid, local.privateKey);
        return;
      }
    } catch { /* IndexedDB unavailable */ }

    // Try Google key backup from privateKeys/{uid}
    try {
      const gSnap = await get(ref(db, `privateKeys/${uid}`));
      if (gSnap.exists() && gSnap.val().encryptedPrivateKey) {
        const privateKey = await decryptPrivateKey(gSnap.val().encryptedPrivateKey, uid);
        const pubSnap = await get(ref(db, `users/${uid}/publicKey`));
        if (pubSnap.exists()) {
          const publicKey = await importPublicKey(pubSnap.val());
          await saveKeysLocally(privateKey, publicKey);
          setCryptoKeys({ privateKey, publicKey });
          return;
        }
      }
    } catch (e) {
      console.error('[E2EE] Google key recovery failed:', e);
    }

    // Check password-encrypted backup (needs manual recovery)
    if (!isNewUser) {
      const pkSnap = await get(ref(db, `users/${uid}/encryptedPrivateKey`));
      if (pkSnap.exists()) {
        setNeedsKeyRecovery(true);
        return;
      }
    }

    // No keys anywhere — generate fresh (encrypt backup with UID)
    try {
      const keyPair = await generateKeyPair();
      const pubStr = await exportPublicKey(keyPair.publicKey);
      const encPriv = await encryptPrivateKey(keyPair.privateKey, uid);
      await update(ref(db, `users/${uid}`), { publicKey: pubStr });
      await set(ref(db, `privateKeys/${uid}`), { encryptedPrivateKey: encPriv });
      await saveKeysLocally(keyPair.privateKey, keyPair.publicKey);
      setCryptoKeys({ privateKey: keyPair.privateKey, publicKey: keyPair.publicKey });
    } catch (e) {
      console.error('[E2EE] Key generation for Google user failed:', e);
    }
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName });
    // Generate E2EE key pair
    let publicKeyStr: string | undefined;
    let encPriv: { ciphertext: string; iv: string; salt: string } | undefined;
    try {
      const keyPair = await generateKeyPair();
      publicKeyStr = await exportPublicKey(keyPair.publicKey);
      encPriv = await encryptPrivateKey(keyPair.privateKey, password);
      await saveKeysLocally(keyPair.privateKey, keyPair.publicKey);
      setCryptoKeys({ privateKey: keyPair.privateKey, publicKey: keyPair.publicKey });
      // Also create Google key backup for future Google sign-ins
      await ensureGoogleKeyBackup(cred.user.uid, keyPair.privateKey);
    } catch (e) {
      console.error('[E2EE] Key generation on signup failed:', e);
    }
    const userProfile: UserProfile = {
      uid: cred.user.uid,
      displayName,
      email: email.toLowerCase(),
      photoURL: null,
      status: "Hey there! I'm using Yappin'",
      online: true,
      lastSeen: Date.now(),
      createdAt: Date.now(),
      ...(publicKeyStr ? { publicKey: publicKeyStr } : {}),
      ...(encPriv ? { encryptedPrivateKey: encPriv } : {}),
    };
    await set(ref(db, `users/${cred.user.uid}`), userProfile);
    setProfile(userProfile);
  };

  const signOut = async () => {
    if (user) {
      await update(ref(db, `users/${user.uid}`), { online: false, lastSeen: serverTimestamp() });
    }
    await clearLocalKeys();
    clearChatKeyCache();
    setCryptoKeys(null);
    setNeedsKeyRecovery(false);
    await firebaseSignOut(auth);
    setProfile(null);
  };

  const updateStatus = async (status: string) => {
    if (!user) return;
    await update(ref(db, `users/${user.uid}`), { status });
    setProfile((p) => (p ? { ...p, status } : null));
  };

  const updateDisplayName = async (displayName: string) => {
    if (!user) return;
    await updateProfile(user, { displayName });
    await update(ref(db, `users/${user.uid}`), { displayName });
    setProfile((p) => (p ? { ...p, displayName } : null));
  };

  const updatePhotoURL = async (photoURL: string | null) => {
    if (!user) return;
    await update(ref(db, `users/${user.uid}`), { photoURL });
    setProfile((p) => (p ? { ...p, photoURL } : null));
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    if (!user || !user.email) throw new Error('Not signed in');
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await firebaseUpdatePassword(user, newPassword);
    // Re-encrypt E2EE private key with new password
    if (cryptoKeys) {
      try {
        const encPriv = await encryptPrivateKey(cryptoKeys.privateKey, newPassword);
        await update(ref(db, `users/${user.uid}`), { encryptedPrivateKey: encPriv });
      } catch (e) {
        console.error('[E2EE] Failed to re-encrypt key on password change:', e);
      }
    }
  };

  return (
    <AuthContext.Provider value={{
      user, profile, loading, signIn, signInWithGoogle, signUp, signOut,
      updateStatus, updateDisplayName, updatePhotoURL, changePassword,
      cryptoKeys, needsKeyRecovery, recoverKeys,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
