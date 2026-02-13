import React, { useEffect, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../../firebase';
import {
  membersToArray,
  isGroupAdmin,
  searchUsers,
  removeGroupMember,
  leaveGroup,
  inviteToGroup,
  approvePendingMember,
  rejectPendingMember,
} from '../../hooks/useChats';
import type { Chat, UserProfile, PendingMember } from '../../types';

interface Props {
  chat: Chat;
  currentUid: string;
  currentName: string;
  onClose: () => void;
  onLeft: () => void; // called when user leaves the group
}

export const GroupInfoPanel: React.FC<Props> = ({ chat, currentUid, currentName, onClose, onLeft }) => {
  const [memberProfiles, setMemberProfiles] = useState<Record<string, UserProfile>>({});
  const [showAddMember, setShowAddMember] = useState(false);
  const [searchEmail, setSearchEmail] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const members = membersToArray(chat.members);
  const isAdmin = isGroupAdmin(chat, currentUid);
  const pendingMembers = chat.pendingMembers || {};

  // Live-listen for member profiles
  useEffect(() => {
    const allUids = [...members, ...Object.keys(pendingMembers)];
    const unsubs: (() => void)[] = [];

    allUids.forEach((uid) => {
      const userRef = ref(db, `users/${uid}`);
      const unsub = onValue(userRef, (snap) => {
        if (snap.exists()) {
          setMemberProfiles((prev) => ({ ...prev, [uid]: snap.val() as UserProfile }));
        }
      });
      unsubs.push(unsub);
    });

    return () => unsubs.forEach((u) => u());
  }, [chat.members, chat.pendingMembers]);

  const handleSearch = async () => {
    if (!searchEmail.trim()) return;
    setSearching(true);
    const results = await searchUsers(searchEmail.trim().toLowerCase(), currentUid);
    // Filter out existing members and pending
    const filtered = results.filter(
      (u) => !chat.members[u.uid] && !pendingMembers[u.uid]
    );
    setSearchResults(filtered);
    setSearching(false);
  };

  const handleInvite = async (user: UserProfile) => {
    setActionLoading(user.uid);
    try {
      await inviteToGroup(chat.id, user.uid, currentUid, currentName);
      setSearchResults((prev) => prev.filter((u) => u.uid !== user.uid));
    } catch (e) {
      console.error('Failed to invite:', e);
    }
    setActionLoading(null);
  };

  const handleRemove = async (uid: string) => {
    const name = memberProfiles[uid]?.displayName || 'Unknown';
    if (!confirm(`Remove ${name} from this group?`)) return;
    setActionLoading(uid);
    try {
      await removeGroupMember(chat.id, uid, currentName, name);
    } catch (e) {
      console.error('Failed to remove:', e);
    }
    setActionLoading(null);
  };

  const handleLeave = async () => {
    if (!confirm('Leave this group?')) return;
    setActionLoading('leave');
    try {
      await leaveGroup(chat.id, currentUid, currentName);
      onLeft();
    } catch (e) {
      console.error('Failed to leave:', e);
    }
    setActionLoading(null);
  };

  const handleApprove = async (uid: string) => {
    const name = memberProfiles[uid]?.displayName || pendingMembers[uid]?.fromName || 'User';
    setActionLoading(uid);
    try {
      await approvePendingMember(chat.id, uid, currentName, name);
    } catch (e) {
      console.error('Failed to approve:', e);
    }
    setActionLoading(null);
  };

  const handleReject = async (uid: string) => {
    setActionLoading(uid);
    try {
      await rejectPendingMember(chat.id, uid);
    } catch (e) {
      console.error('Failed to reject:', e);
    }
    setActionLoading(null);
  };

  // Pending invites for the current user (they were invited by admin)
  const myPendingInvite = pendingMembers[currentUid]?.type === 'invite' ? pendingMembers[currentUid] : null;

  // Join requests that admins need to approve
  const joinRequests = Object.entries(pendingMembers).filter(
    ([, pm]) => pm.type === 'request'
  );

  // Pending invites sent by admin (waiting for user acceptance)
  const pendingInvites = Object.entries(pendingMembers).filter(
    ([, pm]) => pm.type === 'invite'
  );

  return (
    <div className="profile-overlay" onClick={onClose}>
      <div className="profile-panel" onClick={(e) => e.stopPropagation()}>
        <div className="profile-header">
          <button className="back-btn d-flex" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
            </svg>
          </button>
          <h3>Group Info</h3>
        </div>

        <div className="profile-content" style={{ overflowY: 'auto' }}>
          {/* Group avatar + name */}
          <div className="profile-avatar-large">
            {chat.name?.charAt(0).toUpperCase() || 'G'}
          </div>
          <div className="profile-field">
            <label>Group Name</label>
            <p>{chat.name || 'Group'}</p>
          </div>
          <div className="profile-field">
            <label>Members ({members.length})</label>
          </div>

          {/* Members list */}
          <div className="group-members-list">
            {members.map((uid) => {
              const p = memberProfiles[uid];
              const isAdminMember = isGroupAdmin(chat, uid);
              return (
                <div key={uid} className="group-member-item">
                  <div className="avatar avatar-sm">
                    {p?.photoURL
                      ? <img src={p.photoURL} alt="" className="avatar-img" />
                      : (p?.displayName?.charAt(0).toUpperCase() || '?')
                    }
                  </div>
                  <div className="group-member-info">
                    <span className="group-member-name">
                      {p?.displayName || uid}
                      {uid === currentUid && ' (You)'}
                    </span>
                    {isAdminMember && <span className="group-admin-badge">Admin</span>}
                    {p && <span className="group-member-status">{p.online ? 'online' : 'offline'}</span>}
                  </div>
                  {/* Remove button (admin only, can't remove self here) */}
                  {isAdmin && uid !== currentUid && (
                    <button
                      className="group-action-btn remove"
                      onClick={() => handleRemove(uid)}
                      disabled={actionLoading === uid}
                      title="Remove from group"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pending: join requests (admin sees these) */}
          {isAdmin && joinRequests.length > 0 && (
            <>
              <div className="profile-section-label">Join Requests</div>
              <div className="group-members-list">
                {joinRequests.map(([uid, pm]) => {
                  const p = memberProfiles[uid];
                  return (
                    <div key={uid} className="group-member-item">
                      <div className="avatar avatar-sm">
                        {p?.photoURL
                          ? <img src={p.photoURL} alt="" className="avatar-img" />
                          : (p?.displayName?.charAt(0).toUpperCase() || pm.fromName.charAt(0).toUpperCase())
                        }
                      </div>
                      <div className="group-member-info">
                        <span className="group-member-name">{p?.displayName || pm.fromName}</span>
                        <span className="group-member-status">Wants to join</span>
                      </div>
                      <div className="d-flex gap-4">
                        <button
                          className="group-action-btn approve"
                          onClick={() => handleApprove(uid)}
                          disabled={actionLoading === uid}
                          title="Approve"
                        >
                          ✓
                        </button>
                        <button
                          className="group-action-btn remove"
                          onClick={() => handleReject(uid)}
                          disabled={actionLoading === uid}
                          title="Reject"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Pending invites sent (admin sees who's been invited) */}
          {isAdmin && pendingInvites.length > 0 && (
            <>
              <div className="profile-section-label">Pending Invites</div>
              <div className="group-members-list">
                {pendingInvites.map(([uid, pm]) => {
                  const p = memberProfiles[uid];
                  return (
                    <div key={uid} className="group-member-item">
                      <div className="avatar avatar-sm">
                        {p?.photoURL
                          ? <img src={p.photoURL} alt="" className="avatar-img" />
                          : (p?.displayName?.charAt(0).toUpperCase() || pm.fromName.charAt(0).toUpperCase())
                        }
                      </div>
                      <div className="group-member-info">
                        <span className="group-member-name">{p?.displayName || 'Invited user'}</span>
                        <span className="group-member-status">Awaiting acceptance</span>
                      </div>
                      <button
                        className="group-action-btn remove"
                        onClick={() => handleReject(uid)}
                        disabled={actionLoading === uid}
                        title="Cancel invite"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Add member (admin only) */}
          {isAdmin && (
            <>
              <div className="profile-section-label">Add Member</div>
              {showAddMember ? (
                <div className="group-add-member">
                  <div className="d-flex gap-8">
                    <input
                      className="modal-input"
                      placeholder="Search by email"
                      value={searchEmail}
                      onChange={(e) => setSearchEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      autoFocus
                    />
                    <button
                      className="profile-action-btn nowrap"
                      onClick={handleSearch}
                      disabled={searching}
                    >
                      {searching ? '...' : 'Search'}
                    </button>
                  </div>
                  {searchResults.map((user) => (
                    <div key={user.uid} className="group-member-item mt-8">
                      <div className="avatar avatar-sm">
                        {user.photoURL
                          ? <img src={user.photoURL} alt="" className="avatar-img" />
                          : user.displayName.charAt(0).toUpperCase()
                        }
                      </div>
                      <div className="group-member-info">
                        <span className="group-member-name">{user.displayName}</span>
                        <span className="group-member-status">{user.email}</span>
                      </div>
                      <button
                        className="group-action-btn approve"
                        onClick={() => handleInvite(user)}
                        disabled={actionLoading === user.uid}
                        title="Invite to group"
                      >
                        +
                      </button>
                    </div>
                  ))}
                  {searchResults.length === 0 && searchEmail && !searching && (
                    <p className="text-secondary text-sm mt-8">
                      No users found (or already members)
                    </p>
                  )}
                  <button
                    className="profile-action-btn secondary mt-8"
                    onClick={() => { setShowAddMember(false); setSearchResults([]); setSearchEmail(''); }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button className="profile-action-btn" onClick={() => setShowAddMember(true)}>
                  ➕ Invite Member
                </button>
              )}
            </>
          )}

          {/* Leave group */}
          <div className="mt-24 pt-16 border-top">
            <button
              className="profile-action-btn btn-danger"
              onClick={handleLeave}
              disabled={actionLoading === 'leave'}
            >
              🚪 {actionLoading === 'leave' ? 'Leaving...' : 'Leave Group'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
