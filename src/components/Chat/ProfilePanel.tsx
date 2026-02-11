import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import type { UserProfile } from '../../types';

interface Props {
  profile: UserProfile;
  onClose: () => void;
}

export const ProfilePanel: React.FC<Props> = ({ profile, onClose }) => {
  const { updateStatus } = useAuth();
  const [editing, setEditing] = React.useState(false);
  const [status, setStatus] = React.useState(profile.status);

  const handleSaveStatus = async () => {
    await updateStatus(status);
    setEditing(false);
  };

  return (
    <div className="profile-overlay" onClick={onClose}>
      <div className="profile-panel" onClick={(e) => e.stopPropagation()}>
        <div className="profile-header">
          <button className="back-btn" onClick={onClose} style={{ display: 'flex' }}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
            </svg>
          </button>
          <h3>Profile</h3>
        </div>
        <div className="profile-content">
          <div className="profile-avatar-large">
            {profile.displayName.charAt(0).toUpperCase()}
          </div>

          <div className="profile-field">
            <label>Your Name</label>
            <p>{profile.displayName}</p>
          </div>

          <div className="profile-field">
            <label>Email</label>
            <p>{profile.email}</p>
          </div>

          <div className="profile-field">
            <label>About</label>
            {editing ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="modal-input"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveStatus()}
                  autoFocus
                />
                <button className="send-btn" onClick={handleSaveStatus} style={{ width: 36, height: 36 }}>
                  ✓
                </button>
              </div>
            ) : (
              <p
                onClick={() => setEditing(true)}
                style={{ cursor: 'pointer' }}
                title="Click to edit"
              >
                {profile.status}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
