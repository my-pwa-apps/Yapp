/* eslint-disable react-refresh/only-export-components */
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
  signInWithRedirect,
  getRedirectResult,
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
  /** Set when a Google user signs in without an existing encrypted key backup. */
  needsPassphraseSetup: boolean;
  /** Generate keys and encrypt with the passphrase; writes backup to users/{uid}. */
  setupE2EEPassphrase: (passphrase: string) => Promise<void>;
  /** Dismiss the passphrase prompt without setting up E2EE (⚠️ not recommended). */
  skipE2EEPassphrase: () => void;
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
  const [needsPassphraseSetup, setNeedsPassphraseSetup] = useState(false);
  const presenceUnsubRef = useRef<(() => void) | null>(null);

  /** Load E2EE keys from IndexedDB → password-encrypted backup (flag recovery). */
  const loadLocalCryptoKeys = async (firebaseUser: User) => {
    try {
      const local = await loadKeysLocally();
      if (local) {
        setCryptoKeys(local);
        setNeedsKeyRecovery(false);
        setNeedsPassphraseSetup(false);
        return;
      }
      // Password-encrypted backup needs manual recovery
      const snap = await get(ref(db, `users/${firebaseUser.uid}/encryptedPrivateKey`));
      if (snap.exists()) {
        setNeedsKeyRecovery(true);
        setNeedsPassphraseSetup(false);
        return;
      }
      const isGoogleUser = firebaseUser.providerData.some((provider) => provider.providerId === 'google.com');
      if (isGoogleUser) {
        setNeedsPassphraseSetup(true);
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
        setNeedsPassphraseSetup(false);
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
      setNeedsKeyRecovery(false);
      setNeedsPassphraseSetup(false);
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
    // Resolve any pending signInWithRedirect() so errors surface and
    // onAuthStateChanged runs against the finalized auth state.
    getRedirectResult(auth).catch((err) => {
      console.warn('[Auth] getRedirectResult error:', err);
    });
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
              onDisconnect(onlineRef).set(false).catch(() => {});
              onDisconnect(lastSeenRef).set(serverTimestamp()).catch(() => {});
              set(onlineRef, true).catch(() => {});
            }
          });
          presenceUnsubRef.current = connUnsub;

          // Load E2EE keys from IndexedDB (or flag for recovery)
          await loadLocalCryptoKeys(firebaseUser);
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
        setNeedsPassphraseSetup(false);
      }
      setLoading(false);
    });
    return () => {
      unsub();
      presenceUnsubRef.current?.();
      presenceUnsubRef.current = null;
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const userRef = ref(db, `users/${cred.user.uid}`);
    await update(userRef, { online: true, lastSeen: serverTimestamp() });
    const snap = await get(userRef);
    setProfile(snap.val() as UserProfile);
    // Recover E2EE keys
    await recoverKeysFromRTDB(cred.user.uid, password);
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    // GitHub Pages (and other hosts that can't set Cross-Origin-Opener-Policy:
    // same-origin-allow-popups) trigger noisy "window.closed call blocked"
    // warnings from Chrome when signInWithPopup polls the popup. Use redirect
    // on production, popup on localhost for fast dev iteration.
    const isLocalhost =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1');
    if (isLocalhost) {
      try {
        await signInWithPopup(auth, provider);
        return;
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
          throw err;
        }
        // Fall through to redirect on any other popup failure.
      }
    }
    await signInWithRedirect(auth, provider);
    // signInWithRedirect navigates away; the promise never resolves in this tab.
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
      setNeedsKeyRecovery(false);
      setNeedsPassphraseSetup(false);
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

  const setupE2EEPassphrase = async (passphrase: string) => {
    if (!user) throw new Error('Not signed in');
    if (passphrase.length < 8) throw new Error('Passphrase too short');
    const keyPair = await generateKeyPair();
    const pubStr = await exportPublicKey(keyPair.publicKey);
    const encPriv = await encryptPrivateKey(keyPair.privateKey, passphrase);
    await update(ref(db, `users/${user.uid}`), {
      publicKey: pubStr,
      encryptedPrivateKey: encPriv,
    });
    await saveKeysLocally(keyPair.privateKey, keyPair.publicKey);
    setCryptoKeys({ privateKey: keyPair.privateKey, publicKey: keyPair.publicKey });
    setNeedsPassphraseSetup(false);
  };

  const skipE2EEPassphrase = () => setNeedsPassphraseSetup(false);

  const contextValue = {
    user, profile, loading, signIn, signInWithGoogle, signUp, signOut,
    updateStatus, updateDisplayName, updatePhotoURL, changePassword,
    cryptoKeys, needsKeyRecovery, recoverKeys,
    needsPassphraseSetup, setupE2EEPassphrase, skipE2EEPassphrase,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};
