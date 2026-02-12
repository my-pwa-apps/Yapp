import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useMessages, sendMessage, sendMediaMessage, markMessagesRead, setTyping } from '../../hooks/useMessages';
import { getUserProfile, membersToArray } from '../../hooks/useChats';
import { compressImage, blobToDataURL } from '../../hooks/useMediaUpload';
import { useChatEncryption, enableGroupEncryption } from '../../hooks/useE2EE';
import { MessageBubble } from './MessageBubble';
import { GifPicker } from './GifPicker';
import { StickerPicker } from './StickerPicker';
import { VoiceRecorder } from './VoiceRecorder';
import { KeyRecoveryModal } from './KeyRecoveryModal';
import type { Chat, UserProfile, Message } from '../../types';

// Scroll behavior preference
const SCROLL_PREF_KEY = 'yapp_scroll_behavior';
export type ScrollBehaviorPref = 'most-recent' | 'left-off';
export function getScrollBehaviorPref(): ScrollBehaviorPref {
  try {
    return (localStorage.getItem(SCROLL_PREF_KEY) as ScrollBehaviorPref) || 'most-recent';
  } catch { return 'most-recent'; }
}
export function setScrollBehaviorPref(pref: ScrollBehaviorPref) {
  localStorage.setItem(SCROLL_PREF_KEY, pref);
}

// Module-level map so scroll positions survive component unmount/remount
const savedScrollPositions = new Map<string, number>();

interface Props {
  chat: Chat;
  currentUid: string;
  currentName: string;
  onBack: () => void;
  onStartCall?: (callType: 'audio' | 'video') => void;
  onShowGroupInfo?: () => void;
}

