import React, { useState } from 'react';
import { searchUsers, createGroupChat } from '../../hooks/useChats';
import { useAuth } from '../../contexts/AuthContext';
import type { UserProfile } from '../../types';

interface Props {
  currentUser: UserProfile;
  onClose: () => void;
  onGroupCreated: (chatId: string) => void;
}

export const NewGroupModal: React.FC<Props> = ({ currentUser, onClose, onGroupCreated }) => {
  const { cryptoKeys } = useAuth();
  const [groupName, setGroupName] = useState('');
  const [email, setEmail] = useState('');
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleAddMember = async () => {
    if (!email.trim()) return;
    setError('');
    setSearching(true);
    try {
      const users = await searchUsers(email.trim().toLowerCase(), currentUser.uid);
      if (users.length === 0) {
        setError('No user found with that email');
      } else {
        const user = users[0];
        if (members.find((m) => m.uid === user.uid)) {
          setError('User already added');
        } else {
          setMembers([...members, user]);
          setEmail('');
        }
      }
    } catch {
      setError('Failed to search');
    }
    setSearching(false);
  };

  const removeMember = (uid: string) => {
    setMembers(members.filter((m) => m.uid !== uid));
  };

  const handleCreate = async () => {
    if (!groupName.trim()) {
      setError('Group name is required');
      return;
    }
    if (members.length === 0) {
      setError('Add at least one member');
      return;
    }
    setCreating(true);
    try {
      const chatId = await createGroupChat(
        currentUser,
        groupName.trim(),
        members.map((m) => m.uid),
        cryptoKeys ?? undefined
      );
      onGroupCreated(chatId);
    } catch {
      setError('Failed to create group');
    }
    setCreating(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>New Group</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <input
            className="modal-input"
            type="text"
            placeholder="Group name"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
          />
          <input
            className="modal-input"
            type="email"
            placeholder="Add member by email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddMember()}
          />
          <button
            className="modal-btn modal-btn-muted"
            onClick={handleAddMember}
            disabled={searching || !email.trim()}
          >
            {searching ? 'Searching...' : 'Add Member'}
          </button>

          {error && <p className="modal-error">{error}</p>}

          {members.length > 0 && (
            <div className="member-chips">
              {members.map((m) => (
                <div key={m.uid} className="member-chip">
                  {m.displayName}
                  <button onClick={() => removeMember(m.uid)}>×</button>
                </div>
              ))}
            </div>
          )}

          <button
            className="modal-btn"
            onClick={handleCreate}
            disabled={creating || !groupName.trim() || members.length === 0}
          >
            {creating ? 'Creating...' : `Create Group (${members.length + 1} members)`}
          </button>
        </div>
      </div>
    </div>
  );
};
