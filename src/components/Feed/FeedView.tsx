import React, { useState, useMemo } from 'react';
import { useYapps, useFollowing, postYapp } from '../../hooks/useYapps';
import { YappCard } from './YappCard';
import { YappComposer } from './YappComposer';
import { YappThread } from './YappThread';
import { YappProfile } from './YappProfile';
import type { Yapp, UserProfile } from '../../types';
import './FeedView.css';

type FeedTab = 'all' | 'following';

interface Props {
  currentUser: UserProfile;
}

export const FeedView: React.FC<Props> = ({ currentUser }) => {
  const { yapps, loading } = useYapps(currentUser.uid);
  const following = useFollowing(currentUser.uid);
  const [tab, setTab] = useState<FeedTab>('all');
  const [threadYapp, setThreadYapp] = useState<Yapp | null>(null);
  const [profileUid, setProfileUid] = useState<string | null>(null);

  const filteredYapps = useMemo(() => {
    if (tab === 'all') return yapps;
    return yapps.filter((y) => following.has(y.authorId) || y.authorId === currentUser.uid);
  }, [yapps, tab, following, currentUser.uid]);

  const handlePost = async (text: string, mediaURL?: string, mediaType?: 'image' | 'gif') => {
    await postYapp(currentUser.uid, currentUser.displayName, currentUser.photoURL, text, mediaURL, mediaType);
  };

  // Profile sub-view
  if (profileUid) {
    return (
      <YappProfile
        uid={profileUid}
        currentUser={currentUser}
        onBack={() => setProfileUid(null)}
        onOpenThread={(y) => { setProfileUid(null); setThreadYapp(y); }}
      />
    );
  }

  // Thread sub-view
  if (threadYapp) {
    return (
      <YappThread
        yapp={threadYapp}
        currentUser={currentUser}
        onBack={() => setThreadYapp(null)}
        onOpenProfile={(uid) => { setThreadYapp(null); setProfileUid(uid); }}
      />
    );
  }

  return (
    <div className="feed-view">
      <header className="feed-header">
        <h1 className="feed-title">Yappin'</h1>
        <div className="feed-tabs">
          <button
            className={`feed-tab ${tab === 'all' ? 'active' : ''}`}
            onClick={() => setTab('all')}
          >
            For You
          </button>
          <button
            className={`feed-tab ${tab === 'following' ? 'active' : ''}`}
            onClick={() => setTab('following')}
          >
            Following
          </button>
        </div>
      </header>

      <div className="feed-scroll">
        {/* Composer */}
        <div className="feed-composer-wrap">
          <div className="feed-composer-avatar">
            {currentUser.photoURL
              ? <img src={currentUser.photoURL} alt="" className="avatar-img" />
              : <span>{currentUser.displayName.charAt(0).toUpperCase()}</span>
            }
          </div>
          <div className="feed-composer-body">
            <YappComposer onPost={handlePost} />
          </div>
        </div>

        {/* Feed */}
        {loading ? (
          <div className="feed-loading">
            <div className="feed-spinner" />
            Loading yapps...
          </div>
        ) : filteredYapps.length === 0 ? (
          <div className="feed-empty">
            {tab === 'following' ? (
              <>
                <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor" opacity="0.3"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
                <p>Follow people to see their yapps here</p>
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor" opacity="0.3"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/></svg>
                <p>No yapps yet. Be the first to yapp!</p>
              </>
            )}
          </div>
        ) : (
          filteredYapps.map((y) => (
            <YappCard
              key={y.id}
              yapp={y}
              currentUser={currentUser}
              onOpenThread={setThreadYapp}
              onOpenProfile={setProfileUid}
            />
          ))
        )}
      </div>
    </div>
  );
};
