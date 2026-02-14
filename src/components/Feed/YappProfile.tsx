import React, { useEffect, useState, useRef } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../../firebase';
import {
  useUserYapps,
  useFollowing,
  useFollowerCount,
  followUser,
  unfollowUser,
} from '../../hooks/useYapps';
import { YappCard } from './YappCard';
import type { Yapp, UserProfile as UserProfileType } from '../../types';

interface Props {
  uid: string;
  currentUser: UserProfileType;
  onBack: () => void;
  onOpenThread?: (yapp: Yapp) => void;
}

export const YappProfile: React.FC<Props> = ({ uid, currentUser, onBack, onOpenThread }) => {
  const [profile, setProfile] = useState<UserProfileType | null>(null);
  const { yapps, loading } = useUserYapps(uid);
  const following = useFollowing(currentUser.uid);
  const followerCount = useFollowerCount(uid);
  const isFollowing = following.has(uid);
  const isSelf = uid === currentUser.uid;

  useEffect(() => {
    const userRef = ref(db, `users/${uid}`);
    const unsub = onValue(userRef, (snap) => {
      if (snap.exists()) setProfile(snap.val() as UserProfileType);
    });
    return () => unsub();
  }, [uid]);

  const handleToggleFollow = async () => {
    if (isFollowing) {
      await unfollowUser(currentUser.uid, uid);
    } else {
      await followUser(currentUser.uid, uid);
    }
  };

  if (!profile) return <div className="feed-loading">Loading profile...</div>;

  return (
    <div className="yapp-user-profile">
      <header className="yapp-profile-header">
        <button className="icon-btn" onClick={onBack}>
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
            <span><strong>{yapps.length}</strong> Yapps</span>
            <span><strong>{followerCount}</strong> Followers</span>
            <span><strong>{following.size}</strong> Following</span>
          </div>
        </div>
        {!isSelf && (
          <button
            className={`yapp-btn ${isFollowing ? 'yapp-btn-secondary' : 'yapp-btn-primary'}`}
            onClick={handleToggleFollow}
          >
            {isFollowing ? 'Unfollow' : 'Follow'}
          </button>
        )}
      </div>
      <div className="yapp-profile-feed">
        {loading ? (
          <div className="feed-loading">Loading yapps...</div>
        ) : yapps.length === 0 ? (
          <div className="feed-empty">
            <p>{isSelf ? "You haven't yapped yet!" : `${profile.displayName} hasn't yapped yet.`}</p>
          </div>
        ) : (
          yapps.map((y) => (
            <YappCard
              key={y.id}
              yapp={y}
              currentUser={currentUser}
              onOpenThread={onOpenThread}
            />
          ))
        )}
      </div>
    </div>
  );
};
