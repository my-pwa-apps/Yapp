import React, { useEffect, useState } from 'react';
import {
  getNotificationPrefs,
  saveNotificationPrefs,
  getPermissionState,
  requestPermission,
  type NotificationPreferences,
} from '../../hooks/useNotifications';
import { getScrollBehaviorPref, setScrollBehaviorPref, type ScrollBehaviorPref } from './ChatWindow';

interface Props {
  onClose: () => void;
  onPrefsChanged?: () => void;
}

export const NotificationSettings: React.FC<Props> = ({ onClose, onPrefsChanged }) => {
  const [prefs, setPrefs] = useState<NotificationPreferences>(getNotificationPrefs());
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(getPermissionState());
  const [scrollBehavior, setScrollBehavior] = useState<ScrollBehaviorPref>(getScrollBehaviorPref());

  useEffect(() => {
    setPermission(getPermissionState());
  }, []);

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
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-header">
          <h3>⚙️ Settings</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ padding: '16px 24px' }}>
          {permission === 'unsupported' ? (
            <p style={{ color: '#E9EDEF' }}>
              Your browser does not support notifications.
            </p>
          ) : permission === 'denied' ? (
            <div>
              <p style={{ color: '#E9EDEF', margin: '0 0 8px' }}>
                Notifications are blocked by your browser. Please enable them in your browser settings.
              </p>
            </div>
          ) : permission !== 'granted' ? (
            <div style={{ marginBottom: 16 }}>
              <p style={{ color: '#E9EDEF', margin: '0 0 12px' }}>
                Allow notifications to get alerts for new messages and requests.
              </p>
              <button className="profile-action-btn" onClick={handleRequestPermission}>
                🔔 Enable Notifications
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
                <button className={toggleClass(prefs.enabled)} onClick={() => handleToggle('enabled')}>
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
                    <button className={toggleClass(prefs.messages)} onClick={() => handleToggle('messages')}>
                      <span className="notif-toggle-thumb" />
                    </button>
                  </div>

                  <div className="notif-setting-row">
                    <div className="notif-setting-info">
                      <span className="notif-setting-label">Group Invites</span>
                      <span className="notif-setting-desc">When someone invites you to a group</span>
                    </div>
                    <button className={toggleClass(prefs.groupInvites)} onClick={() => handleToggle('groupInvites')}>
                      <span className="notif-toggle-thumb" />
                    </button>
                  </div>

                  <div className="notif-setting-row">
                    <div className="notif-setting-info">
                      <span className="notif-setting-label">Join Requests</span>
                      <span className="notif-setting-desc">When someone wants to join your group</span>
                    </div>
                    <button className={toggleClass(prefs.joinRequests)} onClick={() => handleToggle('joinRequests')}>
                      <span className="notif-toggle-thumb" />
                    </button>
                  </div>

                  <div className="notif-setting-row">
                    <div className="notif-setting-info">
                      <span className="notif-setting-label">Contact Requests</span>
                      <span className="notif-setting-desc">When someone sends you a friend request</span>
                    </div>
                    <button className={toggleClass(prefs.contactRequests)} onClick={() => handleToggle('contactRequests')}>
                      <span className="notif-toggle-thumb" />
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* Divider */}
          <div style={{ borderTop: '1px solid #2A3942', margin: '16px 0' }} />

          {/* Chat behavior section */}
          <h4 style={{ color: '#65a30d', fontSize: 14, margin: '0 0 12px', fontWeight: 600 }}>Chat Behavior</h4>
          <div className="notif-setting-row">
            <div className="notif-setting-info">
              <span className="notif-setting-label">Open chats at</span>
              <span className="notif-setting-desc">
                {scrollBehavior === 'most-recent' ? 'Always scroll to the newest message' : 'Return to where you left off'}
              </span>
            </div>
            <select
              className="scroll-behavior-select"
              value={scrollBehavior}
              onChange={(e) => {
                const val = e.target.value as ScrollBehaviorPref;
                setScrollBehavior(val);
                setScrollBehaviorPref(val);
              }}
            >
              <option value="most-recent">Most recent</option>
              <option value="left-off">Where I left off</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};
