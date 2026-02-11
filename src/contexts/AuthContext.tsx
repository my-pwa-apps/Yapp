import React, { createContext, useContext, useEffect, useState } from 'react';
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
  serverTimestamp,
  onDisconnect,
} from 'firebase/database';
import { auth, db } from '../firebase';
import type { UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateStatus: (status: string) => Promise<void>;
  updatePhotoURL: (photoURL: string | null) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  // MFA
  enrollMFA: () => Promise<{ secret: TotpSecret; qrUrl: string }>;
  finalizeMFAEnrollment: (secret: TotpSecret, verificationCode: string) => Promise<void>;
  unenrollMFA: () => Promise<void>;
  isMFAEnabled: boolean;
  // MFA sign-in resolver (set when MFA challenge occurs)
  mfaResolver: ReturnType<typeof getMultiFactorResolver> | null;
  verifyMFASignIn: (code: string) => Promise<void>;
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

  // Check MFA enrollment status whenever user changes
  const checkMFAStatus = (u: User | null) => {
    if (u) {
      const enrolled = multiFactor(u).enrolledFactors;
      setIsMFAEnabled(enrolled.length > 0);
    } else {
      setIsMFAEnabled(false);
    }
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
              status: 'Hey there! I am using Yapp',
              online: true,
              lastSeen: Date.now(),
              createdAt: Date.now(),
            };
            await set(userRef, newProfile);
            setProfile(newProfile);
          }

          // Set up presence: mark offline on disconnect
          const onlineRef = ref(db, `users/${firebaseUser.uid}/online`);
          const lastSeenRef = ref(db, `users/${firebaseUser.uid}/lastSeen`);
          onDisconnect(onlineRef).set(false);
          onDisconnect(lastSeenRef).set(serverTimestamp());

          checkMFAStatus(firebaseUser);
        } catch (e) {
          console.error('[Auth] Database error:', e);
        }
      } else {
        setProfile(null);
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
    } catch (err: any) {
      if (err.code === 'auth/multi-factor-auth-required') {
        // MFA challenge needed
        const resolver = getMultiFactorResolver(auth, err);
        setMfaResolver(resolver);
        throw err; // re-throw so LoginPage can show MFA input
      }
      throw err;
    }
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName });
    const userProfile: UserProfile = {
      uid: cred.user.uid,
      displayName,
      email: email.toLowerCase(),
      photoURL: null,
      status: 'Hey there! I am using Yapp',
      online: true,
      lastSeen: Date.now(),
      createdAt: Date.now(),
    };
    await set(ref(db, `users/${cred.user.uid}`), userProfile);
    setProfile(userProfile);
  };

  const signOut = async () => {
    if (user) {
      await update(ref(db, `users/${user.uid}`), { online: false, lastSeen: serverTimestamp() });
    }
    await firebaseSignOut(auth);
    setProfile(null);
  };

  const updateStatus = async (status: string) => {
    if (!user) return;
    await update(ref(db, `users/${user.uid}`), { status });
    setProfile((p) => (p ? { ...p, status } : null));
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
  };

  // MFA enrollment
  const enrollMFA = async (): Promise<{ secret: TotpSecret; qrUrl: string }> => {
    if (!user) throw new Error('Not signed in');
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
  };

  return (
    <AuthContext.Provider value={{
      user, profile, loading, signIn, signUp, signOut,
      updateStatus, updatePhotoURL, changePassword,
      enrollMFA, finalizeMFAEnrollment, unenrollMFA, isMFAEnabled,
      mfaResolver, verifyMFASignIn,
    }}>
      {children}
    </AuthContext.Provider>
  );
};
