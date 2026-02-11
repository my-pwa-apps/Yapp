import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { YappLogo } from '../YappLogo';
import './LoginPage.css';

export const LoginPage: React.FC = () => {
  const { signIn, signUp, mfaResolver, verifyMFASignIn } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // MFA challenge state
  const [mfaCode, setMfaCode] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaError, setMfaError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isLogin) {
        await signIn(email, password);
      } else {
        if (!displayName.trim()) {
          setError('Display name is required');
          setLoading(false);
          return;
        }
        await signUp(email, password, displayName.trim());
      }
    } catch (err: any) {
      console.error('Auth error:', err.code, err.message);
      const code = err.code;
      if (code === 'auth/multi-factor-auth-required') {
        // MFA challenge UI will appear via mfaResolver state
        setLoading(false);
        return;
      }
      const friendly: Record<string, string> = {
        'auth/email-already-in-use': 'This email is already registered. Try signing in.',
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/weak-password': 'Password must be at least 6 characters.',
        'auth/user-not-found': 'No account found with this email.',
        'auth/wrong-password': 'Incorrect password.',
        'auth/invalid-credential': 'Invalid email or password.',
        'auth/too-many-requests': 'Too many attempts. Please try again later.',
      };
      setError(friendly[code] || err.message?.replace('Firebase: ', '') || 'Something went wrong');
    }
    setLoading(false);
  };

  const handleMFAVerify = async () => {
    if (mfaCode.length !== 6) return;
    setMfaLoading(true);
    setMfaError('');
    try {
      await verifyMFASignIn(mfaCode);
    } catch (err: any) {
      setMfaError(err?.message || 'Invalid verification code. Please try again.');
    }
    setMfaLoading(false);
  };

  // Show MFA challenge screen when resolver is active
  if (mfaResolver) {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-logo">
            <YappLogo size={72} />
            <h1>Yappin'</h1>
            <p className="login-subtitle">Two-Factor Authentication</p>
          </div>

          <div className="login-form">
            <p style={{ color: '#8696A0', textAlign: 'center', margin: '0 0 16px' }}>
              Enter the 6-digit code from your authenticator app
            </p>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              className="login-input mfa-code-input"
              placeholder="000000"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleMFAVerify()}
              style={{ textAlign: 'center', fontSize: '1.5rem', letterSpacing: '0.5rem' }}
            />
            {mfaError && <p className="login-error">{mfaError}</p>}
            <button
              className="login-btn"
              onClick={handleMFAVerify}
              disabled={mfaLoading || mfaCode.length !== 6}
            >
              {mfaLoading ? 'Verifying...' : 'Verify'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <YappLogo size={72} />
          <h1>Yappin'</h1>
          <p className="login-subtitle">Keep yappin' man</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {!isLogin && (
            <input
              type="text"
              placeholder="Display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="login-input"
            />
          )}
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="login-input"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="login-input"
          />
          {error && <p className="login-error">{error}</p>}
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <p className="login-toggle">
          {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button onClick={() => { setIsLogin(!isLogin); setError(''); }}>
            {isLogin ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
};
