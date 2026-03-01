import React, { useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginPage } from './components/Auth/LoginPage';
import { AppLayout } from './components/Layout/AppLayout';
import { PWAPrompts } from './components/PWAPrompts';
import { YappLogo } from './components/YappLogo';
import { preloadProfanityList } from './utils/contentFilter';

/** Error boundary to prevent full white-screen crashes */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="app-loading" style={{ textAlign: 'center', padding: 32 }}>
          <YappLogo size={64} />
          <h2 style={{ marginTop: 16 }}>Something went wrong</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            style={{ marginTop: 16, padding: '8px 24px', cursor: 'pointer' }}
            className="modal-btn"
            onClick={() => window.location.reload()}
          >
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const AppInner: React.FC = () => {
  const { user, loading } = useAuth();

  // Pre-load profanity word lists once on mount
  useEffect(() => { preloadProfanityList(); }, []);

  if (loading) {
    return (
      <div className="app-loading">
        <YappLogo size={64} />
        <div>Loading...</div>
      </div>
    );
  }

  return user ? <AppLayout /> : <LoginPage />;
};

const App: React.FC = () => (
  <ErrorBoundary>
    <AuthProvider>
      <PWAPrompts />
      <AppInner />
    </AuthProvider>
  </ErrorBoundary>
);

export default App;
