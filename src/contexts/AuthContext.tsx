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
  multiFactor,
  TotpMultiFactorGenerator,
  TotpSecret,
  getMultiFactorResolver,
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
import type { UserProfile } from '../types';
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

export interface CryptoKeys {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateStatus: (status: string) => Promise<void>;
  updateDisplayName: (displayName: string) => Promise<void>;
  updatePhotoURL: (photoURL: string | null) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  // MFA
  enrollMFA: (password: string) => Promise<{ secret: TotpSecret; qrUrl: string }>;
  finalizeMFAEnrollment: (secret: TotpSecret, verificationCode: string) => Promise<void>;
  unenrollMFA: () => Promise<void>;
  isMFAEnabled: boolean;
  // MFA sign-in resolver (set when MFA challenge occurs)
  mfaResolver: ReturnType<typeof getMultiFactorResolver> | null;
  verifyMFASignIn: (code: string) => Promise<void>;
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
  const [isMFAEnabled, setIsMFAEnabled] = useState(false);
  const [mfaResolver, setMfaResolver] = useState<ReturnType<typeof getMultiFactorResolver> | null>(null);
  const [cryptoKeys, setCryptoKeys] = useState<CryptoKeys | null>(null);
  const [needsKeyRecovery, setNeedsKeyRecovery] = useState(false);
  const presenceUnsubRef = useRef<(() => void) | null>(null);
  const pendingPasswordRef = useRef<string | null>(null);

  // Check MFA enrollment status whenever user changes
  const checkMFAStatus = (u: User | null) => {
    if (u) {
      const enrolled = multiFactor(u).enrolledFactors;
      setIsMFAEnabled(enrolled.length > 0);
    } else {
      setIsMFAEnabled(false);
    }
  };

  /** Load E2EE keys from IndexedDB (for page refresh) or flag recovery needed */
  const loadLocalCryptoKeys = async (uid: string) => {
    try {
      const local = await loadKeysLocally();
      if (local) {
        setCryptoKeys(local);
        return;
      }
      // Check if user has keys in RTDB (needs password to decrypt)
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

          checkMFAStatus(firebaseUser);
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
      checkMFAStatus(cred.user);
      // Recover E2EE keys
      await recoverKeysFromRTDB(cred.user.uid, password);
    } catch (err: any) {
      if (err.code === 'auth/multi-factor-auth-required') {
        pendingPasswordRef.current = password;
        const resolver = getMultiFactorResolver(auth, err);
        setMfaResolver(resolver);
        throw err;
      }
      throw err;
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

  // MFA enrollment — requires reauthentication
  const enrollMFA = async (password: string): Promise<{ secret: TotpSecret; qrUrl: string }> => {
    if (!user || !user.email) throw new Error('Not signed in');
    // Reauthenticate first — Firebase requires recent sign-in for MFA
    const credential = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(user, credential);
    const session = await multiFactor(user).getSession();
    const secret = await TotpMultiFactorGenerator.generateSecret(session);
    const qrUrl = secret.generateQrCodeUrl(user.email || 'user', "Yappin'");
    return { secret, qrUrl };
  };

  const finalizeMFAEnrollment = async (secret: TotpSecret, verificationCode: string) => {
    if (!user) throw new Error('Not signed in');
    const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, verificationCode);
    await multiFactor(user).enroll(assertion, 'Authenticator app');
    checkMFAStatus(user);
  };

  const unenrollMFA = async () => {
    if (!user) throw new Error('Not signed in');
    const enrolled = multiFactor(user).enrolledFactors;
    if (enrolled.length > 0) {
      await multiFactor(user).unenroll(enrolled[0]);
      checkMFAStatus(user);
    }
  };

  // MFA sign-in verification (called from LoginPage when MFA is required)
  const verifyMFASignIn = async (code: string) => {
    if (!mfaResolver) throw new Error('No MFA resolver available');
    // Find the TOTP hint
    const totpHint = mfaResolver.hints.find(
      (h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID
    );
    if (!totpHint) throw new Error('No TOTP factor enrolled');
    const assertion = TotpMultiFactorGenerator.assertionForSignIn(
      totpHint.uid,
      code
    );
    const cred = await mfaResolver.resolveSignIn(assertion);
    setMfaResolver(null);
    // Complete login
    const userRef = ref(db, `users/${cred.user.uid}`);
    await update(userRef, { online: true, lastSeen: serverTimestamp() });
    const snap = await get(userRef);
    setProfile(snap.val() as UserProfile);
    checkMFAStatus(cred.user);
    // Recover E2EE keys using cached password from initial sign-in attempt
    const password = pendingPasswordRef.current;
    pendingPasswordRef.current = null;
    if (password) {
      try {
        await recoverKeysFromRTDB(cred.user.uid, password);
      } catch {
        // Will fall back to key recovery modal
      }
    }
  };

  return (
    <AuthContext.Provider value={{
      user, profile, loading, signIn, signUp, signOut,
      updateStatus, updateDisplayName, updatePhotoURL, changePassword,
      enrollMFA, finalizeMFAEnrollment, unenrollMFA, isMFAEnabled,
      mfaResolver, verifyMFASignIn,
      cryptoKeys, needsKeyRecovery, recoverKeys,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
