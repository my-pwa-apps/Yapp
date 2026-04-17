import React, { useEffect, useState } from 'react';

interface Props {
  onSet: (passphrase: string) => Promise<void>;
  onSkip: () => void;
}

/**
 * Prompts a Google-signed-in user to set an E2EE backup passphrase on first
 * sign-in. The passphrase is used with PBKDF2 + AES-GCM to encrypt the user's
 * private key before it's backed up to RTDB. Without this, the private key
 * would be unrecoverable if the device's IndexedDB is cleared.
 */
export const E2EEPassphraseSetupModal: React.FC<Props> = ({ onSet, onSkip }) => {
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const MIN_LEN = 8;

  const handleSubmit = async () => {
    if (passphrase.length < MIN_LEN) {
      setError(`Passphrase must be at least ${MIN_LEN} characters.`);
      return;
    }
    if (passphrase !== confirm) {
      setError('Passphrases do not match.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await onSet(passphrase);
    } catch {
      setError('Failed to set passphrase. Please try again.');
    }
    setLoading(false);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onSkip(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onSkip]);

  return (
    <div className="modal-overlay" onClick={onSkip}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Set encryption passphrase"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>Set Encryption Passphrase</h3>
        </div>
        <div className="modal-body">
          <p className="text-secondary mb-16" style={{ fontSize: 14 }}>
            Yappin' end-to-end encrypts your messages. Choose a passphrase to back up your private key
            securely. You'll need this passphrase to recover your messages on a new device.
          </p>
          <p className="text-secondary mb-16" style={{ fontSize: 13, opacity: 0.8 }}>
            We can't reset this passphrase. If you lose it, you'll lose access to encrypted messages.
          </p>
          <input
            className="modal-input"
            type="password"
            placeholder="New passphrase (min 8 chars)"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            autoFocus
            autoComplete="new-password"
          />
          <input
            className="modal-input mt-8"
            type="password"
            placeholder="Confirm passphrase"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            autoComplete="new-password"
          />
          {error && <p className="modal-error">{error}</p>}
          <button
            className="modal-btn"
            onClick={handleSubmit}
            disabled={loading || !passphrase || !confirm}
          >
            {loading ? 'Setting...' : 'Set passphrase'}
          </button>
          <button className="modal-btn modal-btn-secondary mt-8" onClick={onSkip}>
            Skip (not recommended — messages won't be encrypted)
          </button>
        </div>
      </div>
    </div>
  );
};