export const ChatWindow: React.FC<Props> = ({ chat, currentUid, currentName, onBack, onStartCall, onShowGroupInfo }) => {
  const { cryptoKeys, needsKeyRecovery, recoverKeys } = useAuth();
  const { messages, loading } = useMessages(chat.id);
  const { encryptMessage, decryptMessage, chatKey } = useChatEncryption(chat, currentUid, cryptoKeys);
  const [enablingE2EE, setEnablingE2EE] = useState(false);
  const [showKeyRecovery, setShowKeyRecovery] = useState(false);
  const [showUserDetail, setShowUserDetail] = useState(false);
  const [text, setText] = useState('');
  const [chatName, setChatName] = useState('');
  const [otherProfile, setOtherProfile] = useState<UserProfile | null>(null);
  const [decryptedMessages, setDecryptedMessages] = useState<Message[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Smart scroll: track whether initial load is done for this chat
  const initialScrollDone = useRef(false);
  const prevMessageCount = useRef(0);
  const currentChatIdRef = useRef(chat.id);

  // Swipe-back gesture refs
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null);

  // In-chat search
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<number[]>([]);
  const [searchIndex, setSearchIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Track whether the page is visible (tab/window active)
  const [pageVisible, setPageVisible] = useState(!document.hidden);

  // Media picker state
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Memoize member list & self-chat detection
  const members = useMemo(() => membersToArray(chat.members), [chat.members]);
  const isSelfChat = useMemo(
    () => chat.type === 'direct' && members.length === 1 && members[0] === currentUid,
    [chat.type, members, currentUid]
  );

  // Resolve chat name / other profile (live listener for direct chats)
  useEffect(() => {
    if (chat.type === 'group') {
      setChatName(chat.name || 'Group');
      return;
    }
    if (isSelfChat) {
      setChatName('You');
      setOtherProfile(null);
      return;
    }
    const otherId = members.find((m) => m !== currentUid);
    if (!otherId) return;
    // Live listener so online/offline status updates in real-time
    const userRef = ref(db, `users/${otherId}`);
    const unsub = onValue(userRef, (snap) => {
      if (snap.exists()) {
        const p = snap.val() as UserProfile;
        setChatName(p.displayName);
        setOtherProfile(p);
      }
    });
    return () => unsub();
  }, [chat, currentUid, isSelfChat]);

  // Listen for page visibility changes
  useEffect(() => {
    const handler = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  // Decrypt encrypted messages
  useEffect(() => {
    if (messages.length === 0) {
      setDecryptedMessages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const result = await Promise.all(
        messages.map(async (msg) => {
          if (msg.encrypted && msg.ciphertext && msg.iv) {
            const plaintext = await decryptMessage(msg);
            return { ...msg, text: plaintext };
          }
          return msg;
        })
      );
      if (!cancelled) setDecryptedMessages(result);
    })();
    return () => { cancelled = true; };
  }, [messages, chatKey]);

  // Continuously save scroll position on scroll events
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const chatId = chat.id;
    const onScroll = () => {
      savedScrollPositions.set(chatId, el.scrollTop);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [chat.id]);

  // Keep ref in sync for cleanup
  useEffect(() => {
    currentChatIdRef.current = chat.id;
  }, [chat.id]);

  // Reset scroll tracking on chat switch, close search
  useEffect(() => {
    initialScrollDone.current = false;
    prevMessageCount.current = 0;
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  }, [chat.id]);

  // Scroll to bottom or saved position on initial load
  useEffect(() => {
    if (loading || decryptedMessages.length === 0) return;
    if (!initialScrollDone.current) {
      initialScrollDone.current = true;
      prevMessageCount.current = decryptedMessages.length;
      const scrollPref = getScrollBehaviorPref();
      const savedPos = savedScrollPositions.get(chat.id);
      if (scrollPref === 'left-off' && savedPos !== undefined) {
        // Use double-rAF to ensure DOM is fully laid out before restoring
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const el = messagesContainerRef.current;
            if (el) el.scrollTop = savedPos;
          });
        });
      } else {
        requestAnimationFrame(() => {
          bottomRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
        });
      }
      return;
    }
    // On subsequent messages: auto-scroll only if near bottom
    if (decryptedMessages.length > prevMessageCount.current) {
      prevMessageCount.current = decryptedMessages.length;
      const el = messagesContainerRef.current;
      if (el) {
        const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
        if (isNearBottom) {
          bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
      }
    }
  }, [decryptedMessages, loading, chat.id]);

  // Mark unread messages as read — only when page is visible
  useEffect(() => {
    if (!pageVisible) return;
    const unread = messages.filter(
      (m) => m.senderId !== currentUid && (!m.readBy || !m.readBy[currentUid])
    );
    if (unread.length > 0) {
      markMessagesRead(chat.id, unread.map((m) => m.id), currentUid);
    }
  }, [messages, currentUid, chat.id, pageVisible]);

  // Scroll to a specific message index in the list
  const scrollToMessageIndex = useCallback((index: number) => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const rows = container.querySelectorAll('.message-row');
    if (rows[index]) {
      rows[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  // Focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, [chat.id]);

  // On mobile, scroll compose bar into view when virtual keyboard opens
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      // When keyboard opens, visual viewport height shrinks
      // Scroll the compose input into view
      requestAnimationFrame(() => {
        inputRef.current?.scrollIntoView({ block: 'nearest' });
      });
    };
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  // Close attach menu on outside click (delayed to avoid catching the opening click)
  useEffect(() => {
    if (!showAttachMenu) return;
    const handleClick = (e: MouseEvent) => {
      const wrapper = document.querySelector('.attach-wrapper');
      if (wrapper && wrapper.contains(e.target as Node)) return;
      setShowAttachMenu(false);
    };
    // Use setTimeout so the listener isn't added during the same click event
    const id = setTimeout(() => document.addEventListener('click', handleClick), 0);
    return () => { clearTimeout(id); document.removeEventListener('click', handleClick); };
  }, [showAttachMenu]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText('');
    setTyping(chat.id, currentUid, false);
    // Encrypt if E2EE is available for this chat
    let encryption: { ciphertext: string; iv: string } | undefined;
    if (chatKey) {
      const enc = await encryptMessage(trimmed);
      if (enc) encryption = enc;
    }
    await sendMessage(chat.id, currentUid, currentName, trimmed, encryption);
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
      if (otherProfile.online) return 'online';
      if (otherProfile.lastSeen) {
        const d = new Date(otherProfile.lastSeen);
        const now = new Date();
        const diff = now.getTime() - d.getTime();
        if (diff < 60000) return 'last seen just now';
        if (diff < 3600000) return `last seen ${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `last seen ${Math.floor(diff / 3600000)}h ago`;
        return `last seen ${d.toLocaleDateString()}`;
      }
      return 'offline';
    }
    if (chat.type === 'group') {
      return `${members.length} members`;
    }
    return '';
  };

  return (
    <div
      className="chat-window"
      onTouchStart={(e) => {
        const t = e.touches[0];
        touchStartRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
      }}
      onTouchEnd={(e) => {
        if (!touchStartRef.current) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - touchStartRef.current.x;
        const dy = t.clientY - touchStartRef.current.y;
        const dt = Date.now() - touchStartRef.current.t;
        touchStartRef.current = null;
        if (dx > 80 && Math.abs(dy) < Math.abs(dx) * 0.5 && dt < 300) {
          onBack();
        }
      }}
    >
      {/* Header */}
      <div className="chat-window-header">
        <button className="back-btn" onClick={onBack} title="Back">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
          </svg>
        </button>
        <div className="avatar avatar-md chat-header-avatar" onClick={() => {
          if (chat.type === 'group' && onShowGroupInfo) onShowGroupInfo();
          else if (chat.type === 'direct' && !isSelfChat && otherProfile) setShowUserDetail(!showUserDetail);
        }} style={{ cursor: 'pointer' }}>
          {otherProfile?.photoURL
            ? <img src={otherProfile.photoURL} alt="" className="avatar-img" />
            : chatName.charAt(0).toUpperCase()
          }
        </div>
        <div className="chat-header-info" onClick={() => {
          if (chat.type === 'group' && onShowGroupInfo) onShowGroupInfo();
          else if (chat.type === 'direct' && !isSelfChat && otherProfile) setShowUserDetail(!showUserDetail);
        }} style={{ cursor: 'pointer' }}>
          <div className="chat-header-name">
            {chatName}
            {chatKey && (
              <span className="e2ee-header-lock" title="End-to-end encrypted">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="var(--accent)"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
              </span>
            )}
          </div>
          <div className="chat-header-status">
            {chat.type === 'direct' && !isSelfChat && otherProfile && (
              <span className={`presence-dot ${otherProfile.online ? 'online' : 'offline'}`} />
            )}
            {getStatusText()}
          </div>
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
        {/* Enable E2EE button — shown when chat isn't encrypted */}
        {!chatKey && !enablingE2EE && (
          <button
            className="icon-btn enable-e2ee-btn"
            title={!cryptoKeys
              ? (needsKeyRecovery ? 'Unlock encryption keys' : 'Set up encryption')
              : chat.type === 'group'
                ? 'Enable end-to-end encryption for this group'
                : 'E2EE activates when both users have encryption keys'
            }
            onClick={async () => {
              // If user has no keys, prompt key recovery
              if (!cryptoKeys) {
                if (needsKeyRecovery) {
                  setShowKeyRecovery(true);
                } else {
                  alert('Sign out and sign back in to set up encryption keys.');
                }
                return;
              }
              if (chat.type === 'direct') {
                alert('Direct chat encryption activates automatically when both users have encryption keys set up.');
                return;
              }
              setEnablingE2EE(true);
              try {
                const members = membersToArray(chat.members);
                const ok = await enableGroupEncryption(chat.id, [currentUid, ...members.filter(m => m !== currentUid)], cryptoKeys);
                if (ok) {
                  // Force re-resolve chatKey
                  window.location.reload();
                } else {
                  alert('Could not enable encryption. Some members may not have set up encryption keys.');
                }
              } catch { alert('Failed to enable encryption.'); }
              setEnablingE2EE(false);
            }}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h1.9c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10z"/>
            </svg>
          </button>
        )}
        {enablingE2EE && (
          <span className="e2ee-enabling" title="Enabling encryption...">🔄</span>
        )}
        {/* Search in chat */}
        <button className="icon-btn" title="Search in chat" onClick={() => { setShowSearch(!showSearch); setTimeout(() => searchInputRef.current?.focus(), 100); }}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
          </svg>
        </button>
        {/* Group info button */}
        {chat.type === 'group' && onShowGroupInfo && (
          <button className="icon-btn" title="Group info" onClick={onShowGroupInfo}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
            </svg>
          </button>
        )}
      </div>
      {/* User detail popup */}
      {showUserDetail && otherProfile && (
        <div className="user-detail-popup">
          <div className="user-detail-header">
            <div className="avatar avatar-lg">
              {otherProfile.photoURL
                ? <img src={otherProfile.photoURL} alt="" className="avatar-img" />
                : otherProfile.displayName.charAt(0).toUpperCase()
              }
            </div>
            <button className="user-detail-close" onClick={() => setShowUserDetail(false)}>×</button>
          </div>
          <div className="user-detail-name">{otherProfile.displayName}</div>
          <div className="user-detail-email">{otherProfile.email}</div>
          {otherProfile.status && (
            <div className="user-detail-status">"{otherProfile.status}"</div>
          )}
          <div className="user-detail-seen">
            {otherProfile.online ? (
              <span style={{ color: 'var(--accent)' }}>● Online</span>
            ) : otherProfile.lastSeen ? (
              <span>Last seen {new Date(otherProfile.lastSeen).toLocaleString()}</span>
            ) : (
              <span>Offline</span>
            )}
          </div>
        </div>
      )}
      {/* In-chat search bar */}
      {showSearch && (
        <div className="chat-search-bar">
          <input
            ref={searchInputRef}
            type="text"
            className="chat-search-input"
            placeholder="Search in chat..."
            value={searchQuery}
            onChange={(e) => {
              const q = e.target.value;
              setSearchQuery(q);
              if (!q.trim()) {
                setSearchResults([]);
                setSearchIndex(0);
                return;
              }
              const lower = q.toLowerCase();
              const hits = decryptedMessages
                .map((m, i) => (m.text?.toLowerCase().includes(lower) ? i : -1))
                .filter((i) => i >= 0);
              setSearchResults(hits);
              setSearchIndex(hits.length > 0 ? hits.length - 1 : 0);
              // Scroll to last (most recent) match
              if (hits.length > 0) scrollToMessageIndex(hits[hits.length - 1]);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setShowSearch(false);
                setSearchQuery('');
                setSearchResults([]);
              }
              if (e.key === 'Enter' && searchResults.length > 0) {
                const next = (searchIndex - 1 + searchResults.length) % searchResults.length;
                setSearchIndex(next);
                scrollToMessageIndex(searchResults[next]);
              }
            }}
          />
          <span className="chat-search-count">
            {searchResults.length > 0 ? `${searchResults.length - searchIndex}/${searchResults.length}` : searchQuery ? '0' : ''}
          </span>
          <button className="chat-search-nav" title="Previous" disabled={searchResults.length === 0} onClick={() => {
            if (searchResults.length === 0) return;
            const next = (searchIndex - 1 + searchResults.length) % searchResults.length;
            setSearchIndex(next);
            scrollToMessageIndex(searchResults[next]);
          }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/></svg>
          </button>
          <button className="chat-search-nav" title="Next" disabled={searchResults.length === 0} onClick={() => {
            if (searchResults.length === 0) return;
            const next = (searchIndex + 1) % searchResults.length;
            setSearchIndex(next);
            scrollToMessageIndex(searchResults[next]);
          }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>
          </button>
          <button className="chat-search-nav" title="Close" onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>
      )}
      <div className="messages-container" ref={messagesContainerRef}>
        {loading && <div className="loading-spinner">Loading messages...</div>}
        {!loading && decryptedMessages.length === 0 && (
          <div className="empty-state">
            <p>No messages yet. Say hello!</p>
          </div>
        )}
        {decryptedMessages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isMine={msg.senderId === currentUid}
            showSender={chat.type === 'group'}
            memberCount={members.length}
            highlight={searchQuery && msg.text?.toLowerCase().includes(searchQuery.toLowerCase()) ? searchQuery : undefined}
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
                    <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
                  </svg>
                  File
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
            accept="*/*"
            style={{ display: 'none' }}
            aria-label="Upload file"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              e.target.value = '';
              setUploading(true);
              try {
                const dataUrl = await compressImage(file);
                await sendMediaMessage(chat.id, currentUid, currentName, 'image', dataUrl, '📎 File');
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
            <button className="send-btn" onClick={handleSend} disabled={uploading} title="Send message">
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
      {showKeyRecovery && (
        <KeyRecoveryModal
          onRecover={async (pw) => { await recoverKeys(pw); setShowKeyRecovery(false); }}
          onSkip={() => setShowKeyRecovery(false)}
        />
      )}
    </div>
  );
};
