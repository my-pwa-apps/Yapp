import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { AvatarPicker } from './AvatarPicker';
import { MFASetup } from './MFASetup';
import type { UserProfile } from '../../types';

interface Props {
  profile: UserProfile;
  onClose: () => void;
}

export const ProfilePanel: React.FC<Props> = ({ profile, onClose }) => {
  const { updateStatus, updateDisplayName, updatePhotoURL, changePassword, isMFAEnabled } = useAuth();
  const [editing, setEditing] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [status, setStatus] = useState(profile.status);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [showMFASetup, setShowMFASetup] = useState(false);

  // Password form state
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  const handleSaveStatus = async () => {
    await updateStatus(status);
    setEditing(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');
    if (newPw.length < 6) { setPwError('New password must be at least 6 characters'); return; }
    if (newPw !== confirmPw) { setPwError('New passwords do not match'); return; }
    setPwLoading(true);
    try {
      await changePassword(currentPw, newPw);
      setPwSuccess('Password changed successfully!');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setTimeout(() => { setPwSuccess(''); setShowPasswordForm(false); }, 2000);
    } catch (err: any) {
      const code = err?.code;
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setPwError('Current password is incorrect');
      } else if (code === 'auth/weak-password') {
        setPwError('New password is too weak');
      } else {
        setPwError(err?.message || 'Failed to change password');
      }
    }
    setPwLoading(false);
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
          {/* Avatar */}
          <div
            className="profile-avatar-large clickable"
            onClick={() => setShowAvatarPicker(true)}
            title="Change profile picture"
          >
            {profile.photoURL ? (
              <img src={profile.photoURL} alt="avatar" className="profile-avatar-img" />
            ) : (
              profile.displayName.charAt(0).toUpperCase()
            )}
            <div className="avatar-edit-overlay">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
              <span style={{ fontSize: '0.7rem' }}>CHANGE</span>
            </div>
          </div>

          <div className="profile-field">
            <label>Your Name</label>
            {editingName ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="modal-input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && displayName.trim() && (async () => { await updateDisplayName(displayName.trim()); setEditingName(false); })()}
                  autoFocus
                  maxLength={30}
                />
                <button className="send-btn" onClick={async () => { if (displayName.trim()) { await updateDisplayName(displayName.trim()); setEditingName(false); } }} style={{ width: 36, height: 36 }}>
                  ✓
                </button>
              </div>
            ) : (
              <p onClick={() => setEditingName(true)} style={{ cursor: 'pointer' }} title="Click to edit">
                {profile.displayName} <span style={{ fontSize: '0.75rem', color: '#8696A0' }}>✏️</span>
              </p>
            )}
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
              <p onClick={() => setEditing(true)} style={{ cursor: 'pointer' }} title="Click to edit">
                {profile.status}
              </p>
            )}
          </div>

          {/* Security section */}
          <div className="profile-section-label">Security</div>

          {/* Change password */}
          {showPasswordForm ? (
            <form onSubmit={handleChangePassword} className="profile-security-form">
              <input
                type="password" placeholder="Current password" className="modal-input"
                value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} required
              />
              <input
                type="password" placeholder="New password" className="modal-input"
                value={newPw} onChange={(e) => setNewPw(e.target.value)} required minLength={6}
              />
              <input
                type="password" placeholder="Confirm new password" className="modal-input"
                value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} required minLength={6}
              />
              {pwError && <p className="login-error" style={{ margin: '4px 0' }}>{pwError}</p>}
              {pwSuccess && <p className="modal-success">{pwSuccess}</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="profile-action-btn" disabled={pwLoading}>
                  {pwLoading ? 'Changing...' : 'Change Password'}
                </button>
                <button type="button" className="profile-action-btn secondary" onClick={() => setShowPasswordForm(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button className="profile-action-btn" onClick={() => setShowPasswordForm(true)}>
              🔑 Change Password
            </button>
          )}

          {/* MFA toggle */}
          <button className="profile-action-btn" onClick={() => setShowMFASetup(true)} style={{ marginTop: 8 }}>
            🔐 {isMFAEnabled ? 'Manage' : 'Enable'} Two-Factor Auth
          </button>
        </div>
      </div>

      {showAvatarPicker && (
        <AvatarPicker
          currentPhotoURL={profile.photoURL}
          displayName={profile.displayName}
          onSelect={async (url) => {
            await updatePhotoURL(url);
            setShowAvatarPicker(false);
          }}
          onClose={() => setShowAvatarPicker(false)}
        />
      )}

      {showMFASetup && (
        <MFASetup
          onClose={() => setShowMFASetup(false)}
        />
      )}
    </div>
  );
};
