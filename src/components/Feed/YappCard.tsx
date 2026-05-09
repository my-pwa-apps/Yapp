import React, { useState, useRef, useEffect } from 'react';
import { useYappLikes, useReplies, useYappLikeCount, useYappReplyCount, useYappReyappCount, toggleLike, deleteYapp, reyapp, editYapp } from '../../hooks/useYapps';
import type { Yapp, UserProfile } from '../../types';
import { formatRelativeTime, formatDuration } from '../../utils';

interface Props {
  yapp: Yapp;
  currentUser: UserProfile;
  onOpenThread?: (yapp: Yapp) => void;
  onOpenProfile?: (uid: string) => void;
  showReplyContext?: boolean;
  /** Current nesting depth for inline expand (0 = top level) */
  depth?: number;
  /** Whether to start with replies expanded (from settings) */
  defaultExpanded?: boolean;
}

/* ── Inline voice player ── */
const YappVoicePlayer: React.FC<{ src: string; duration?: number }> = ({ src, duration }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration) setProgress((audio.currentTime / audio.duration) * 100);
    };
    const onEnded = () => { setPlaying(false); setProgress(0); setCurrentTime(0); };
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    return () => { audio.removeEventListener('timeupdate', onTimeUpdate); audio.removeEventListener('ended', onEnded); };
  }, []);

  useEffect(() => {
    if (progressRef.current) progressRef.current.style.width = `${progress}%`;
  }, [progress]);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); } else { audio.play(); }
    setPlaying(!playing);
  };

  const displayDuration = duration ?? (audioRef.current?.duration || 0);

  return (
    <div className="yapp-voice-player" onClick={(e) => e.stopPropagation()}>
      <audio ref={audioRef} src={src} preload="metadata" />
      <button className="yapp-voice-play-btn" onClick={toggle}>
        {playing ? (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
        ) : (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        )}
      </button>
      <div className="yapp-voice-track">
        <div ref={progressRef} className="yapp-voice-progress" />
      </div>
      <span className="yapp-voice-time">
        {playing ? formatDuration(Math.floor(currentTime)) : formatDuration(Math.floor(displayDuration))}
      </span>
    </div>
  );
};

