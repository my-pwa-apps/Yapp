import React, { useState } from 'react';
import type { ContactRequest, UserProfile } from '../../types';
import { acceptContactRequest, rejectContactRequest } from '../../hooks/useContactRequests';

interface Props {
  currentUser: UserProfile;
  requests: ContactRequest[];
  onClose: () => void;
  onChatCreated: (chatId: string) => void;
}

export const ContactRequestsModal: React.FC<Props> = ({
  currentUser,
  requests,
  onClose,
  onChatCreated,
}) => {
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Contact Requests</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {requests.length === 0 ? (
            <p className="no-requests">No pending requests</p>
          ) : (
            requests.map((req) => (
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
            ))
          )}
        </div>
      </div>
    </div>
  );
};
