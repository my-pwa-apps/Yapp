import React, { useRef, useState } from 'react';
import type { Message } from '../../types';
import { formatDuration, formatMessageTime } from '../../utils';
import { editMessage, deleteMessage } from '../../hooks/useMessages';

/** Highlight matching substrings in text */
function highlightText(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="search-highlight">{part}</mark>
      : part
  );
}

interface Props {
  message: Message;
  isMine: boolean;
  showSender: boolean;
  memberCount: number;
  highlight?: string;
  onForward?: (message: Message) => void;
}

export const MessageBubble = React.memo(function MessageBubble({ message, isMine, showSender, memberCount, highlight, onForward }: Props) {
  const [showMenu, setShowMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  if (message.type === 'system') {
    return (
      <div className="message-row system">
        <div className="message-bubble system">{message.text}</div>
      </div>
    );
  }

  // Soft-deleted messages
  if (message.deleted) {
    return (
      <div className={`message-row ${isMine ? 'sent' : 'received'}`}>
        <div className={`message-bubble ${isMine ? 'sent' : 'received'} message-deleted`}>
          <span className="message-deleted-text">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style={{ marginRight: 4, verticalAlign: 'middle' }}>
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
            </svg>
            This message was deleted
          </span>
          <div className="message-meta">
            <span className="message-time">{formatMessageTime(message.timestamp)}</span>
          </div>
        </div>
      </div>
    );
  }

  // Read = at least one OTHER person has read it (not counting the sender)
  const readByOthers = message.readBy
    ? Object.keys(message.readBy).filter((uid) => uid !== message.senderId).length
    : 0;
  const isRead = readByOthers > 0;
  const isTextMessage = message.type === 'text';
  const canForward = message.forwardable !== false && !message.encrypted && !message.ephemeralTTL && !!onForward;

  const handleLongPressStart = () => {
    if (!isMine && !canForward) return;
    longPressTimer.current = setTimeout(() => setShowMenu(true), 500);
  };
  const handleLongPressEnd = () => {
    clearTimeout(longPressTimer.current);
  };

  const handleStartEdit = () => {
    setEditText(message.text);
    setEditing(true);
    setShowMenu(false);
    setTimeout(() => editInputRef.current?.focus(), 50);
  };

  const handleSaveEdit = async () => {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === message.text) { setEditing(false); return; }
    setBusy(true);
    try {
      await editMessage(message.chatId, message.id, trimmed);
    } catch (e) { console.error('[MessageBubble] Edit failed:', e); }
    setBusy(false);
    setEditing(false);
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await deleteMessage(message.chatId, message.id);
    } catch (e) { console.error('[MessageBubble] Delete failed:', e); }
    setBusy(false);
    setShowDeleteConfirm(false);
    setShowMenu(false);
  };

  const renderContent = () => {
    if (editing) {
      return (
        <div className="message-edit-form" onClick={(e) => e.stopPropagation()}>
          <textarea
            ref={editInputRef}
            className="message-edit-input"
            value={editText}
            aria-label="Edit message"
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); }
              if (e.key === 'Escape') setEditing(false);
            }}
            rows={2}
            disabled={busy}
          />
          <div className="message-edit-actions">
            <button className="message-edit-save" onClick={handleSaveEdit} disabled={busy}>Save</button>
            <button className="message-edit-cancel" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
          </div>
        </div>
      );
    }

    switch (message.type) {
      case 'image':
        return (
          <div className="message-media">
            <img
              src={message.mediaURL}
              alt="Shared image"
              className="message-image"
              loading="lazy"
            />
          </div>
        );

      case 'gif':
        return (
          <div className="message-media">
            <img
              src={message.mediaURL}
              alt="GIF"
              className="message-gif"
              loading="lazy"
            />
          </div>
        );

      case 'sticker':
        return (
          <div className="message-sticker">
            {message.mediaURL}
          </div>
        );

      case 'voice':
        return <VoicePlayer message={message} />;

      default:
        return <div className="message-text">{highlight ? highlightText(message.text || '', highlight) : message.text}</div>;
    }
  };

  const isMediaOnly = message.type === 'sticker';
  const isEphemeral = !!message.ephemeralTTL;

  return (
    <div
      className={`message-row ${isMine ? 'sent' : 'received'}`}
      onTouchStart={handleLongPressStart}
      onTouchEnd={handleLongPressEnd}
      onTouchCancel={handleLongPressEnd}
      onContextMenu={(e) => { if (isMine || canForward) { e.preventDefault(); setShowMenu(true); } }}
    >
      <div className={`message-bubble ${isMine ? 'sent' : 'received'} ${isMediaOnly ? 'sticker-bubble' : ''} ${isEphemeral ? 'ephemeral' : ''}`}>
        {showSender && !isMine && (
          <div className="message-sender">{message.senderName}</div>
        )}
        {message.forwardedFrom && (
          <div className="message-forwarded-label">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 8V4l8 8-8 8v-4H4V8z"/></svg>
            Forwarded from {message.forwardedFrom}
          </div>
        )}
        {renderContent()}
        <div className="message-meta">
          {message.edited && <span className="message-edited-label">edited</span>}
          {isEphemeral && (
            <span className="message-ephemeral-icon" title={`Disappears ${message.ephemeralTTL}s after reading`}>
              <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
            </span>
          )}
          <span className="message-time">{formatMessageTime(message.timestamp)}</span>
          {isMine && (
            isRead ? (
              <span className="message-read">✓✓</span>
            ) : (
              <span className="message-delivered">✓</span>
            )
          )}
        </div>

        {/* Context menu for own messages */}
        {showMenu && isMine && !editing && (
          <div className="message-context-menu" onClick={(e) => e.stopPropagation()}>
            {isTextMessage && (
              <button onClick={handleStartEdit}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.33a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.83z"/></svg>
                Edit
              </button>
            )}
            <button onClick={() => { setShowMenu(false); setShowDeleteConfirm(true); }} className="message-menu-danger">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
              Delete
            </button>
            <button onClick={() => setShowMenu(false)}>
              Cancel
            </button>
          </div>
        )}

        {/* Delete confirmation */}
        {showDeleteConfirm && (
          <div className="message-delete-confirm" onClick={(e) => e.stopPropagation()}>
            <span>Delete this message?</span>
            <div className="message-delete-confirm-btns">
              <button className="msg-btn-danger" onClick={handleDelete} disabled={busy}>Delete</button>
              <button className="msg-btn-cancel" onClick={() => setShowDeleteConfirm(false)} disabled={busy}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

/* ── Inline voice player ── */
const VoicePlayer: React.FC<{ message: Message }> = ({ message }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setPlaying(!playing);
  };

  return (
    <div className="voice-message">
      <button className="voice-play-btn" onClick={toggle}>
        {playing ? (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
      <div className="voice-waveform">
        <div className="voice-progress" style={{ width: `${progress}%` }} />
      </div>
      <span className="voice-duration">
        {formatDuration(message.voiceDuration || 0)}
      </span>
      <audio
        ref={audioRef}
        src={message.mediaURL}
        onTimeUpdate={() => {
          if (audioRef.current) {
            const pct = (audioRef.current.currentTime / audioRef.current.duration) * 100;
            setProgress(isNaN(pct) ? 0 : pct);
          }
        }}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
        preload="metadata"
      />
    </div>
  );
};
