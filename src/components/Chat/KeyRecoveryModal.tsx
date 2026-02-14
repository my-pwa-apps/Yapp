import React, { useState } from 'react';

interface Props {
  onRecover: (password: string) => Promise<void>;
  onSkip: () => void;
}

export const KeyRecoveryModal: React.FC<Props> = ({ onRecover, onSkip }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!password) return;
    setError('');
    setLoading(true);
    try {
      await onRecover(password);
    } catch {
      setError('Incorrect password. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div className="modal-overlay">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Unlock Encryption</h3>
        </div>
        <div className="modal-body">
          <p className="text-secondary mb-16" style={{ fontSize: 14 }}>
            Enter your Yappin' password to unlock your encrypted messages on this device.
          </p>
          <input
            className="modal-input"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            autoFocus
          />
          {error && <p className="modal-error">{error}</p>}
          <button
            className="modal-btn"
            onClick={handleSubmit}
            disabled={loading || !password}
          >
            {loading ? 'Unlocking...' : 'Unlock'}
          </button>
          <button
            className="modal-btn modal-btn-secondary mt-8"
            onClick={onSkip}
          >
            Skip (messages won't be decrypted)
          </button>
        </div>
      </div>
    </div>
  );
};
