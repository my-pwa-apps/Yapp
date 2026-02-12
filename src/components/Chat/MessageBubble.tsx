import React, { useRef, useState } from 'react';
import type { Message } from '../../types';

interface Props {
  message: Message;
  isMine: boolean;
  showSender: boolean;
  memberCount: number;
}

export const MessageBubble: React.FC<Props> = ({ message, isMine, showSender, memberCount }) => {
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
        return <div className="message-text">{message.text}</div>;
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
};

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

  const formatDur = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
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
        {formatDur(message.voiceDuration || 0)}
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