const YappCardInner: React.FC<Props> = ({ yapp, currentUser, onOpenThread, onOpenProfile, showReplyContext, depth = 0, defaultExpanded }) => {
  const liked = useYappLikes(yapp.id, currentUser.uid);
  const likeCount = useYappLikeCount(yapp.id, yapp.likeCount);
  const replyCount = useYappReplyCount(yapp.id, yapp.replyCount);
  const reyappCount = useYappReyappCount(yapp.id, yapp.reyappCount);
  const [busy, setBusy] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const editRef = useRef<HTMLTextAreaElement>(null);

  const MAX_INLINE_DEPTH = 3;
  const canExpandInline = replyCount > 0 && depth < MAX_INLINE_DEPTH;
  const isOwn = yapp.authorId === currentUser.uid;
  const isContactsOnly = (yapp.privacy ?? 'public') === 'contacts';

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((prev) => !prev);
  };

  const handleLike = async () => {
    if (busy) return;
    setBusy(true);
    try { await toggleLike(yapp.id, currentUser.uid); } catch (e) { console.error('[YappCard] Like failed:', e); } finally { setBusy(false); }
  };

  const handleReyapp = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await reyapp(yapp, currentUser.uid, currentUser.displayName, currentUser.photoURL);
    } catch (e) { console.error('[YappCard] Reyapp failed:', e); } finally { setBusy(false); }
  };

  const handleDelete = async () => {
    if (busy) return;
    setBusy(true);
    try { await deleteYapp(yapp.id); } catch (e) { console.error('[YappCard] Delete failed:', e); } finally { setBusy(false); setShowMenu(false); setShowDeleteConfirm(false); }
  };

  const handleStartEdit = () => {
    setEditText(yapp.text);
    setEditing(true);
    setShowMenu(false);
    setTimeout(() => editRef.current?.focus(), 50);
  };

  const handleSaveEdit = async () => {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === yapp.text) { setEditing(false); return; }
    setBusy(true);
    try { await editYapp(yapp.id, trimmed); } catch (e) { console.error('[YappCard] Edit failed:', e); }
    setBusy(false);
    setEditing(false);
  };

  return (
    <article className="yapp-card" onClick={() => onOpenThread?.(yapp)}>
      {yapp.reyappOf && yapp.reyappByName && (
        <div className="yapp-reyapp-badge">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
          <span>{yapp.reyappByUid === currentUser.uid ? 'You' : yapp.reyappByName} reyapped</span>
        </div>
      )}
      <div className="yapp-card-body">
        <div
          className="yapp-card-avatar"
          onClick={(e) => { e.stopPropagation(); onOpenProfile?.(yapp.authorId); }}
        >
          {yapp.authorPhotoURL
            ? <img src={yapp.authorPhotoURL} alt={`${yapp.authorName}'s avatar`} className="avatar-img" />
            : <span>{yapp.authorName.charAt(0).toUpperCase()}</span>
          }
        </div>
        <div className="yapp-card-content">
          <div className="yapp-card-header">
            <span
              className="yapp-card-author"
              onClick={(e) => { e.stopPropagation(); onOpenProfile?.(yapp.authorId); }}
            >
              {yapp.authorName}
            </span>
            <span className="yapp-card-time">{formatRelativeTime(yapp.timestamp)}</span>
            <span className="yapp-card-privacy" title={yapp.privacy === 'contacts' ? 'Contacts only' : 'Public'}>
              {(yapp.privacy ?? 'public') === 'contacts' ? (
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
              ) : (
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
              )}
            </span>
            {isOwn && (
              <div className="yapp-card-menu" onClick={(e) => e.stopPropagation()}>
                <button className="icon-btn yapp-menu-btn" onClick={() => setShowMenu(!showMenu)} title="More options" aria-label="More options">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
                </button>
                {showMenu && (
                  <div className="yapp-dropdown">
                      <button className="yapp-dropdown-edit" onClick={handleStartEdit} disabled={busy}>Edit</button>
                      <button onClick={() => { setShowMenu(false); setShowDeleteConfirm(true); }} disabled={busy}>Delete</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Delete confirmation */}
          {showDeleteConfirm && (
            <div className="yapp-delete-confirm" onClick={(e) => e.stopPropagation()}>
              <span>Delete this yapp?</span>
              <button className="yapp-btn yapp-btn-danger yapp-btn-xs" onClick={handleDelete} disabled={busy}>Delete</button>
              <button className="yapp-btn yapp-btn-secondary yapp-btn-xs" onClick={() => setShowDeleteConfirm(false)} disabled={busy}>Cancel</button>
            </div>
          )}

          {showReplyContext && yapp.parentId && (
            <div className="yapp-reply-context">
              Replying to a yapp
            </div>
          )}

          {editing ? (
            <div className="yapp-edit-form" onClick={(e) => e.stopPropagation()}>
              <textarea
                ref={editRef}
                className="yapp-edit-input"
                value={editText}
                aria-label="Edit post"
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); }
                  if (e.key === 'Escape') setEditing(false);
                }}
                rows={3}
                disabled={busy}
              />
              <div className="yapp-edit-actions">
                <button className="yapp-btn yapp-btn-primary yapp-btn-xs" onClick={handleSaveEdit} disabled={busy}>Save</button>
                <button className="yapp-btn yapp-btn-secondary yapp-btn-xs" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
              </div>
            </div>
          ) : yapp.mediaType === 'sticker' ? (
            <div className="yapp-card-sticker">{yapp.text}</div>
          ) : (
            <p className="yapp-card-text">
              {yapp.text}
              {yapp.edited && <span className="yapp-edited-label"> (edited)</span>}
            </p>
          )}

          {yapp.mediaType === 'voice' && yapp.mediaURL && (
            <YappVoicePlayer src={yapp.mediaURL} duration={yapp.voiceDuration} />
          )}

          {yapp.mediaURL && yapp.mediaType !== 'sticker' && yapp.mediaType !== 'voice' && (
            <div className="yapp-card-media">
              <img src={yapp.mediaURL} alt="media" loading="lazy" />
            </div>
          )}

          <div className="yapp-card-actions" onClick={(e) => e.stopPropagation()}>
            <button className="yapp-action" onClick={() => onOpenThread?.(yapp)} title="Reply">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18zM18 14H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>
              <span>{replyCount || ''}</span>
            </button>
            <button className={`yapp-action ${liked ? 'yapp-action-liked' : ''}`} onClick={handleLike} title="Like" disabled={busy}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              <span>{likeCount || ''}</span>
            </button>
            <button className="yapp-action" onClick={handleReyapp} title={isContactsOnly ? 'Cannot reyapp contacts-only yapps' : 'Reyapp'} disabled={busy || isOwn || isContactsOnly}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
              <span>{reyappCount || ''}</span>
            </button>
          </div>

          {/* Expand / Collapse inline thread toggle */}
          {canExpandInline && (
            <button className="yapp-expand-toggle" onClick={handleToggleExpand}>
              <svg className={expanded ? 'yapp-expand-icon yapp-expand-icon-open' : 'yapp-expand-icon'} viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
              </svg>
              {expanded
                ? 'Hide replies'
                : `Show ${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}`
              }
            </button>
          )}
          {/* At max depth, show link to open full thread */}
          {replyCount > 0 && depth >= MAX_INLINE_DEPTH && (
            <button className="yapp-expand-toggle" onClick={(e) => { e.stopPropagation(); onOpenThread?.(yapp); }}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18zM18 14H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
              </svg>
              View full thread ({replyCount} {replyCount === 1 ? 'reply' : 'replies'})
            </button>
          )}
        </div>
      </div>

      {/* Inline expanded replies */}
      {expanded && canExpandInline && (
        <InlineReplies
          parentId={yapp.id}
          currentUser={currentUser}
          onOpenThread={onOpenThread}
          onOpenProfile={onOpenProfile}
          depth={depth + 1}
        />
      )}
    </article>
  );
};

/* ── Inline replies loader (only mounts when expanded) ── */
const InlineReplies: React.FC<{
  parentId: string;
  currentUser: UserProfile;
  onOpenThread?: (yapp: Yapp) => void;
  onOpenProfile?: (uid: string) => void;
  depth: number;
}> = ({ parentId, currentUser, onOpenThread, onOpenProfile, depth }) => {
  const { replies, loading } = useReplies(parentId);

  if (loading) {
    return (
      <div className="yapp-inline-replies">
        <div className="feed-loading feed-loading-compact">
          <div className="feed-spinner" /> Loading…
        </div>
      </div>
    );
  }

  if (replies.length === 0) {
    return (
      <div className="yapp-inline-replies">
        <div className="feed-empty-replies">No replies yet</div>
      </div>
    );
  }

  return (
    <div className="yapp-inline-replies">
      {replies.map((reply) => (
        <YappCard
          key={reply.id}
          yapp={reply}
          currentUser={currentUser}
          onOpenThread={onOpenThread}
          onOpenProfile={onOpenProfile}
          showReplyContext
          depth={depth}
        />
      ))}
    </div>
  );
};

export const YappCard = React.memo(YappCardInner);
