import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useChats, membersToArray } from '../../hooks/useChats';
import { useCall } from '../../hooks/useCall';
import { useContactRequests } from '../../hooks/useContactRequests';
import { useGroupInvites } from '../../hooks/useGroupInvites';
import { useNotifications } from '../../hooks/useNotifications';
import { ChatList } from '../Chat/ChatList';
import { ChatWindow } from '../Chat/ChatWindow';
import { NewChatModal } from '../Chat/NewChatModal';
import { NewGroupModal } from '../Chat/NewGroupModal';
import { ProfilePanel } from '../Chat/ProfilePanel';
import { CallScreen } from '../Chat/CallScreen';
import { ContactRequestsModal } from '../Chat/ContactRequestsModal';
import { GroupInfoPanel } from '../Chat/GroupInfoPanel';
import { NotificationSettings } from '../Chat/NotificationSettings';
import type { Chat } from '../../types';
import { YappLogo } from '../YappLogo';
import './AppLayout.css';

export const AppLayout: React.FC = () => {
  const { user, profile, signOut } = useAuth();
  const { chats, loading } = useChats(user?.uid);
  const call = useCall(user?.uid ?? '', profile?.displayName ?? '');
  const contactRequests = useContactRequests(user?.uid);
  const { invites: groupInvites, joinRequests } = useGroupInvites(user?.uid);
  const { notifyMessage, notifyGroupInvite, notifyJoinRequest, notifyContactRequest, refreshPrefs } = useNotifications();
  const notificationCount = contactRequests.length + groupInvites.length + joinRequests.length;
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [showNotifSettings, setShowNotifSettings] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);

  // Track previous counts to detect new items
  const prevChatSnapRef = useRef<Record<string, number>>({});
  const prevContactReqCountRef = useRef(0);
  const prevGroupInviteCountRef = useRef(0);
  const prevJoinRequestCountRef = useRef(0);

  // Notify on new messages (compare lastMessage timestamps)
  useEffect(() => {
    const prev = prevChatSnapRef.current;
    chats.forEach((chat) => {
      const ts = chat.lastMessage?.timestamp ?? 0;
      const prevTs = prev[chat.id] ?? 0;
      if (ts > prevTs && prevTs > 0 && chat.lastMessage && chat.lastMessage.senderId !== user?.uid) {
        const name = chat.type === 'group'
          ? `${chat.lastMessage.senderName} in ${chat.name || 'Group'}`
          : chat.lastMessage.senderName;
        notifyMessage(name, chat.lastMessage.text, chat.id);
      }
    });
    const snap: Record<string, number> = {};
    chats.forEach((c) => { snap[c.id] = c.lastMessage?.timestamp ?? 0; });
    prevChatSnapRef.current = snap;
  }, [chats, user?.uid, notifyMessage]);

  // Notify on new contact requests
  useEffect(() => {
    if (contactRequests.length > prevContactReqCountRef.current && prevContactReqCountRef.current >= 0) {
      const newest = contactRequests[contactRequests.length - 1];
      if (newest && prevContactReqCountRef.current > 0) {
        notifyContactRequest(newest.fromName, newest.fromEmail);
      }
    }
    prevContactReqCountRef.current = contactRequests.length;
  }, [contactRequests, notifyContactRequest]);

  // Notify on new group invites
  useEffect(() => {
    if (groupInvites.length > prevGroupInviteCountRef.current && prevGroupInviteCountRef.current >= 0) {
      const newest = groupInvites[groupInvites.length - 1];
      if (newest && prevGroupInviteCountRef.current > 0) {
        notifyGroupInvite(newest.chatName, newest.invitedBy);
      }
    }
    prevGroupInviteCountRef.current = groupInvites.length;
  }, [groupInvites, notifyGroupInvite]);

  // Notify on new join requests
  useEffect(() => {
    if (joinRequests.length > prevJoinRequestCountRef.current && prevJoinRequestCountRef.current >= 0) {
      const newest = joinRequests[joinRequests.length - 1];
      if (newest && prevJoinRequestCountRef.current > 0) {
        notifyJoinRequest(newest.chatName, newest.fromName);
      }
    }
    prevJoinRequestCountRef.current = joinRequests.length;
  }, [joinRequests, notifyJoinRequest]);

  // On mobile, hide sidebar when chat is selected
  const handleSelectChat = (chat: Chat) => {
    setActiveChat(chat);
    if (window.innerWidth < 768) {
      setShowSidebar(false);
    }
  };

  const handleBack = () => {
    setShowSidebar(true);
    setActiveChat(null);
  };

  // Keep activeChat in sync with live data
  useEffect(() => {
    if (activeChat) {
      const updated = chats.find((c) => c.id === activeChat.id);
      if (updated) setActiveChat(updated);
    }
  }, [chats]);

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className={`sidebar ${showSidebar ? 'visible' : ''}`}>
        <header className="sidebar-header">
          <div className="sidebar-user" onClick={() => setShowProfile(true)}>
            <div className="avatar avatar-sm">
              {profile?.photoURL
                ? <img src={profile.photoURL} alt="" className="avatar-img" />
                : profile?.displayName?.charAt(0).toUpperCase()
              }
            </div>
            <span className="sidebar-username">{profile?.displayName}</span>
          </div>
          <div className="sidebar-actions">
            <button className="icon-btn" title="New group" onClick={() => setShowNewGroup(true)}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
              </svg>
            </button>
            <button className="icon-btn" title="New chat" onClick={() => setShowNewChat(true)}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12zM11 5h2v4h4v2h-4v4h-2v-4H7V9h4z"/>
              </svg>
            </button>
            <button className="icon-btn requests-btn" title="Notifications" onClick={() => setShowRequests(true)}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/>
              </svg>
              {notificationCount > 0 && (
                <span className="requests-badge">{notificationCount}</span>
              )}
            </button>
            <button className="icon-btn" title="Notification settings" onClick={() => setShowNotifSettings(true)}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
              </svg>
            </button>
            <button className="icon-btn" title="Sign out" onClick={signOut}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
              </svg>
            </button>
          </div>
        </header>

        <ChatList
          chats={chats}
          loading={loading}
          activeId={activeChat?.id ?? null}
          currentUid={user?.uid ?? ''}
          onSelect={handleSelectChat}
        />
      </aside>

      {/* Main chat area */}
      <main className={`chat-main ${!showSidebar ? 'visible' : ''}`}>
        {activeChat ? (
          <ChatWindow
            chat={activeChat}
            currentUid={user?.uid ?? ''}
            currentName={profile?.displayName ?? ''}
            onBack={handleBack}
            onStartCall={(callType) => {
              const members = membersToArray(activeChat.members);
              call.startCall(activeChat.id, callType, members);
            }}
            onShowGroupInfo={() => setShowGroupInfo(true)}
          />
        ) : (
          <div className="no-chat">
            <YappLogo size={80} />
            <h2>Yappin'</h2>
            <p className="app-subtitle">Keep yappin' man</p>
            <p>Select a chat or start a new conversation</p>
          </div>
        )}
      </main>

      {/* Modals */}
      {showNewChat && (
        <NewChatModal
          currentUser={profile!}
          onClose={() => setShowNewChat(false)}
          onChatCreated={(chatId) => {
            setShowNewChat(false);
            const chat = chats.find((c) => c.id === chatId);
            if (chat) handleSelectChat(chat);
          }}
        />
      )}
      {showNewGroup && (
        <NewGroupModal
          currentUser={profile!}
          onClose={() => setShowNewGroup(false)}
          onGroupCreated={(chatId) => {
            setShowNewGroup(false);
            const chat = chats.find((c) => c.id === chatId);
            if (chat) handleSelectChat(chat);
          }}
        />
      )}
      {showProfile && (
        <ProfilePanel
          profile={profile!}
          onClose={() => setShowProfile(false)}
        />
      )}
      {showRequests && (
        <ContactRequestsModal
          currentUser={profile!}
          requests={contactRequests}
          groupInvites={groupInvites}
          joinRequests={joinRequests}
          onClose={() => setShowRequests(false)}
          onChatCreated={(chatId) => {
            setShowRequests(false);
            const chat = chats.find((c) => c.id === chatId);
            if (chat) handleSelectChat(chat);
          }}
        />
      )}
      {showNotifSettings && (
        <NotificationSettings
          onClose={() => setShowNotifSettings(false)}
          onPrefsChanged={refreshPrefs}
        />
      )}
      {showGroupInfo && activeChat && activeChat.type === 'group' && (
        <GroupInfoPanel
          chat={activeChat}
          currentUid={user?.uid ?? ''}
          currentName={profile?.displayName ?? ''}
          onClose={() => setShowGroupInfo(false)}
          onLeft={() => { setShowGroupInfo(false); setActiveChat(null); setShowSidebar(true); }}
        />
      )}

      {/* Call overlay */}
      {call.callState !== 'idle' && (
        <CallScreen
          callState={call.callState}
          callData={call.callData}
          localStream={call.localStream}
          remoteStreams={call.remoteStreams}
          isMuted={call.isMuted}
          isVideoOff={call.isVideoOff}
          onAccept={call.acceptCall}
          onReject={call.rejectCall}
          onEnd={call.endCall}
          onToggleMute={call.toggleMute}
          onToggleVideo={call.toggleVideo}
        />
      )}
    </div>
  );
};
