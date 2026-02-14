import React, { useState, useRef, useEffect } from 'react';
import { useYappLikes, toggleLike, deleteYapp, reyapp } from '../../hooks/useYapps';
import type { Yapp, UserProfile } from '../../types';
import { formatRelativeTime, formatDuration } from '../../utils';

interface Props {
  yapp: Yapp;
  currentUser: UserProfile;
  onOpenThread?: (yapp: Yapp) => void;
  onOpenProfile?: (uid: string) => void;
  showReplyContext?: boolean;
}

/* ── Inline voice player ── */
const YappVoicePlayer: React.FC<{ src: string; duration?: number }> = ({ src, duration }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
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
        <div className="yapp-voice-progress" style={{ width: `${progress}%` }} />
      </div>
      <span className="yapp-voice-time">
        {playing ? formatDuration(Math.floor(currentTime)) : formatDuration(Math.floor(displayDuration))}
      </span>
    </div>
  );
};

export const YappCard: React.FC<Props> = ({ yapp, currentUser, onOpenThread, onOpenProfile, showReplyContext }) => {
  const liked = useYappLikes(yapp.id, currentUser.uid);
  const [busy, setBusy] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const isOwn = yapp.authorId === currentUser.uid;

  const handleLike = async () => {
    if (busy) return;
    setBusy(true);
    try { await toggleLike(yapp.id, currentUser.uid); } finally { setBusy(false); }
  };

  const handleReyapp = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await reyapp(yapp, currentUser.uid, currentUser.displayName, currentUser.photoURL);
    } finally { setBusy(false); }
  };

  const handleDelete = async () => {
    if (busy) return;
    setBusy(true);
    try { await deleteYapp(yapp.id, yapp.parentId); } finally { setBusy(false); setShowMenu(false); }
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
            ? <img src={yapp.authorPhotoURL} alt="" className="avatar-img" />
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
            {isOwn && (
              <div className="yapp-card-menu" onClick={(e) => e.stopPropagation()}>
                <button className="icon-btn yapp-menu-btn" onClick={() => setShowMenu(!showMenu)}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
                </button>
                {showMenu && (
                  <div className="yapp-dropdown">
                    <button onClick={handleDelete} disabled={busy}>Delete yapp</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {showReplyContext && yapp.parentId && (
            <div className="yapp-reply-context">
              Replying to a yapp
            </div>
          )}

          {yapp.mediaType === 'sticker' ? (
            <div className="yapp-card-sticker">{yapp.text}</div>
          ) : (
            <p className="yapp-card-text">{yapp.text}</p>
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
              <span>{yapp.replyCount || ''}</span>
            </button>
            <button className={`yapp-action ${liked ? 'yapp-action-liked' : ''}`} onClick={handleLike} title="Like" disabled={busy}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              <span>{yapp.likeCount || ''}</span>
            </button>
            <button className="yapp-action" onClick={handleReyapp} title="Reyapp" disabled={busy || isOwn}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
              <span>{yapp.reyappCount || ''}</span>
            </button>
          </div>
        </div>
      </div>
    </article>
  );
};
