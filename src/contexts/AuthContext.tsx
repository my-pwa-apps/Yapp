import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
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
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const userRef = ref(db, `users/${cred.user.uid}`);
    await update(userRef, { online: true, lastSeen: serverTimestamp() });
    const snap = await get(userRef);
    setProfile(snap.val() as UserProfile);
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

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signOut, updateStatus }}>
      {children}
    </AuthContext.Provider>
  );
};
