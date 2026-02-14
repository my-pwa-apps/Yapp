import React, { useState, useEffect } from 'react';
import { useYappsSettings, saveYappsSettings, type YappsSettings as YappsSettingsType } from '../../hooks/useYappsSettings';

interface Props {
  uid: string;
  onClose: () => void;
}

export const YappsSettings: React.FC<Props> = ({ uid, onClose }) => {
  const { settings, loading } = useYappsSettings(uid);
  const [local, setLocal] = useState<YappsSettingsType>(settings);

  useEffect(() => {
    if (!loading) setLocal(settings);
  }, [settings, loading]);

  const handleToggle = (key: keyof YappsSettingsType) => {
    const updated = { ...local, [key]: !local[key] };
    setLocal(updated);
    saveYappsSettings(uid, updated);
  };

  const toggleClass = (on: boolean) => `notif-toggle ${on ? 'on' : 'off'}`;

  const Toggle: React.FC<{ field: keyof YappsSettingsType; label: string }> = ({ field, label }) => (
    <button
      className={toggleClass(local[field] as boolean)}
      onClick={() => handleToggle(field)}
      role="switch"
      aria-checked={local[field] ? 'true' : 'false'}
      aria-label={label}
    >
      <span className="notif-toggle-thumb" />
    </button>
  );

  if (loading) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Yapps Settings</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body modal-body-pad">

          {/* ── Notifications Section ── */}
          <h4 className="text-accent section-title">Notifications</h4>

          <div className="notif-setting-row">
            <div className="notif-setting-info">
              <span className="notif-setting-label">New Yapps from Followed</span>
              <span className="notif-setting-desc">Get notified when people you follow post</span>
            </div>
            <Toggle field="notifyFollowedPosts" label="New Yapps from Followed" />
          </div>

          <div className="notif-setting-row">
            <div className="notif-setting-info">
              <span className="notif-setting-label">Replies</span>
              <span className="notif-setting-desc">When someone replies to your yapps</span>
            </div>
            <Toggle field="notifyReplies" label="Replies" />
          </div>

          <div className="notif-setting-row">
            <div className="notif-setting-info">
              <span className="notif-setting-label">Likes</span>
              <span className="notif-setting-desc">When someone likes your yapps</span>
            </div>
            <Toggle field="notifyLikes" label="Likes" />
          </div>

          <div className="notif-setting-row">
            <div className="notif-setting-info">
              <span className="notif-setting-label">Reyapps</span>
              <span className="notif-setting-desc">When someone reyapps your post</span>
            </div>
            <Toggle field="notifyReyapps" label="Reyapps" />
          </div>

          <div className="notif-setting-row">
            <div className="notif-setting-info">
              <span className="notif-setting-label">New Followers</span>
              <span className="notif-setting-desc">When someone starts following you</span>
            </div>
            <Toggle field="notifyNewFollowers" label="New Followers" />
          </div>

          {/* ── Feed Preferences Section ── */}
          <div className="border-top my-16" />
          <h4 className="text-accent section-title">Feed Preferences</h4>

          <div className="notif-setting-row">
            <div className="notif-setting-info">
              <span className="notif-setting-label">Auto-expand Threads</span>
              <span className="notif-setting-desc">Automatically show inline replies on yapps</span>
            </div>
            <Toggle field="autoExpandThreads" label="Auto-expand Threads" />
          </div>

          <div className="notif-setting-row">
            <div className="notif-setting-info">
              <span className="notif-setting-label">Show Reyapps</span>
              <span className="notif-setting-desc">Display reyapped posts in your feed</span>
            </div>
            <Toggle field="showReyapps" label="Show Reyapps" />
          </div>

          <div className="notif-setting-row">
            <div className="notif-setting-info">
              <span className="notif-setting-label">Auto-follow Contacts</span>
              <span className="notif-setting-desc">Automatically follow your contacts on the feed</span>
            </div>
            <Toggle field="autoFollowContacts" label="Auto-follow Contacts" />
          </div>

        </div>
      </div>
    </div>
  );
};
