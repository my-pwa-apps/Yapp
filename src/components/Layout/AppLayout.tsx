import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useChats, membersToArray, approvePendingMember, rejectPendingMember } from '../../hooks/useChats';
import { useCall } from '../../hooks/useCall';
import { useContactRequests } from '../../hooks/useContactRequests';
import { useGroupInvites } from '../../hooks/useGroupInvites';
import { ChatList } from '../Chat/ChatList';
import { ChatWindow } from '../Chat/ChatWindow';
import { NewChatModal } from '../Chat/NewChatModal';
import { NewGroupModal } from '../Chat/NewGroupModal';
import { ProfilePanel } from '../Chat/ProfilePanel';
import { CallScreen } from '../Chat/CallScreen';
import { ContactRequestsModal } from '../Chat/ContactRequestsModal';
import { GroupInfoPanel } from '../Chat/GroupInfoPanel';
import type { Chat } from '../../types';
import { YappLogo } from '../YappLogo';
import './AppLayout.css';

export const AppLayout: React.FC = () => {
  const { user, profile, signOut } = useAuth();
  const { chats, loading } = useChats(user?.uid);
  const call = useCall(user?.uid ?? '', profile?.displayName ?? '');
  const contactRequests = useContactRequests(user?.uid);
  const groupInvites = useGroupInvites(user?.uid);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);

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
            <button className="icon-btn requests-btn" title="Contact requests" onClick={() => setShowRequests(true)}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
              {contactRequests.length > 0 && (
                <span className="requests-badge">{contactRequests.length}</span>
              )}
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
          onClose={() => setShowRequests(false)}
          onChatCreated={(chatId) => {
            setShowRequests(false);
            const chat = chats.find((c) => c.id === chatId);
            if (chat) handleSelectChat(chat);
          }}
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

      {/* Group invite banners */}
      {groupInvites.length > 0 && (
        <div className="group-invites-container">
          {groupInvites.map((inv) => (
            <div key={inv.chatId} className="group-invite-banner">
              <div className="group-invite-info">
                <strong>{inv.invitedBy}</strong> invited you to <strong>{inv.chatName}</strong>
              </div>
              <div className="group-invite-actions">
                <button
                  className="group-action-btn approve"
                  onClick={async () => {
                    await approvePendingMember(inv.chatId, user!.uid, profile!.displayName, profile!.displayName);
                  }}
                >
                  Accept
                </button>
                <button
                  className="group-action-btn remove"
                  onClick={async () => {
                    await rejectPendingMember(inv.chatId, user!.uid);
                  }}
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
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
