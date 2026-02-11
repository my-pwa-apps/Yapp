import React, { useEffect, useRef, useState } from 'react';
import { useMessages, sendMessage, sendMediaMessage, markMessagesRead, setTyping } from '../../hooks/useMessages';
import { getUserProfile, membersToArray } from '../../hooks/useChats';
import { compressImage, blobToDataURL } from '../../hooks/useMediaUpload';
import { MessageBubble } from './MessageBubble';
import { GifPicker } from './GifPicker';
import { StickerPicker } from './StickerPicker';
import { VoiceRecorder } from './VoiceRecorder';
import type { Chat, UserProfile } from '../../types';

interface Props {
  chat: Chat;
  currentUid: string;
  currentName: string;
  onBack: () => void;
  onStartCall?: (callType: 'audio' | 'video') => void;
}

export const ChatWindow: React.FC<Props> = ({ chat, currentUid, currentName, onBack, onStartCall }) => {
  const { messages, loading } = useMessages(chat.id);
  const [text, setText] = useState('');
  const [chatName, setChatName] = useState('');
  const [otherProfile, setOtherProfile] = useState<UserProfile | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Media picker state
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Detect self-chat
  const isSelfChat =
    chat.type === 'direct' &&
    membersToArray(chat.members).length === 1 &&
    membersToArray(chat.members)[0] === currentUid;

  // Resolve chat name / other profile
  useEffect(() => {
    if (chat.type === 'group') {
      setChatName(chat.name || 'Group');
    } else if (isSelfChat) {
      setChatName('You');
      setOtherProfile(null);
    } else {
      const otherId = membersToArray(chat.members).find((m) => m !== currentUid);
      if (otherId) {
        getUserProfile(otherId).then((p) => {
          if (p) {
            setChatName(p.displayName);
            setOtherProfile(p);
          }
        });
      }
    }
  }, [chat, currentUid, isSelfChat]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Mark unread messages as read
  useEffect(() => {
    const unread = messages.filter(
      (m) => m.senderId !== currentUid && (!m.readBy || !m.readBy[currentUid])
    );
    if (unread.length > 0) {
      markMessagesRead(chat.id, unread.map((m) => m.id), currentUid);
    }
  }, [messages, currentUid, chat.id]);

  // Focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, [chat.id]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText('');
    setTyping(chat.id, currentUid, false);
    await sendMessage(chat.id, currentUid, currentName, trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTyping = (val: string) => {
    setText(val);
    setTyping(chat.id, currentUid, true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setTyping(chat.id, currentUid, false);
    }, 2000);
  };

  // Get typing users
  const typingUsers = chat.typing
    ? Object.entries(chat.typing)
        .filter(([uid, v]) => v && uid !== currentUid)
        .map(([uid]) => uid)
    : [];

  const getStatusText = () => {
    if (typingUsers.length > 0) {
      return <span className="typing-indicator">typing...</span>;
    }
    if (isSelfChat) return 'Note to self';
    if (chat.type === 'direct' && otherProfile) {
      return otherProfile.online ? 'online' : 'offline';
    }
    if (chat.type === 'group') {
      return `${membersToArray(chat.members).length} members`;
    }
    return '';
  };

  return (
    <div className="chat-window">
      {/* Header */}
      <div className="chat-window-header">
        <button className="back-btn" onClick={onBack}>
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
        </button>
        <div className="avatar avatar-md">
          {chatName.charAt(0).toUpperCase()}
        </div>
        <div className="chat-header-info">
          <div className="chat-header-name">{chatName}</div>
          <div className="chat-header-status">{getStatusText()}</div>
        </div>
        {/* Call buttons */}
        {onStartCall && (
          <div className="chat-header-actions">
            <button
              className="icon-btn"
              title="Audio call"
              onClick={() => onStartCall('audio')}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56a.977.977 0 0 0-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/>
              </svg>
            </button>
            <button
              className="icon-btn"
              title="Video call"
              onClick={() => onStartCall('video')}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="messages-container">
        {loading && <div className="loading-spinner">Loading messages...</div>}
        {!loading && messages.length === 0 && (
          <div className="empty-state">
            <p>No messages yet. Say hello!</p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isMine={msg.senderId === currentUid}
            showSender={chat.type === 'group'}
            memberCount={membersToArray(chat.members).length}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Media pickers */}
      {showGifPicker && (
        <GifPicker
          onSelect={async (gifUrl) => {
            setShowGifPicker(false);
            await sendMediaMessage(chat.id, currentUid, currentName, 'gif', gifUrl, '🎬 GIF');
          }}
          onClose={() => setShowGifPicker(false)}
        />
      )}
      {showStickerPicker && (
        <StickerPicker
          onSelect={async (emoji) => {
            setShowStickerPicker(false);
            await sendMediaMessage(chat.id, currentUid, currentName, 'sticker', emoji, emoji);
          }}
          onClose={() => setShowStickerPicker(false)}
        />
      )}

      {/* Compose */}
      {showVoiceRecorder ? (
        <VoiceRecorder
          onSend={async (blob, duration) => {
            setShowVoiceRecorder(false);
            setUploading(true);
            try {
              const dataUrl = await blobToDataURL(blob);
              await sendMediaMessage(chat.id, currentUid, currentName, 'voice', dataUrl, '🎤 Voice message', { voiceDuration: duration });
            } catch { /* ignore */ }
            setUploading(false);
          }}
          onCancel={() => setShowVoiceRecorder(false)}
        />
      ) : (
        <div className="compose-bar">
          {/* Attachment menu */}
          <div className="attach-wrapper">
            <button
              className="compose-icon-btn"
              onClick={() => setShowAttachMenu(!showAttachMenu)}
              title="Attach"
            >
              <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5a2.5 2.5 0 0 1 5 0v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5a2.5 2.5 0 0 0 5 0V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/>
              </svg>
            </button>
            {showAttachMenu && (
              <div className="attach-menu">
                <button onClick={() => { setShowAttachMenu(false); fileInputRef.current?.click(); }}>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                  </svg>
                  Photo
                </button>
                <button onClick={() => { setShowAttachMenu(false); setShowGifPicker(true); }}>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path d="M11.5 9H13v6h-1.5zM9 9H6c-.6 0-1 .5-1 1v4c0 .5.4 1 1 1h3c.6 0 1-.5 1-1v-2H8.5v1.5h-2v-3H10V10c0-.5-.4-1-1-1zm10 1.5V9h-4.5v6H16v-2h2v-1.5h-2v-1z"/>
                  </svg>
                  GIF
                </button>
                <button onClick={() => { setShowAttachMenu(false); setShowStickerPicker(true); }}>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
                  </svg>
                  Stickers
                </button>
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              e.target.value = '';
              setUploading(true);
              try {
                const dataUrl = await compressImage(file);
                await sendMediaMessage(chat.id, currentUid, currentName, 'image', dataUrl, '📷 Photo');
              } catch { /* ignore */ }
              setUploading(false);
            }}
          />

          <textarea
            ref={inputRef}
            className="compose-input"
            placeholder={uploading ? 'Uploading...' : 'Type a message'}
            value={text}
            onChange={(e) => handleTyping(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={uploading}
          />

          {text.trim() ? (
            <button className="send-btn" onClick={handleSend} disabled={uploading}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          ) : (
            <button
              className="compose-icon-btn mic-btn"
              onClick={() => setShowVoiceRecorder(true)}
              title="Voice message"
              disabled={uploading}
            >
              <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
