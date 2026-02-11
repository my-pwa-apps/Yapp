import React, { useState } from 'react';
import { searchUsers, findOrCreateDirectChat } from '../../hooks/useChats';
import type { UserProfile } from '../../types';

interface Props {
  currentUser: UserProfile;
  onClose: () => void;
  onChatCreated: (chatId: string) => void;
}

export const NewChatModal: React.FC<Props> = ({ currentUser, onClose, onChatCreated }) => {
  const [email, setEmail] = useState('');
  const [results, setResults] = useState<UserProfile[]>([]);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleSearch = async () => {
    if (!email.trim()) return;
    setError('');
    setSearching(true);
    try {
      const users = await searchUsers(email.trim().toLowerCase(), currentUser.uid);
      setResults(users);
      if (users.length === 0) setError('No user found with that email');
    } catch {
      setError('Failed to search');
    }
    setSearching(false);
  };

  const handleStartChat = async (user: UserProfile) => {
    setCreating(true);
    try {
      const chatId = await findOrCreateDirectChat(currentUser, user.uid);
      onChatCreated(chatId);
    } catch {
      setError('Failed to create chat');
    }
    setCreating(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>New Chat</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
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

          {results.map((user) => (
            <div key={user.uid} className="user-result">
              <div className="avatar avatar-sm">
                {user.displayName.charAt(0).toUpperCase()}
              </div>
              <div className="user-result-info">
                <div className="user-result-name">{user.displayName}</div>
                <div className="user-result-email">{user.email}</div>
              </div>
              <button onClick={() => handleStartChat(user)} disabled={creating}>
                Chat
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
