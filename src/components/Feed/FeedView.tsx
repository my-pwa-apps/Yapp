import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useYapps, useFollowing, useContacts, followUser, postYapp } from '../../hooks/useYapps';
import { useYappsSettings } from '../../hooks/useYappsSettings';
import { useBlockedUsers, useBlockedByUsers } from '../../hooks/useBlockedUsers';
import { YappCard } from './YappCard';
import { YappComposer } from './YappComposer';
import { YappThread } from './YappThread';
import { YappProfile } from './YappProfile';
import { YappsSettings } from './YappsSettings';
import type { Yapp, UserProfile } from '../../types';
import './FeedView.css';

interface Props {
  currentUser: UserProfile;
}

export const FeedView: React.FC<Props> = ({ currentUser }) => {
  const { yapps, loading } = useYapps(currentUser.uid);
  const following = useFollowing(currentUser.uid);
  const contacts = useContacts(currentUser.uid);
  const { settings: yappsSettings, loading: settingsLoading } = useYappsSettings(currentUser.uid);
  const blockedUsers = useBlockedUsers(currentUser.uid);
  const blockedBy = useBlockedByUsers(currentUser.uid);
  const [showSettings, setShowSettings] = useState(false);
  const [threadStack, setThreadStack] = useState<Yapp[]>([]);
  const [profileUid, setProfileUid] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchActive, setSearchActive] = useState(false);
  const autoFollowedRef = useRef<Set<string>>(new Set());

  // Auto-follow contacts when setting is on
  useEffect(() => {
    if (settingsLoading || !yappsSettings.autoFollowContacts || contacts.size === 0) return;
    contacts.forEach((contactUid) => {
      if (
        !following.has(contactUid) &&
        !blockedUsers.has(contactUid) &&
        !blockedBy.has(contactUid) &&
        !autoFollowedRef.current.has(contactUid)
      ) {
        autoFollowedRef.current.add(contactUid);
        followUser(currentUser.uid, contactUid).catch(() => {});
      }
    });
  }, [contacts, settingsLoading, yappsSettings.autoFollowContacts, following, currentUser.uid, blockedUsers, blockedBy]);

  const threadYapp = threadStack.length > 0 ? threadStack[threadStack.length - 1] : null;

  const pushThread = useCallback((y: Yapp) => setThreadStack((prev) => [...prev, y]), []);
  const popThread = useCallback(() => setThreadStack((prev) => prev.length <= 1 ? [] : prev.slice(0, -1)), []);

  const filteredYapps = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    let result = yapps.filter((y) => {
      // Always exclude blocked users (both directions)
      if (blockedUsers.has(y.authorId) || blockedBy.has(y.authorId)) return false;

      if (q) {
        // Search mode: show all PUBLIC yapps matching query + own matching yapps + contacts-only from contacts
        const matchesQuery = y.text.toLowerCase().includes(q) || y.authorName.toLowerCase().includes(q);
        if (!matchesQuery) return false;
        const privacy = y.privacy ?? 'public';
        if (y.authorId === currentUser.uid) return true;
        if (privacy === 'public') return true;
        if (privacy === 'contacts' && contacts.has(y.authorId)) return true;
        return false;
      } else {
        // Normal feed: show own yapps + yapps from followed users (respecting privacy)
        if (y.authorId === currentUser.uid) return true;
        if (!following.has(y.authorId)) return false;
        const privacy = y.privacy ?? 'public';
        if (privacy === 'public') return true;
        if (privacy === 'contacts' && contacts.has(y.authorId)) return true;
        return false;
      }
    });
    if (!yappsSettings.showReyapps) result = result.filter((y) => !y.reyappOf);
    return result;
  }, [yapps, following, contacts, currentUser.uid, yappsSettings.showReyapps, blockedUsers, blockedBy, searchQuery]);

  const handlePost = async (text: string, mediaURL?: string, mediaType?: 'image' | 'gif' | 'sticker' | 'voice', voiceDuration?: number, privacy?: 'public' | 'contacts') => {
    await postYapp(currentUser.uid, currentUser.displayName, currentUser.photoURL, text, mediaURL, mediaType, undefined, voiceDuration, privacy ?? 'public');
  };

  // Profile sub-view
  if (profileUid) {
    return (
      <YappProfile
        uid={profileUid}
        currentUser={currentUser}
        onBack={() => setProfileUid(null)}
        onOpenThread={(y) => { setProfileUid(null); pushThread(y); }}
        onOpenProfile={(uid) => setProfileUid(uid)}
      />
    );
  }

  // Thread sub-view
  if (threadYapp) {
    return (
      <YappThread
        yapp={threadYapp}
        currentUser={currentUser}
        onBack={popThread}
        onOpenThread={pushThread}
        onOpenProfile={(uid) => { setThreadStack([]); setProfileUid(uid); }}
      />
    );
  }

  return (
    <div className="feed-view">
      <header className="feed-header">
        <div className="feed-title-row">
          {searchActive ? (
            <div className="feed-search-bar">
              <svg className="feed-search-icon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
              <input
                className="feed-search-input"
                type="text"
                placeholder="Search public yapps..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
              <button
                className="icon-btn"
                onClick={() => { setSearchActive(false); setSearchQuery(''); }}
                title="Close search"
                aria-label="Close search"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
              </button>
            </div>
          ) : (
            <>
              <button className="icon-btn feed-search-btn" onClick={() => setSearchActive(true)} title="Search yapps" aria-label="Search yapps">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
              </button>
              <button className="feed-settings-btn" onClick={() => setShowSettings(true)} title="Yapps Settings" aria-label="Yapps settings">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                  <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z"/>
                </svg>
              </button>
            </>
          )}
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
            {searchQuery.trim() ? (
              <>
                <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor" opacity="0.3"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
                <p>No yapps found for "{searchQuery.trim()}"</p>
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor" opacity="0.3"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
                <p>Follow people to see their yapps here</p>
              </>
            )}
          </div>
        ) : (
          filteredYapps.map((y) => (
            <YappCard
              key={y.id}
              yapp={y}
              currentUser={currentUser}
              onOpenThread={pushThread}
              onOpenProfile={setProfileUid}
              defaultExpanded={yappsSettings.autoExpandThreads}
            />
          ))
        )}
      </div>

      {showSettings && (
        <YappsSettings uid={currentUser.uid} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
};
