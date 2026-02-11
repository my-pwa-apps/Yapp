import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import type { TotpSecret } from 'firebase/auth';

interface Props {
  onClose: () => void;
}

export const MFASetup: React.FC<Props> = ({ onClose }) => {
  const { isMFAEnabled, enrollMFA, finalizeMFAEnrollment, unenrollMFA } = useAuth();
  const [step, setStep] = useState<'start' | 'scan' | 'verify' | 'done'>('start');
  const [secret, setSecret] = useState<TotpSecret | null>(null);
  const [qrUrl, setQrUrl] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEnable = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await enrollMFA();
      setSecret(result.secret);
      setQrUrl(result.qrUrl);
      setStep('scan');
    } catch (err: any) {
      setError(err.message || 'Failed to start MFA enrollment. Make sure Identity Platform is enabled in Firebase.');
    }
    setLoading(false);
  };

  const handleVerify = async () => {
    if (!secret || code.length !== 6) return;
    setLoading(true);
    setError('');
    try {
      await finalizeMFAEnrollment(secret, code);
      setStep('done');
    } catch (err: any) {
      setError(err.message || 'Invalid verification code');
    }
    setLoading(false);
  };

  const handleDisable = async () => {
    setLoading(true);
    setError('');
    try {
      await unenrollMFA();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to disable MFA');
    }
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <h3>🔐 Two-Factor Authentication</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ padding: '20px 24px' }}>
          {step === 'start' && (
            <>
              <p style={{ color: '#E9EDEF', margin: '0 0 12px' }}>
                {isMFAEnabled
                  ? 'Two-factor authentication is currently enabled on your account.'
                  : 'Add an extra layer of security using an authenticator app (Google Authenticator, Authy, etc.).'}
              </p>
              {error && <p className="login-error" style={{ margin: '8px 0' }}>{error}</p>}
              {isMFAEnabled ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="profile-action-btn" onClick={handleDisable} disabled={loading}>
                    {loading ? 'Disabling...' : '🔓 Disable MFA'}
                  </button>
                  <button className="profile-action-btn secondary" onClick={onClose}>Cancel</button>
                </div>
              ) : (
                <button className="profile-action-btn" onClick={handleEnable} disabled={loading}>
                  {loading ? 'Setting up...' : '🔐 Enable MFA'}
                </button>
              )}
            </>
          )}

          {step === 'scan' && (
            <>
              <p style={{ color: '#E9EDEF', margin: '0 0 12px' }}>
                Scan this QR code with your authenticator app:
              </p>
              <div className="mfa-qr-container">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}`}
                  alt="MFA QR Code"
                  className="mfa-qr-img"
                />
              </div>
              <p style={{ color: '#8696A0', fontSize: '0.8rem', margin: '8px 0 0', textAlign: 'center' }}>
                Or enter this key manually: <code className="mfa-secret-key">{secret?.secretKey}</code>
              </p>
              <button className="profile-action-btn" onClick={() => setStep('verify')} style={{ marginTop: 16 }}>
                Next - Enter Code
              </button>
            </>
          )}

          {step === 'verify' && (
            <>
              <p style={{ color: '#E9EDEF', margin: '0 0 12px' }}>
                Enter the 6-digit code from your authenticator app:
              </p>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                className="modal-input mfa-code-input"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
              />
              {error && <p className="login-error" style={{ margin: '8px 0' }}>{error}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  className="profile-action-btn"
                  onClick={handleVerify}
                  disabled={loading || code.length !== 6}
                >
                  {loading ? 'Verifying...' : 'Verify & Enable'}
                </button>
                <button className="profile-action-btn secondary" onClick={() => setStep('scan')}>Back</button>
              </div>
            </>
          )}

          {step === 'done' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: 12 }}>✅</div>
              <p style={{ color: '#84cc16', fontWeight: 600, margin: '0 0 8px' }}>MFA Enabled!</p>
              <p style={{ color: '#8696A0', fontSize: '0.85rem', margin: '0 0 16px' }}>
                You'll be asked for a code from your authenticator app each time you sign in.
              </p>
              <button className="profile-action-btn" onClick={onClose}>Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
