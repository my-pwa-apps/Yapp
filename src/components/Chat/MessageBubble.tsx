import React, { useRef, useState } from 'react';
import type { Message } from '../../types';
import { formatDuration } from '../../utils';

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
}

export const MessageBubble = React.memo(function MessageBubble({ message, isMine, showSender, memberCount, highlight }: Props) {
  if (message.type === 'system') {
    return (
      <div className="message-row system">
        <div className="message-bubble system">{message.text}</div>
      </div>
    );
  }

  const formatTime = (ts: number | undefined) => {
    if (!ts) return '';
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Read = at least one OTHER person has read it (not counting the sender)
  const readByOthers = message.readBy
    ? Object.keys(message.readBy).filter((uid) => uid !== message.senderId).length
    : 0;
  const isRead = readByOthers > 0;

  const renderContent = () => {
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

  return (
    <div className={`message-row ${isMine ? 'sent' : 'received'}`}>
      <div className={`message-bubble ${isMine ? 'sent' : 'received'} ${isMediaOnly ? 'sticker-bubble' : ''}`}>
        {showSender && !isMine && (
          <div className="message-sender">{message.senderName}</div>
        )}
        {renderContent()}
        <div className="message-meta">
          <span className="message-time">{formatTime(message.timestamp)}</span>
          {isMine && (
            isRead ? (
              <span className="message-read">✓✓</span>
            ) : (
              <span className="message-delivered">✓</span>
            )
          )}
        </div>
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
