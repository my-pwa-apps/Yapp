import React, { useState } from 'react';
import { searchUsers, findOrCreateDirectChat } from '../../hooks/useChats';
import { sendContactRequest } from '../../hooks/useContactRequests';
import type { UserProfile, Chat } from '../../types';

interface Props {
  currentUser: UserProfile;
  existingChats: Chat[];
  onClose: () => void;
  onChatCreated: (chatId: string) => void;
}

export const NewChatModal: React.FC<Props> = ({ currentUser, existingChats, onClose, onChatCreated }) => {
  const [email, setEmail] = useState('');
  const [results, setResults] = useState<UserProfile[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const appUrl = 'https://my-pwa-apps.github.io/Yapp/';

  // Check if a self-chat already exists
  const hasSelfChat = existingChats.some(
    (c) => c.type === 'direct' && Object.keys(c.members).length === 1 && c.members[currentUser.uid]
  );

  const handleSearch = async () => {
    if (!email.trim()) return;
    setError('');
    setSuccess('');
    setNotFound(false);
    setSearching(true);
    try {
      const users = await searchUsers(email.trim().toLowerCase(), currentUser.uid);
      setResults(users);
      if (users.length === 0) {
        setNotFound(true);
      }
    } catch {
      setError('Failed to search');
    }
    setSearching(false);
  };

  const handleInvite = async () => {
    const inviteText = `Hey! Join me on Yappin' — ${appUrl}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Yappin'", text: inviteText, url: appUrl });
        setSuccess('Invite sent!');
      } catch {
        // User cancelled share
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(inviteText);
        setSuccess('Invite link copied to clipboard!');
      } catch {
        setError('Could not copy invite link');
      }
    }
  };

  const handleSendRequest = async (user: UserProfile) => {
    setCreating(true);
    setError('');
    setSuccess('');
    try {
      const result = await sendContactRequest(currentUser, user);
      if (result === 'sent') {
        setSuccess(`Request sent to ${user.displayName}!`);
        setResults([]);
      } else if (result === 'already_sent') {
        setError('Request already sent — waiting for them to accept');
      } else if (result === 'blocked') {
        setError('Cannot send request to this user');
      } else if (result === 'already_contacts') {
        // They're already contacts or reverse-request was auto-accepted — open chat
        const chatId = await findOrCreateDirectChat(currentUser, user.uid);
        onChatCreated(chatId);
      }
    } catch {
      setError('Failed to send request');
    }
    setCreating(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>New Chat</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {!hasSelfChat && (
            <>
              <button
                className="self-chat-btn"
                onClick={async () => {
                  setCreating(true);
                  try {
                    const chatId = await findOrCreateDirectChat(currentUser, currentUser.uid);
                    onChatCreated(chatId);
                  } catch {
                    setError('Failed to create self-chat');
                  }
                  setCreating(false);
                }}
                disabled={creating}
              >
                <div className="avatar avatar-sm">
                  {currentUser.displayName.charAt(0).toUpperCase()}
                </div>
                <span>Message yourself</span>
              </button>
              <div className="modal-divider">or search for someone</div>
            </>
          )}

          <input
            className="modal-input"
            type="email"
            placeholder="Enter user's email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button
            className="modal-btn"
            onClick={handleSearch}
            disabled={searching || !email.trim()}
          >
            {searching ? 'Searching...' : 'Search'}
          </button>

          {error && <p className="modal-error">{error}</p>}
          {success && <p className="modal-success">{success}</p>}

          {notFound && (
            <div className="invite-prompt">
              <p>No user found with that email.</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0 12px' }}>
                Invite them to join Yappin'!
              </p>
              <button className="modal-btn invite-btn" onClick={handleInvite}>
                Send Invite
              </button>
            </div>
          )}

          {results.map((user) => (
            <div key={user.uid} className="user-result">
              <div className="avatar avatar-sm">
                {user.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="user-result-info">
                <div className="user-result-name">{user.displayName}</div>
                <div className="user-result-email">{user.email}</div>
              </div>
              <button onClick={() => handleSendRequest(user)} disabled={creating}>
                Add
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
