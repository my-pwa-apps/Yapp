import React from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginPage } from './components/Auth/LoginPage';
import { AppLayout } from './components/Layout/AppLayout';
import { PWAPrompts } from './components/PWAPrompts';
import { YappLogo } from './components/YappLogo';

const AppInner: React.FC = () => {
  const { user, loading } = useAuth();

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
  <AuthProvider>
    <PWAPrompts />
    <AppInner />
  </AuthProvider>
);

export default App;
