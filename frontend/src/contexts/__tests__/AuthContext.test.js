import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';
import authService from '../../services/authService';

// Mock the authService
jest.mock('../../services/authService', () => ({
  getAuthStatus: jest.fn(),
  initiateLogin: jest.fn(),
  logout: jest.fn(),
  handleCallback: jest.fn(),
  getCurrentUser: jest.fn(),
}));

// Test component that uses the auth context
const TestComponent = () => {
  const {
    isAuthenticated,
    user,
    loading,
    error,
    login,
    logout,
    handleOAuthCallback,
    refreshUser,
    checkAuthStatus,
  } = useAuth();

  return (
    <div>
      <div data-testid="isAuthenticated">{isAuthenticated.toString()}</div>
      <div data-testid="user">{user ? JSON.stringify(user) : 'null'}</div>
      <div data-testid="loading">{loading.toString()}</div>
      <div data-testid="error">{error || 'null'}</div>
      <button onClick={login} data-testid="login-btn">Login</button>
      <button onClick={logout} data-testid="logout-btn">Logout</button>
      <button onClick={() => handleOAuthCallback('code', 'state')} data-testid="callback-btn">
        Handle Callback
      </button>
      <button onClick={refreshUser} data-testid="refresh-btn">Refresh User</button>
      <button onClick={checkAuthStatus} data-testid="check-status-btn">Check Status</button>
    </div>
  );
};

const renderWithAuthProvider = (component) => {
  return render(
    <AuthProvider>
      {component}
    </AuthProvider>
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock console.error to avoid noise in tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  describe('AuthProvider', () => {
    it('should provide initial state', async () => {
      authService.getAuthStatus.mockResolvedValue({ authenticated: false, user: null });

      renderWithAuthProvider(<TestComponent />);

      // Initial loading state
      expect(screen.getByTestId('loading')).toHaveTextContent('true');

      // Wait for auth check to complete
      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('false');
      expect(screen.getByTestId('user')).toHaveTextContent('null');
      expect(screen.getByTestId('error')).toHaveTextContent('null');
    });

    it('should load authenticated user on mount', async () => {
      const mockUser = { id: 1, email: 'test@example.com', display_name: 'Test User' };
      authService.getAuthStatus.mockResolvedValue({ authenticated: true, user: mockUser });

      renderWithAuthProvider(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('true');
      expect(screen.getByTestId('user')).toHaveTextContent(JSON.stringify(mockUser));
      expect(authService.getAuthStatus).toHaveBeenCalledTimes(1);
    });

    it('should handle auth status check error', async () => {
      authService.getAuthStatus.mockRejectedValue(new Error('Network error'));

      renderWithAuthProvider(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      expect(screen.getByTestId('error')).toHaveTextContent('Network error');
      expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('false');
    });
  });

  describe('login function', () => {
    it('should call authService.initiateLogin', async () => {
      authService.getAuthStatus.mockResolvedValue({ authenticated: false, user: null });
      authService.initiateLogin.mockResolvedValue();

      renderWithAuthProvider(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      await act(async () => {
        screen.getByTestId('login-btn').click();
      });

      expect(authService.initiateLogin).toHaveBeenCalledTimes(1);
    });

    it('should handle login error', async () => {
      authService.getAuthStatus.mockResolvedValue({ authenticated: false, user: null });
      authService.initiateLogin.mockRejectedValue(new Error('Login failed'));

      renderWithAuthProvider(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      await act(async () => {
        screen.getByTestId('login-btn').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Login failed');
      });
    });
  });

  describe('logout function', () => {
    it('should call authService.logout and clear user state', async () => {
      const mockUser = { id: 1, email: 'test@example.com' };
      authService.getAuthStatus.mockResolvedValue({ authenticated: true, user: mockUser });
      authService.logout.mockResolvedValue({ success: true });

      renderWithAuthProvider(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('true');
      });

      await act(async () => {
        screen.getByTestId('logout-btn').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('false');
      });

      expect(screen.getByTestId('user')).toHaveTextContent('null');
      expect(authService.logout).toHaveBeenCalledTimes(1);
    });

    it('should clear state even if logout API fails', async () => {
      const mockUser = { id: 1, email: 'test@example.com' };
      authService.getAuthStatus.mockResolvedValue({ authenticated: true, user: mockUser });
      authService.logout.mockRejectedValue(new Error('Logout failed'));

      renderWithAuthProvider(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('true');
      });

      await act(async () => {
        screen.getByTestId('logout-btn').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('false');
      });

      expect(screen.getByTestId('user')).toHaveTextContent('null');
    });
  });

  describe('handleOAuthCallback function', () => {
    it('should handle successful OAuth callback', async () => {
      const mockUser = { id: 1, email: 'test@example.com' };
      authService.getAuthStatus.mockResolvedValue({ authenticated: false, user: null });
      authService.handleCallback.mockResolvedValue({ success: true, user: mockUser });

      renderWithAuthProvider(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      await act(async () => {
        screen.getByTestId('callback-btn').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('true');
      });

      expect(screen.getByTestId('user')).toHaveTextContent(JSON.stringify(mockUser));
      expect(authService.handleCallback).toHaveBeenCalledWith('code', 'state');
    });

    it('should handle OAuth callback failure', async () => {
      authService.getAuthStatus.mockResolvedValue({ authenticated: false, user: null });
      authService.handleCallback.mockRejectedValue(new Error('Callback failed'));

      renderWithAuthProvider(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      await act(async () => {
        screen.getByTestId('callback-btn').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('Callback failed');
      });
    });
  });

  describe('refreshUser function', () => {
    it('should refresh user data successfully', async () => {
      const initialUser = { id: 1, email: 'test@example.com' };
      const updatedUser = { id: 1, email: 'test@example.com', display_name: 'Updated User' };
      
      authService.getAuthStatus.mockResolvedValue({ authenticated: true, user: initialUser });
      authService.getCurrentUser.mockResolvedValue({ user: updatedUser });

      renderWithAuthProvider(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent(JSON.stringify(initialUser));
      });

      await act(async () => {
        screen.getByTestId('refresh-btn').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('user')).toHaveTextContent(JSON.stringify(updatedUser));
      });

      expect(authService.getCurrentUser).toHaveBeenCalledTimes(1);
    });

    it('should logout user if refresh fails', async () => {
      const mockUser = { id: 1, email: 'test@example.com' };
      authService.getAuthStatus.mockResolvedValue({ authenticated: true, user: mockUser });
      authService.getCurrentUser.mockRejectedValue(new Error('Unauthorized'));

      renderWithAuthProvider(<TestComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('true');
      });

      await act(async () => {
        screen.getByTestId('refresh-btn').click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('isAuthenticated')).toHaveTextContent('false');
      });

      expect(screen.getByTestId('user')).toHaveTextContent('null');
    });
  });

  describe('useAuth hook', () => {
    it('should throw error when used outside AuthProvider', () => {
      // Mock console.error for this specific test since we expect an error
      const originalError = console.error;
      console.error = jest.fn();

      expect(() => {
        render(<TestComponent />);
      }).toThrow('useAuth must be used within an AuthProvider');

      console.error = originalError;
    });
  });
}); 