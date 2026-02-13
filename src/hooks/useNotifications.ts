import { useEffect, useRef, useCallback } from 'react';

export interface NotificationPreferences {
  enabled: boolean;
  messages: boolean;
  groupInvites: boolean;
  joinRequests: boolean;
  contactRequests: boolean;
}

const PREFS_KEY = 'yapp_notification_prefs';

const defaultPrefs: NotificationPreferences = {
  enabled: true,
  messages: true,
  groupInvites: true,
  joinRequests: true,
  contactRequests: true,
};

export function getNotificationPrefs(): NotificationPreferences {
  try {
    const stored = localStorage.getItem(PREFS_KEY);
    if (stored) return { ...defaultPrefs, ...JSON.parse(stored) };
  } catch { /* ignore */ }
  return { ...defaultPrefs };
}

export function saveNotificationPrefs(prefs: NotificationPreferences) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export function getPermissionState(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

export async function requestPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

async function showNotification(title: string, body: string, tag?: string, data?: { chatId?: string; type?: string }, onClick?: () => void) {
  if (Notification.permission !== 'granted') return;

  const options: NotificationOptions = {
    body,
    icon: '/Yapp/icons/icon-192.png',
    badge: '/Yapp/icons/icon-192.png',
    tag: tag || `yapp-${Date.now()}`,
    silent: false,
    data,
  };

  // Use Service Worker registration for Android/mobile support
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, options);
      return;
    } catch { /* fallback below */ }
  }

  // Fallback for desktop browsers
  const notification = new Notification(title, options);
  if (onClick) {
    notification.onclick = () => {
      window.focus();
      onClick();
      notification.close();
    };
  }
  setTimeout(() => notification.close(), 5000);
}

/**
 * Hook that provides notification functions.
 * Checks preferences and permission before showing.
 */
export function useNotifications() {
  const prefsRef = useRef<NotificationPreferences>(getNotificationPrefs());

  // Refresh prefs on mount and auto-request permission
  useEffect(() => {
    prefsRef.current = getNotificationPrefs();
    // Auto-request permission on first load
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const refreshPrefs = useCallback(() => {
    prefsRef.current = getNotificationPrefs();
  }, []);

  const notifyMessage = useCallback((senderName: string, text: string, chatId: string, activeChatId?: string | null, onClick?: () => void) => {
    const prefs = prefsRef.current;
    if (!prefs.enabled || !prefs.messages) return;
    // Don't notify for the chat the user is currently viewing
    if (activeChatId === chatId && document.hasFocus()) return;
    showNotification(
      senderName,
      text.length > 100 ? text.substring(0, 100) + '...' : text,
      `msg-${chatId}`,
      { chatId, type: 'message' },
      onClick
    );
  }, []);

  const notifyGroupInvite = useCallback((groupName: string, invitedBy: string) => {
    const prefs = prefsRef.current;
    if (!prefs.enabled || !prefs.groupInvites) return;
    showNotification(
      'Group Invite',
      `${invitedBy} invited you to "${groupName}"`,
      `invite-${groupName}`,
      { type: 'groupInvite' }
    );
  }, []);

  const notifyJoinRequest = useCallback((groupName: string, fromName: string) => {
    const prefs = prefsRef.current;
    if (!prefs.enabled || !prefs.joinRequests) return;
    showNotification(
      'Join Request',
      `${fromName} wants to join "${groupName}"`,
      `join-${groupName}-${fromName}`,
      { type: 'joinRequest' }
    );
  }, []);

  const notifyContactRequest = useCallback((fromName: string, fromEmail: string) => {
    const prefs = prefsRef.current;
    if (!prefs.enabled || !prefs.contactRequests) return;
    showNotification(
      'Contact Request',
      `${fromName} (${fromEmail}) wants to connect`,
      `contact-${fromEmail}`,
      { type: 'contactRequest' }
    );
  }, []);

  return {
    notifyMessage,
    notifyGroupInvite,
    notifyJoinRequest,
    notifyContactRequest,
    refreshPrefs,
  };
}
