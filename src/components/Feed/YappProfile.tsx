import React, { useEffect, useState, useMemo } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../../firebase';
import {
  useUserYapps,
  useFollowing,
  useFollowerCount,
  useFollowingCount,
  useContacts,
  followUser,
  unfollowUser,
} from '../../hooks/useYapps';
import { useBlockedUsers, useBlockedByUsers, blockUser, unblockUser } from '../../hooks/useBlockedUsers';
import { YappCard } from './YappCard';
import type { Yapp, UserProfile as UserProfileType } from '../../types';

interface Props {
  uid: string;
  currentUser: UserProfileType;
  onBack: () => void;
  onOpenThread?: (yapp: Yapp) => void;
  onOpenProfile?: (uid: string) => void;
}

export const YappProfile: React.FC<Props> = ({ uid, currentUser, onBack, onOpenThread, onOpenProfile }) => {
  const [profile, setProfile] = useState<UserProfileType | null>(null);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const { yapps, loading } = useUserYapps(uid);
  const following = useFollowing(currentUser.uid);
  const contacts = useContacts(currentUser.uid);
  const followerCount = useFollowerCount(uid);
  const followingCount = useFollowingCount(uid);
  const blockedUsers = useBlockedUsers(currentUser.uid);
  const blockedBy = useBlockedByUsers(currentUser.uid);
  const isFollowing = following.has(uid);
  const isSelf = uid === currentUser.uid;
  const isBlockedByMe = blockedUsers.has(uid);
  const isBlockedByThem = blockedBy.has(uid);
  const isContact = contacts.has(uid);

  // Filter yapps by privacy: self sees all, contacts see all, others see only public
  const visibleYapps = useMemo(() => {
    if (isSelf || isContact) return yapps;
    return yapps.filter((y) => (y.privacy ?? 'public') === 'public');
  }, [yapps, isSelf, isContact]);

  useEffect(() => {
    const userRef = ref(db, `users/${uid}`);
    const unsub = onValue(userRef, (snap) => {
      if (snap.exists()) setProfile(snap.val() as UserProfileType);
    });
    return () => unsub();
  }, [uid]);

  const handleToggleFollow = async () => {
    if (isBlockedByMe || isBlockedByThem) return;
    if (isFollowing) {
      await unfollowUser(currentUser.uid, uid);
    } else {
      await followUser(currentUser.uid, uid);
    }
  };

  const handleToggleBlock = async () => {
    if (isBlockedByMe) {
      await unblockUser(currentUser.uid, uid);
    } else {
      setShowBlockConfirm(true);
    }
  };

  const confirmBlock = async () => {
    await blockUser(currentUser.uid, uid);
    setShowBlockConfirm(false);
  };

  if (!profile) return <div className="feed-loading">Loading profile...</div>;

  return (
    <div className="yapp-user-profile">
      <header className="yapp-profile-header">
        <button className="icon-btn" onClick={onBack} title="Back" aria-label="Back">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        </button>
        <h2>{profile.displayName}</h2>
      </header>
      <div className="yapp-profile-info">
        <div className="yapp-profile-avatar">
          {profile.photoURL
            ? <img src={profile.photoURL} alt="" className="avatar-img" />
            : <span>{profile.displayName.charAt(0).toUpperCase()}</span>
          }
        </div>
        <div className="yapp-profile-details">
          <h3>{profile.displayName}</h3>
          {profile.status && <p className="yapp-profile-status">{profile.status}</p>}
          <div className="yapp-profile-stats">
            <span><strong>{visibleYapps.length}</strong> Yapps</span>
            <span><strong>{followerCount}</strong> Followers</span>
            <span><strong>{followingCount}</strong> Following</span>
          </div>
        </div>
        {!isSelf && (
          <div className="yapp-profile-actions">
            {!isBlockedByMe && !isBlockedByThem && (
              <button
                className={`yapp-btn ${isFollowing ? 'yapp-btn-secondary' : 'yapp-btn-primary'}`}
                onClick={handleToggleFollow}
              >
                {isFollowing ? 'Unfollow' : 'Follow'}
              </button>
            )}
            <button
              className={`yapp-btn ${isBlockedByMe ? 'yapp-btn-danger' : 'yapp-btn-secondary'}`}
              onClick={handleToggleBlock}
            >
              {isBlockedByMe ? 'Unblock' : 'Block'}
            </button>
          </div>
        )}
        {isBlockedByThem && !isBlockedByMe && (
          <p className="yapp-profile-blocked-msg">You cannot interact with this user.</p>
        )}
      </div>

      {/* Block confirmation modal */}
      {showBlockConfirm && (
        <div className="modal-overlay" onClick={() => setShowBlockConfirm(false)}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Block {profile?.displayName}?</h3>
              <button className="modal-close" onClick={() => setShowBlockConfirm(false)}>×</button>
            </div>
            <div className="modal-body modal-body-pad">
              <p className="block-confirm-text">
                They won't be able to follow you, send you contact requests, or see your yapps.
                They will also be removed from your contacts and followers.
              </p>
              <div className="block-confirm-actions">
                <button className="yapp-btn yapp-btn-secondary" onClick={() => setShowBlockConfirm(false)}>Cancel</button>
                <button className="yapp-btn yapp-btn-danger" onClick={confirmBlock}>Block</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="yapp-profile-feed">
        {loading ? (
          <div className="feed-loading">Loading yapps...</div>
        ) : visibleYapps.length === 0 ? (
          <div className="feed-empty">
            <p>{isSelf ? "You haven't yapped yet!" : `${profile.displayName} hasn't yapped yet.`}</p>
          </div>
        ) : (
          visibleYapps.map((y) => (
            <YappCard
              key={y.id}
              yapp={y}
              currentUser={currentUser}
              onOpenThread={onOpenThread}
              onOpenProfile={onOpenProfile}
            />
          ))
        )}
      </div>
    </div>
  );
};
