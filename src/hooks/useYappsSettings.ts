import { useEffect, useState } from 'react';
import { ref, onValue, set } from 'firebase/database';
import { db } from '../firebase';

export interface YappsSettings {
  /* ── Notifications ── */
  notifyFollowedPosts: boolean;     // New yapps from accounts you follow
  notifyReplies: boolean;           // Replies to your yapps
  notifyLikes: boolean;             // Likes on your yapps
  notifyReyapps: boolean;           // Reyapps of your yapps
  notifyNewFollowers: boolean;      // When someone follows you

  /* ── Feed preferences ── */
  autoExpandThreads: boolean;       // Auto-expand inline replies
  showReyapps: boolean;             // Show reyapps in feed
  autoFollowContacts: boolean;      // Auto-follow contacts on the feed
}

const defaultSettings: YappsSettings = {
  notifyFollowedPosts: true,
  notifyReplies: true,
  notifyLikes: true,
  notifyReyapps: true,
  notifyNewFollowers: true,
  autoExpandThreads: false,
  showReyapps: true,
  autoFollowContacts: true,
};

/**
 * Live-synced Yapps settings hook.
 * Settings are stored at `yappsSettings/{uid}` in Firebase RTDB
 * so they sync across devices.
 */
export function useYappsSettings(uid: string | undefined) {
  const [settings, setSettings] = useState<YappsSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    const settingsRef = ref(db, `yappsSettings/${uid}`);
    const unsub = onValue(settingsRef, (snap) => {
      if (snap.exists()) {
        setSettings({ ...defaultSettings, ...snap.val() });
      } else {
        setSettings(defaultSettings);
      }
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [uid]);

  return { settings, loading };
}

export async function saveYappsSettings(uid: string, settings: YappsSettings): Promise<void> {
  await set(ref(db, `yappsSettings/${uid}`), settings);
}

export function getDefaultSettings(): YappsSettings {
  return { ...defaultSettings };
}
