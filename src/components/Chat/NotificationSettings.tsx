import React, { useEffect, useCallback, useState } from 'react';
import {
  getNotificationPrefs,
  saveNotificationPrefs,
  getPermissionState,
  requestPermission,
  type NotificationPreferences,
} from '../../hooks/useNotifications';

import { useAuth } from '../../contexts/AuthContext';
import { KeyRecoveryModal } from './KeyRecoveryModal';

interface Props {
  onClose: () => void;
  onPrefsChanged?: () => void;
}

export const NotificationSettings: React.FC<Props> = ({ onClose, onPrefsChanged }) => {
  const { cryptoKeys, needsKeyRecovery, recoverKeys } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPreferences>(getNotificationPrefs());
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(getPermissionState());

  const [showKeyRecovery, setShowKeyRecovery] = useState(false);

  useEffect(() => {
    setPermission(getPermissionState());
  }, []);

  // Close on Escape key
  const handleKeyDown = useCallback((e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }, [onClose]);
  useEffect(() => { document.addEventListener('keydown', handleKeyDown); return () => document.removeEventListener('keydown', handleKeyDown); }, [handleKeyDown]);

  const handleToggle = (key: keyof NotificationPreferences) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    saveNotificationPrefs(updated);
    onPrefsChanged?.();
  };

  const handleRequestPermission = async () => {
    const granted = await requestPermission();
    setPermission(granted ? 'granted' : 'denied');
    if (granted) {
      const updated = { ...prefs, enabled: true };
      setPrefs(updated);
      saveNotificationPrefs(updated);
      onPrefsChanged?.();
    }
  };

  const toggleClass = (on: boolean) => `notif-toggle ${on ? 'on' : 'off'}`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Settings</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body modal-body-pad">
          {permission === 'unsupported' ? (
            <p className="text-primary">
              Your browser does not support notifications.
            </p>
          ) : permission === 'denied' ? (
            <div>
              <p className="text-primary mb-8">
                Notifications are blocked by your browser. Please enable them in your browser settings.
              </p>
            </div>
          ) : permission !== 'granted' ? (
            <div className="mb-16">
              <p className="text-primary mb-12">
                Allow notifications to get alerts for new messages and requests.
              </p>
              <button className="profile-action-btn" onClick={handleRequestPermission}>
                Enable Notifications
              </button>
            </div>
          ) : null}

          {(permission === 'granted' || permission === 'default') && (
            <>
              <div className="notif-setting-row">
                <div className="notif-setting-info">
                  <span className="notif-setting-label">Notifications</span>
                  <span className="notif-setting-desc">Master toggle for all notifications</span>
                </div>
                <button className={toggleClass(prefs.enabled)} onClick={() => handleToggle('enabled')} role="switch" aria-checked={prefs.enabled ? 'true' : 'false'} aria-label="Notifications">
                  <span className="notif-toggle-thumb" />
                </button>
              </div>

              {prefs.enabled && (
                <>
                  <div className="notif-setting-row">
                    <div className="notif-setting-info">
                      <span className="notif-setting-label">Messages</span>
                      <span className="notif-setting-desc">New messages in chats</span>
                    </div>
                    <button className={toggleClass(prefs.messages)} onClick={() => handleToggle('messages')} role="switch" aria-checked={prefs.messages ? 'true' : 'false'} aria-label="Messages">
                      <span className="notif-toggle-thumb" />
                    </button>
                  </div>

                  <div className="notif-setting-row">
                    <div className="notif-setting-info">
                      <span className="notif-setting-label">Group Invites</span>
                      <span className="notif-setting-desc">When someone invites you to a group</span>
                    </div>
                    <button className={toggleClass(prefs.groupInvites)} onClick={() => handleToggle('groupInvites')} role="switch" aria-checked={prefs.groupInvites ? 'true' : 'false'} aria-label="Group Invites">
                      <span className="notif-toggle-thumb" />
                    </button>
                  </div>

                  <div className="notif-setting-row">
                    <div className="notif-setting-info">
                      <span className="notif-setting-label">Join Requests</span>
                      <span className="notif-setting-desc">When someone wants to join your group</span>
                    </div>
                    <button className={toggleClass(prefs.joinRequests)} onClick={() => handleToggle('joinRequests')} role="switch" aria-checked={prefs.joinRequests ? 'true' : 'false'} aria-label="Join Requests">
                      <span className="notif-toggle-thumb" />
                    </button>
                  </div>

                  <div className="notif-setting-row">
                    <div className="notif-setting-info">
                      <span className="notif-setting-label">Contact Requests</span>
                      <span className="notif-setting-desc">When someone sends you a friend request</span>
                    </div>
                    <button className={toggleClass(prefs.contactRequests)} onClick={() => handleToggle('contactRequests')} role="switch" aria-checked={prefs.contactRequests ? 'true' : 'false'} aria-label="Contact Requests">
                      <span className="notif-toggle-thumb" />
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* Divider */}
          <div className="border-top my-16" />

          {/* Encryption section */}
          <h4 className="text-accent section-title">Encryption</h4>
          <div className="notif-setting-row">
            <div className="notif-setting-info">
              <span className="notif-setting-label">E2EE Keys</span>
              <span className="notif-setting-desc">
                {cryptoKeys
                  ? 'Encryption keys are active'
                  : needsKeyRecovery
                    ? 'Keys need to be unlocked with your password'
                    : 'No encryption keys — sign out and back in to generate'}
              </span>
            </div>
            {!cryptoKeys && needsKeyRecovery && (
              <button className="profile-action-btn btn-unlock" onClick={() => setShowKeyRecovery(true)}>
                Unlock
              </button>
            )}
          </div>
        </div>
        {showKeyRecovery && (
          <KeyRecoveryModal
            onRecover={async (pw) => { await recoverKeys(pw); setShowKeyRecovery(false); }}
            onSkip={() => setShowKeyRecovery(false)}
          />
        )}
      </div>
    </div>
  );
};
