import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useChats, membersToArray, getUserProfile } from '../../hooks/useChats';
import { useCall } from '../../hooks/useCall';
import { useContactRequests } from '../../hooks/useContactRequests';
import { useGroupInvites } from '../../hooks/useGroupInvites';
import { useNotifications } from '../../hooks/useNotifications';
import { useUnreadCounts } from '../../hooks/useUnreadCounts';
import { usePushSubscription } from '../../hooks/usePushSubscription';
import { ChatList } from '../Chat/ChatList';
import { ChatWindow } from '../Chat/ChatWindow';
import { NewChatModal } from '../Chat/NewChatModal';
import { NewGroupModal } from '../Chat/NewGroupModal';
import { ProfilePanel } from '../Chat/ProfilePanel';
import { CallScreen } from '../Chat/CallScreen';
import { ContactRequestsModal } from '../Chat/ContactRequestsModal';
import { GroupInfoPanel } from '../Chat/GroupInfoPanel';
import { NotificationSettings } from '../Chat/NotificationSettings';
import { KeyRecoveryModal } from '../Chat/KeyRecoveryModal';
import { FeedView } from '../Feed/FeedView';
import type { Chat, UserProfile } from '../../types';
import { YappLogo } from '../YappLogo';
import './AppLayout.css';

export const AppLayout: React.FC = () => {
  const { user, profile, needsKeyRecovery, recoverKeys } = useAuth();
  const { chats, loading } = useChats(user?.uid);

  // Toast state — must be declared before useCall which receives showToast
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const showToast = useCallback((msg: string) => {
    clearTimeout(toastTimer.current);
    setToastMsg(msg);
    toastTimer.current = setTimeout(() => setToastMsg(null), 4000);
  }, []);

  // Clean up toast timer on unmount
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const call = useCall(user?.uid ?? '', profile?.displayName ?? '', showToast);
  const contactRequests = useContactRequests(user?.uid);
  const { invites: groupInvites, joinRequests } = useGroupInvites(user?.uid);
  const { notifyMessage, notifyGroupInvite, notifyJoinRequest, notifyContactRequest, notifyIncomingCall, refreshPrefs } = useNotifications();
  const unreadCounts = useUnreadCounts(chats, user?.uid);
  const totalUnread = Object.values(unreadCounts).reduce((sum, n) => sum + n, 0);

  // Register for Web Push (saves subscription to RTDB)
  usePushSubscription(user?.uid);
  const notificationCount = contactRequests.length + groupInvites.length + joinRequests.length;

  // Set app badge on installed PWA (Android, Windows, iOS)
  useEffect(() => {
    const badgeCount = totalUnread + notificationCount;
    if ('setAppBadge' in navigator) {
      const nav = navigator as Navigator & { setAppBadge(count: number): Promise<void>; clearAppBadge(): Promise<void> };
      if (badgeCount > 0) {
        nav.setAppBadge(badgeCount).catch(() => {});
      } else {
        nav.clearAppBadge().catch(() => {});
      }
    }
    // Also update document title with unread count
    document.title = badgeCount > 0 ? `(${badgeCount}) Yappin'` : "Yappin'";
  }, [totalUnread, notificationCount]);
  const [appMode, setAppMode] = useState<'chat' | 'feed'>('chat');
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showRequests, setShowRequests] = useState(false);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [showNotifSettings, setShowNotifSettings] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [keyRecoveryDismissed, setKeyRecoveryDismissed] = useState(false);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [chatListScrollable, setChatListScrollable] = useState(false);
  const chatListRef = useRef<HTMLDivElement>(null);
  const [addableMembers, setAddableMembers] = useState<UserProfile[]>([]);
  const pendingChatIdRef = useRef<string | null>(null);

  // Compute addable members when a call is active (chat members not yet in the call)
  useEffect(() => {
    if (call.callState !== 'active' || !call.callData || !activeChat) {
      setAddableMembers([]);
      return;
    }
    const chatMemberUids = membersToArray(activeChat.members);
    const callParticipantUids = new Set(Object.keys(call.callData.participants));
    const addableUids = chatMemberUids.filter(
      (uid) => uid !== user?.uid && !callParticipantUids.has(uid)
    );
    if (addableUids.length === 0) {
      setAddableMembers([]);
      return;
    }
    let cancelled = false;
    Promise.all(addableUids.map((uid) => getUserProfile(uid))).then((profiles) => {
      if (cancelled) return;
      setAddableMembers(profiles.filter((p): p is UserProfile => p !== null));
    });
    return () => { cancelled = true; };
  }, [call.callState, call.callData, activeChat, user?.uid]);

  // Detect when chat list overflows (needs scrolling)
  useEffect(() => {
    const el = chatListRef.current;
    if (!el) return;
    const check = () => setChatListScrollable(el.scrollHeight > el.clientHeight);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [chats.length]);

  // Clear search when list no longer scrollable
  useEffect(() => {
    if (!chatListScrollable) setSidebarSearch('');
  }, [chatListScrollable]);

  // Use ref so notification effect always reads current activeChat without re-running
  const activeChatRef = useRef(activeChat);
  activeChatRef.current = activeChat;

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
        const text = chat.lastMessage.encrypted ? 'New message' : chat.lastMessage.text;
        notifyMessage(name, text, chat.id, activeChatRef.current?.id);
      }
    });
    const snap: Record<string, number> = {};
    chats.forEach((c) => { snap[c.id] = c.lastMessage?.timestamp ?? 0; });
    prevChatSnapRef.current = snap;
  }, [chats, user?.uid, notifyMessage]);

  // Notify on incoming calls (shows system notification when tab is in background)
  useEffect(() => {
    if (call.callState === 'incoming' && call.callData) {
      notifyIncomingCall(
        call.callData.callerName,
        call.callData.callType,
        call.callData.id
      );
    }
  }, [call.callState, call.callData, notifyIncomingCall]);

  // Notify on new contact requests
  useEffect(() => {
    if (contactRequests.length > prevContactReqCountRef.current && prevContactReqCountRef.current > 0) {
      const newest = contactRequests[0];
      if (newest) {
        notifyContactRequest(newest.fromName, newest.fromEmail);
      }
    }
    prevContactReqCountRef.current = contactRequests.length;
  }, [contactRequests, notifyContactRequest]);

  // Notify on new group invites
  useEffect(() => {
    if (groupInvites.length > prevGroupInviteCountRef.current && prevGroupInviteCountRef.current > 0) {
      const newest = groupInvites[0];
      if (newest) {
        notifyGroupInvite(newest.chatName, newest.invitedBy);
      }
    }
    prevGroupInviteCountRef.current = groupInvites.length;
  }, [groupInvites, notifyGroupInvite]);

  // Notify on new join requests
  useEffect(() => {
    if (joinRequests.length > prevJoinRequestCountRef.current && prevJoinRequestCountRef.current > 0) {
      const newest = joinRequests[0];
      if (newest) {
        notifyJoinRequest(newest.chatName, newest.fromName);
      }
    }
    prevJoinRequestCountRef.current = joinRequests.length;
  }, [joinRequests, notifyJoinRequest]);

  // On mobile, hide sidebar when chat is selected
  const handleSelectChat = useCallback((chat: Chat) => {
    setActiveChat(chat);
    if (window.innerWidth < 768) {
      setShowSidebar(false);
    }
  }, []);

  const handleBack = useCallback(() => {
    setShowSidebar(true);
    setActiveChat(null);
  }, []);

  // Use refs for stable service worker handler to avoid re-registering on every render
  const callRef = useRef(call);
  callRef.current = call;
  const chatsRef = useRef(chats);
  chatsRef.current = chats;

  // Handle notification click — open the right chat or answer/decline a call
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'OPEN_CHAT' && event.data.chatId) {
        const chat = chatsRef.current.find((c) => c.id === event.data.chatId);
        if (chat) handleSelectChat(chat);
      } else if (event.data?.type === 'ANSWER_CALL') {
        if (callRef.current.callState === 'incoming') {
          callRef.current.acceptCall();
        }
      } else if (event.data?.type === 'DECLINE_CALL') {
        if (callRef.current.callState === 'incoming') {
          callRef.current.rejectCall();
        }
      }
    };
    navigator.serviceWorker?.addEventListener('message', handler);
    return () => navigator.serviceWorker?.removeEventListener('message', handler);
  }, [handleSelectChat]);

  // Handle cold-start: if app was opened via notification with ?answerCall= param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const answerCallId = params.get('answerCall');
    if (answerCallId && call.callState === 'incoming' && call.callData?.id === answerCallId) {
      call.acceptCall();
      // Clean up the URL param
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [call.callState, call.callData, call.acceptCall]);

  // Keep activeChat in sync with live data
  const activeChatIdRef = useRef(activeChat?.id);
  activeChatIdRef.current = activeChat?.id;
  useEffect(() => {
    const id = activeChatIdRef.current;
    if (id) {
      const updated = chats.find((c) => c.id === id);
      if (updated) setActiveChat(updated);
    }
    // Resolve pending chat creation (newly created chat may not exist yet in chats)
    const pendingId = pendingChatIdRef.current;
    if (pendingId) {
      const chat = chats.find((c) => c.id === pendingId);
      if (chat) {
        pendingChatIdRef.current = null;
        handleSelectChat(chat);
      }
    }
  }, [chats, handleSelectChat]);

  return (
    <div className={`app-layout ${appMode === 'feed' ? 'app-mode-feed' : 'app-mode-chat'}`}>
      <div className="app-layout-body">
      {/* Sidebar */}
      <aside className={`sidebar ${showSidebar ? 'visible' : ''}`}>
        <header className="sidebar-header">
          <div className="sidebar-user" onClick={() => setShowProfile(true)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowProfile(true); } }} aria-label="Open profile">
            <div className="avatar avatar-sm">
              {profile?.photoURL
                ? <img src={profile.photoURL} alt="" className="avatar-img" />
                : profile?.displayName?.charAt(0).toUpperCase()
              }
            </div>
            <span className="sidebar-username">{profile?.displayName}</span>
          </div>
          <div className="sidebar-actions">
            <button className="icon-btn" title="New chat" aria-label="New chat" onClick={() => setShowNewChat(true)}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12zM11 5h2v4h4v2h-4v4h-2v-4H7V9h4z"/>
              </svg>
            </button>
            <button className="icon-btn" title="New group" aria-label="New group" onClick={() => setShowNewGroup(true)}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
              </svg>
            </button>
            <button className="icon-btn requests-btn" title="Notifications" aria-label="Notifications" onClick={() => setShowRequests(true)}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/>
              </svg>
              {notificationCount > 0 && (
                <span className="requests-badge">{notificationCount}</span>
              )}
            </button>
            <button className="icon-btn" title="Settings" aria-label="Settings" onClick={() => setShowNotifSettings(true)}>
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
              </svg>
            </button>
          </div>
        </header>

        {/* Sidebar search — only visible when chat list requires scrolling */}
        {chatListScrollable && (
          <div className="sidebar-search">
          <svg className="sidebar-search-icon" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
          </svg>
          <input
            type="text"
            className="sidebar-search-input"
            placeholder="Search chats..."
            value={sidebarSearch}
            onChange={(e) => setSidebarSearch(e.target.value)}
          />
          {sidebarSearch && (
            <button className="sidebar-search-clear" onClick={() => setSidebarSearch('')} title="Clear search" aria-label="Clear search">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
          )}
          </div>
        )}

        <div ref={chatListRef} style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <ChatList
          chats={chats}
          loading={loading}
          activeId={activeChat?.id ?? null}
          currentUid={user?.uid ?? ''}
          unreadCounts={unreadCounts}
          onSelect={handleSelectChat}
          onChatDeleted={() => setActiveChat(null)}
          searchFilter={sidebarSearch}
        />
        </div>
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

      {/* Feed area */}
      {appMode === 'feed' && profile && (
        <div className="feed-main">
          <FeedView currentUser={profile} />
        </div>
      )}
      </div>

      {/* Bottom navigation */}
      <nav className="bottom-nav" aria-label="Main navigation">
        <div className="bottom-nav-logo">
          <YappLogo size={28} />
        </div>
        <button
          className={`bottom-nav-item ${appMode === 'chat' ? 'active' : ''}`}
          onClick={() => setAppMode('chat')}
          aria-current={appMode === 'chat' ? 'page' : undefined}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
          </svg>
          <span>Chats</span>
          {(totalUnread + notificationCount) > 0 && (
            <span className="bottom-nav-badge">{totalUnread + notificationCount}</span>
          )}
        </button>
        <button
          className={`bottom-nav-item ${appMode === 'feed' ? 'active' : ''}`}
          onClick={() => setAppMode('feed')}
          aria-current={appMode === 'feed' ? 'page' : undefined}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
            <path d="M18 11v2h4v-2h-4zm-2 6.61c.96.71 2.21 1.65 3.2 2.39.4-.53.8-1.07 1.2-1.6-.99-.74-2.24-1.68-3.2-2.4-.4.54-.8 1.08-1.2 1.61zM20.4 5.6c-.4-.53-.8-1.07-1.2-1.6-.99.74-2.24 1.68-3.2 2.4.4.53.8 1.07 1.2 1.6.96-.72 2.21-1.65 3.2-2.4zM4 9c-1.1 0-2 .9-2 2v2c0 1.1.9 2 2 2h1l5 3V6L5 9H4zm11.5 3c0-1.33-.58-2.53-1.5-3.35v6.69c.92-.81 1.5-2.01 1.5-3.34z"/>
          </svg>
          <span>Yapps</span>
        </button>
      </nav>

      {/* Modals */}
      {showNewChat && profile && (
        <NewChatModal
          currentUser={profile}
          existingChats={chats}
          onClose={() => setShowNewChat(false)}
          onChatCreated={(chatId) => {
            setShowNewChat(false);
            const chat = chats.find((c) => c.id === chatId);
            if (chat) handleSelectChat(chat);
            else pendingChatIdRef.current = chatId;
          }}
        />
      )}
      {showNewGroup && profile && (
        <NewGroupModal
          currentUser={profile}
          onClose={() => setShowNewGroup(false)}
          onGroupCreated={(chatId) => {
            setShowNewGroup(false);
            const chat = chats.find((c) => c.id === chatId);
            if (chat) handleSelectChat(chat);
            else pendingChatIdRef.current = chatId;
          }}
        />
      )}
      {showProfile && profile && (
        <ProfilePanel
          profile={profile}
          onClose={() => setShowProfile(false)}
        />
      )}
      {showRequests && profile && (
        <ContactRequestsModal
          currentUser={profile}
          requests={contactRequests}
          groupInvites={groupInvites}
          joinRequests={joinRequests}
          onClose={() => setShowRequests(false)}
          onChatCreated={(chatId) => {
            setShowRequests(false);
            const chat = chats.find((c) => c.id === chatId);
            if (chat) handleSelectChat(chat);
            else pendingChatIdRef.current = chatId;
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
          addableMembers={addableMembers}
          onAddParticipant={call.addParticipant}
        />
      )}

      {/* E2EE key recovery modal */}
      {needsKeyRecovery && !keyRecoveryDismissed && (
        <KeyRecoveryModal
          onRecover={recoverKeys}
          onSkip={() => setKeyRecoveryDismissed(true)}
        />
      )}
      {toastMsg && (
        <div className="app-toast" onClick={() => setToastMsg(null)}>
          {toastMsg}
        </div>
      )}
    </div>
  );
};
