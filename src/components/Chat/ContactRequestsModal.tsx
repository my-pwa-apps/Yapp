import React, { useEffect, useState } from 'react';
import { ref, get } from 'firebase/database';
import { db } from '../../firebase';
import type { ContactRequest, UserProfile } from '../../types';
import { acceptContactRequest, rejectContactRequest } from '../../hooks/useContactRequests';
import type { GroupInvite, GroupJoinRequest } from '../../hooks/useGroupInvites';
import { approvePendingMember, rejectPendingMember } from '../../hooks/useChats';
import { useAuth } from '../../contexts/AuthContext';
import { ensureGroupKeyForMember } from '../../hooks/useE2EE';
import type { Chat } from '../../types';

interface Props {
  currentUser: UserProfile;
  requests: ContactRequest[];
  groupInvites?: GroupInvite[];
  joinRequests?: GroupJoinRequest[];
  onClose: () => void;
  onChatCreated: (chatId: string) => void;
}

export const ContactRequestsModal: React.FC<Props> = ({
  currentUser,
  requests,
  groupInvites = [],
  joinRequests = [],
  onClose,
  onChatCreated,
}) => {
  const { cryptoKeys } = useAuth();
  const [processing, setProcessing] = useState<string | null>(null);

  const handleAccept = async (request: ContactRequest) => {
    setProcessing(request.from);
    try {
      const chatId = await acceptContactRequest(currentUser, request);
      onChatCreated(chatId);
    } catch {
      console.error('Failed to accept request');
    }
    setProcessing(null);
  };

  const handleReject = async (request: ContactRequest) => {
    setProcessing(request.from);
    try {
      await rejectContactRequest(currentUser.uid, request.from);
    } catch {
      console.error('Failed to reject request');
    }
    setProcessing(null);
  };

  const handleAcceptInvite = async (inv: GroupInvite) => {
    setProcessing(`inv-${inv.chatId}`);
    try {
      if (!inv.encryptedKeyReady) {
        throw new Error('The group encryption key is not ready yet. Ask an admin to resend the invite.');
      }
      await approvePendingMember(inv.chatId, currentUser.uid, currentUser.uid, currentUser.displayName, currentUser.displayName);
    } catch (e) {
      console.error('Failed to accept invite:', e);
    }
    setProcessing(null);
  };

  const handleDeclineInvite = async (inv: GroupInvite) => {
    setProcessing(`inv-${inv.chatId}`);
    try {
      await rejectPendingMember(inv.chatId, currentUser.uid);
    } catch (e) {
      console.error('Failed to decline invite:', e);
    }
    setProcessing(null);
  };

  const handleApproveJoin = async (req: GroupJoinRequest) => {
    setProcessing(`join-${req.chatId}-${req.uid}`);
    try {
      const chatSnap = await get(ref(db, `chats/${req.chatId}`));
      if (!chatSnap.exists()) throw new Error('Group no longer exists');
      const chat = { ...chatSnap.val(), id: req.chatId } as Chat;
      const keyReady = await ensureGroupKeyForMember(chat, currentUser.uid, req.uid, cryptoKeys);
      if (!keyReady) throw new Error('Could not prepare encryption key for approved member');
      await approvePendingMember(req.chatId, req.uid, currentUser.uid, currentUser.displayName, req.fromName);
    } catch (e) {
      console.error('Failed to approve join request:', e);
    }
    setProcessing(null);
  };

  const handleRejectJoin = async (req: GroupJoinRequest) => {
    setProcessing(`join-${req.chatId}-${req.uid}`);
    try {
      await rejectPendingMember(req.chatId, req.uid);
    } catch (e) {
      console.error('Failed to reject join request:', e);
    }
    setProcessing(null);
  };

  const totalCount = requests.length + groupInvites.length + joinRequests.length;

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Notifications" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Notifications</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {totalCount === 0 ? (
            <p className="no-requests">No pending notifications</p>
          ) : (
            <>
              {/* Contact requests */}
              {requests.length > 0 && (
                <>
                  <div className="notification-section-label">Contact Requests</div>
                  {requests.map((req) => (
                    <div key={req.from} className="contact-request-item">
                      <div className="avatar avatar-sm">
                        {req.fromName.charAt(0).toUpperCase()}
                      </div>
                      <div className="user-result-info">
                        <div className="user-result-name">{req.fromName}</div>
                        <div className="user-result-email">{req.fromEmail}</div>
                      </div>
                      <div className="request-actions">
                        <button
                          className="request-accept-btn"
                          onClick={() => handleAccept(req)}
                          disabled={processing === req.from}
                          title="Accept"
                        >
                          ✓
                        </button>
                        <button
                          className="request-reject-btn"
                          onClick={() => handleReject(req)}
                          disabled={processing === req.from}
                          title="Reject"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* Group invites (you were invited to a group) */}
              {groupInvites.length > 0 && (
                <>
                  <div className="notification-section-label">Group Invites</div>
                  {groupInvites.map((inv) => (
                    <div key={inv.chatId} className="contact-request-item">
                      <div className="avatar avatar-sm avatar-group-invite">
                        👥
                      </div>
                      <div className="user-result-info">
                        <div className="user-result-name">{inv.chatName}</div>
                        <div className="user-result-email">
                          {inv.encryptedKeyReady ? `Invited by ${inv.invitedBy}` : 'Encryption key pending from admin'}
                        </div>
                      </div>
                      <div className="request-actions">
                        <button
                          className="request-accept-btn"
                          onClick={() => handleAcceptInvite(inv)}
                          disabled={processing === `inv-${inv.chatId}` || !inv.encryptedKeyReady}
                          title="Accept"
                        >
                          ✓
                        </button>
                        <button
                          className="request-reject-btn"
                          onClick={() => handleDeclineInvite(inv)}
                          disabled={processing === `inv-${inv.chatId}`}
                          title="Decline"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* Join requests (someone wants to join your group) */}
              {joinRequests.length > 0 && (
                <>
                  <div className="notification-section-label">Join Requests</div>
                  {joinRequests.map((req) => (
                    <div key={`${req.chatId}-${req.uid}`} className="contact-request-item">
                      <div className="avatar avatar-sm">
                        {req.fromName.charAt(0).toUpperCase()}
                      </div>
                      <div className="user-result-info">
                        <div className="user-result-name">{req.fromName}</div>
                        <div className="user-result-email">Wants to join {req.chatName}</div>
                      </div>
                      <div className="request-actions">
                        <button
                          className="request-accept-btn"
                          onClick={() => handleApproveJoin(req)}
                          disabled={processing === `join-${req.chatId}-${req.uid}`}
                          title="Approve"
                        >
                          ✓
                        </button>
                        <button
                          className="request-reject-btn"
                          onClick={() => handleRejectJoin(req)}
                          disabled={processing === `join-${req.chatId}-${req.uid}`}
                          title="Reject"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
