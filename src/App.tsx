import React from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginPage } from './components/Auth/LoginPage';
import { AppLayout } from './components/Layout/AppLayout';
import { YappLogo } from './components/YappLogo';

const AppInner: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        height: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#111B21',
        color: '#667781',
        flexDirection: 'column',
        gap: '1rem',
      }}>
        <YappLogo size={64} />
        <div>Loading...</div>
      </div>
    );
  }

  return user ? <AppLayout /> : <LoginPage />;
};

const App: React.FC = () => (
  <AuthProvider>
    <AppInner />
  </AuthProvider>
);

export default App;
