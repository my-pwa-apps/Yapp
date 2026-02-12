import React, { useEffect, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { db } from '../../firebase';
import { membersToArray } from '../../hooks/useChats';
import type { Chat, UserProfile } from '../../types';

interface Props {
  chats: Chat[];
  loading: boolean;
  activeId: string | null;
  currentUid: string;
  unreadCounts?: Record<string, number>;
  onSelect: (chat: Chat) => void;
}

export const ChatList: React.FC<Props> = ({ chats, loading, activeId, currentUid, unreadCounts = {}, onSelect }) => {
  const [memberProfiles, setMemberProfiles] = useState<Record<string, UserProfile>>({});

  // Live-listen to other users' profiles for realtime presence, name & photo updates
  useEffect(() => {
    const uids = new Set<string>();
    chats.forEach((c) => {
      if (c.type === 'direct') {
        membersToArray(c.members).forEach((m) => {
          if (m !== currentUid) uids.add(m);
        });
      }
    });

    const unsubs: (() => void)[] = [];
    uids.forEach((uid) => {
      const userRef = ref(db, `users/${uid}`);
      const unsub = onValue(userRef, (snap) => {
        if (snap.exists()) {
          setMemberProfiles((prev) => ({ ...prev, [uid]: snap.val() as UserProfile }));
        }
      });
      unsubs.push(unsub);
    });

    return () => unsubs.forEach((u) => u());
  }, [chats, currentUid]);

  const isSelfChat = (chat: Chat) => {
    if (chat.type !== 'direct') return false;
    const members = membersToArray(chat.members);
    return members.length === 1 && members[0] === currentUid;
  };

  const getChatName = (chat: Chat) => {
    if (chat.type === 'group') return chat.name || 'Group';
    if (isSelfChat(chat)) return 'You';
    const otherId = membersToArray(chat.members).find((m) => m !== currentUid);
    if (otherId && memberProfiles[otherId]) return memberProfiles[otherId].displayName;
    return 'Chat';
  };

  const getChatAvatar = (chat: Chat) => {
    // Try to get profile photo for direct chats
    if (chat.type === 'direct') {
      if (isSelfChat(chat)) return null; // self-chat, no photo needed
      const otherId = membersToArray(chat.members).find((m) => m !== currentUid);
      if (otherId && memberProfiles[otherId]?.photoURL) {
        return { type: 'photo' as const, url: memberProfiles[otherId].photoURL! };
      }
    }
    const name = getChatName(chat);
    return { type: 'initial' as const, letter: name.charAt(0).toUpperCase() };
  };

  const formatTime = (ts: number | undefined) => {
    if (!ts) return '';
    const date = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    if (diff < 86400000 && now.getDate() === date.getDate()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (diff < 86400000 * 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return <div className="loading-spinner">Loading chats...</div>;
  }

  if (chats.length === 0) {
    return (
      <div className="empty-state">
        <svg viewBox="0 0 24 24" width="48" height="48" fill="#667781">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
        </svg>
        <p>No conversations yet.<br />Start a new chat!</p>
      </div>
    );
  }

  return (
    <div className="chat-list">
      {chats.map((chat) => (
        <div
          key={chat.id}
          className={`chat-item ${chat.id === activeId ? 'active' : ''}`}
          onClick={() => onSelect(chat)}
        >
          <div className="avatar avatar-md">
            {(() => {
              const av = getChatAvatar(chat);
              if (av && av.type === 'photo') return <img src={av.url} alt="" className="avatar-img" />;
              return av ? av.letter : '📝';
            })()}
          </div>
          <div className="chat-item-info">
            <div className="chat-item-top">
              <span className="chat-item-name">
                {getChatName(chat)}
              </span>
              <span className="chat-item-time">
                {chat.lastMessage ? formatTime(chat.lastMessage.timestamp) : ''}
              </span>
            </div>
            <div className="chat-item-last">
              <span className="chat-item-badge">
                {chat.type === 'group' && <span className="group-badge">GROUP</span>}
              </span>
              <span className="chat-item-preview">
                {chat.lastMessage
                  ? `${chat.lastMessage.senderId === currentUid ? 'You' : chat.lastMessage.senderName}: ${chat.lastMessage.text}`
                  : 'No messages yet'}
              </span>
              {(unreadCounts[chat.id] ?? 0) > 0 && (
                <span className="unread-badge">{unreadCounts[chat.id]}</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
