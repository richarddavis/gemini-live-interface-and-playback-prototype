import React from 'react';
import { AuthProvider } from './contexts/AuthContext';
import App from './App';
import OAuthCallback from './components/OAuthCallback';

function AppRouter() {
  // Simple routing based on current path
  const currentPath = window.location.pathname;
  
  // Handle OAuth callback route
  if (currentPath === '/auth/callback') {
    return (
      <AuthProvider>
        <OAuthCallback />
      </AuthProvider>
    );
  }
  
  // Default: render main app
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}

export default AppRouter; 