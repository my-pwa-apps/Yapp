import React, { useState } from 'react';
import { useReplies, postYapp } from '../../hooks/useYapps';
import { YappCard } from './YappCard';
import { YappComposer } from './YappComposer';
import type { Yapp, UserProfile } from '../../types';

interface Props {
  yapp: Yapp;
  currentUser: UserProfile;
  onBack: () => void;
  onOpenThread?: (yapp: Yapp) => void;
  onOpenProfile?: (uid: string) => void;
}

export const YappThread: React.FC<Props> = ({ yapp, currentUser, onBack, onOpenThread, onOpenProfile }) => {
  const { replies, loading } = useReplies(yapp.id);
  const [showComposer, setShowComposer] = useState(false);

  const handleReply = async (text: string, mediaURL?: string, mediaType?: 'image' | 'gif' | 'sticker' | 'voice', voiceDuration?: number) => {
    await postYapp(currentUser.uid, currentUser.displayName, currentUser.photoURL, text, mediaURL, mediaType, yapp.id, voiceDuration, yapp.privacy ?? 'public');
    setShowComposer(false);
  };

  return (
    <div className="yapp-thread">
      <header className="yapp-thread-header">
        <button className="icon-btn" onClick={onBack} title="Back" aria-label="Back">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        </button>
        <h2>{yapp.parentId ? 'Thread' : 'Yapp'}</h2>
      </header>

      <div className="yapp-thread-scroll">
        {/* Original yapp */}
        <div className="yapp-thread-main">
          <YappCard
            yapp={yapp}
            currentUser={currentUser}
            onOpenProfile={onOpenProfile}
          />
        </div>

        {/* Reply composer */}
        <div className="yapp-thread-reply-bar">
          {!showComposer ? (
            <button className="yapp-reply-prompt" onClick={() => setShowComposer(true)}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18zM18 14H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>
              Yapp a reply...
            </button>
          ) : (
            <YappComposer
              onPost={handleReply}
              placeholder="Yapp your reply..."
              autoFocus
              compact
              onCancel={() => setShowComposer(false)}
              hidePrivacy
            />
          )}
        </div>

        {/* Replies */}
        <div className="yapp-thread-replies">
          {loading ? (
            <div className="feed-loading">Loading replies...</div>
          ) : replies.length === 0 ? (
            <div className="feed-empty-replies">No replies yet. Be the first to yapp back!</div>
          ) : (
            replies.map((reply) => (
              <YappCard
                key={reply.id}
                yapp={reply}
                currentUser={currentUser}
                onOpenThread={onOpenThread}
                onOpenProfile={onOpenProfile}
                showReplyContext
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};
