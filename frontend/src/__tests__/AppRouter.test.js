import React from 'react';
import { render, screen } from '@testing-library/react';
import AppRouter from '../AppRouter';

// Mock the components
jest.mock('../contexts/AuthContext', () => ({
  AuthProvider: ({ children }) => <div data-testid="auth-provider">{children}</div>,
}));

jest.mock('../App', () => {
  return function App() {
    return <div data-testid="main-app">Main App Component</div>;
  };
});

jest.mock('../components/OAuthCallback', () => {
  return function OAuthCallback() {
    return <div data-testid="oauth-callback">OAuth Callback Component</div>;
  };
});

// Mock window.location
delete window.location;
window.location = { pathname: '/' };

describe('AppRouter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Default Route', () => {
    it('should render main app for default route', () => {
      window.location.pathname = '/';

      render(<AppRouter />);

      expect(screen.getByTestId('auth-provider')).toBeInTheDocument();
      expect(screen.getByTestId('main-app')).toBeInTheDocument();
      expect(screen.queryByTestId('oauth-callback')).not.toBeInTheDocument();
    });

    it('should render main app for any non-callback route', () => {
      window.location.pathname = '/some-other-route';

      render(<AppRouter />);

      expect(screen.getByTestId('auth-provider')).toBeInTheDocument();
      expect(screen.getByTestId('main-app')).toBeInTheDocument();
      expect(screen.queryByTestId('oauth-callback')).not.toBeInTheDocument();
    });
  });

  describe('OAuth Callback Route', () => {
    it('should render OAuth callback component for /auth/callback route', () => {
      window.location.pathname = '/auth/callback';

      render(<AppRouter />);

      expect(screen.getByTestId('auth-provider')).toBeInTheDocument();
      expect(screen.getByTestId('oauth-callback')).toBeInTheDocument();
      expect(screen.queryByTestId('main-app')).not.toBeInTheDocument();
    });
  });

  describe('AuthProvider Wrapping', () => {
    it('should wrap main app with AuthProvider', () => {
      window.location.pathname = '/';

      render(<AppRouter />);

      const authProvider = screen.getByTestId('auth-provider');
      const mainApp = screen.getByTestId('main-app');

      expect(authProvider).toContainElement(mainApp);
    });

    it('should wrap OAuth callback with AuthProvider', () => {
      window.location.pathname = '/auth/callback';

      render(<AppRouter />);

      const authProvider = screen.getByTestId('auth-provider');
      const oauthCallback = screen.getByTestId('oauth-callback');

      expect(authProvider).toContainElement(oauthCallback);
    });
  });

  describe('Route Matching', () => {
    it('should match exact path for callback route', () => {
      window.location.pathname = '/auth/callback/extra';

      render(<AppRouter />);

      // Should not match callback route with extra path
      expect(screen.getByTestId('main-app')).toBeInTheDocument();
      expect(screen.queryByTestId('oauth-callback')).not.toBeInTheDocument();
    });

    it('should handle path with query parameters for callback route', () => {
      window.location.pathname = '/auth/callback';
      window.location.search = '?code=123&state=abc';

      render(<AppRouter />);

      expect(screen.getByTestId('oauth-callback')).toBeInTheDocument();
      expect(screen.queryByTestId('main-app')).not.toBeInTheDocument();
    });
  });
}); 