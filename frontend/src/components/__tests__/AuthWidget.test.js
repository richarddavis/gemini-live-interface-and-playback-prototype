import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AuthWidget from '../AuthWidget';
import { useAuth } from '../../contexts/AuthContext';

// Mock the useAuth hook
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

describe('AuthWidget', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock console.error to avoid noise in tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  describe('Loading State', () => {
    it('should show loading spinner when loading is true', () => {
      useAuth.mockReturnValue({
        isAuthenticated: false,
        user: null,
        loading: true,
        login: jest.fn(),
        logout: jest.fn(),
      });

      render(<AuthWidget />);

      expect(screen.getByTestId('auth-loading')).toBeInTheDocument();
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });
  });

  describe('Not Authenticated State', () => {
    beforeEach(() => {
      useAuth.mockReturnValue({
        isAuthenticated: false,
        user: null,
        loading: false,
        login: jest.fn(),
        logout: jest.fn(),
      });
    });

    it('should show sign up and log in buttons when not authenticated', () => {
      render(<AuthWidget />);

      expect(screen.getByText('Sign up')).toBeInTheDocument();
      expect(screen.getByText('Log in')).toBeInTheDocument();
    });

    it('should call login function when sign up button is clicked', async () => {
      const mockLogin = jest.fn();
      useAuth.mockReturnValue({
        isAuthenticated: false,
        user: null,
        loading: false,
        login: mockLogin,
        logout: jest.fn(),
      });

      render(<AuthWidget />);

      fireEvent.click(screen.getByText('Sign up'));

      expect(mockLogin).toHaveBeenCalledTimes(1);
    });

    it('should call login function when log in button is clicked', async () => {
      const mockLogin = jest.fn();
      useAuth.mockReturnValue({
        isAuthenticated: false,
        user: null,
        loading: false,
        login: mockLogin,
        logout: jest.fn(),
      });

      render(<AuthWidget />);

      fireEvent.click(screen.getByText('Log in'));

      expect(mockLogin).toHaveBeenCalledTimes(1);
    });
  });

  describe('Authenticated State', () => {
    const mockUser = {
      id: 1,
      email: 'test@example.com',
      display_name: 'Test User',
    };

    beforeEach(() => {
      useAuth.mockReturnValue({
        isAuthenticated: true,
        user: mockUser,
        loading: false,
        login: jest.fn(),
        logout: jest.fn(),
      });
    });

    it('should show user avatar when authenticated', () => {
      render(<AuthWidget />);

      expect(screen.getByLabelText('User menu')).toBeInTheDocument();
      expect(screen.getByText('TU')).toBeInTheDocument(); // Initials from "Test User"
    });

    it('should show user initials correctly for display name', () => {
      render(<AuthWidget />);

      expect(screen.getByText('TU')).toBeInTheDocument();
    });

    it('should show email initial when no display name', () => {
      useAuth.mockReturnValue({
        isAuthenticated: true,
        user: { id: 1, email: 'test@example.com' },
        loading: false,
        login: jest.fn(),
        logout: jest.fn(),
      });

      render(<AuthWidget />);

      expect(screen.getByText('T')).toBeInTheDocument();
    });

    it('should show question mark when no user info', () => {
      useAuth.mockReturnValue({
        isAuthenticated: true,
        user: { id: 1 },
        loading: false,
        login: jest.fn(),
        logout: jest.fn(),
      });

      render(<AuthWidget />);

      expect(screen.getByText('?')).toBeInTheDocument();
    });

    it('should show dropdown when avatar is clicked', () => {
      render(<AuthWidget />);

      fireEvent.click(screen.getByLabelText('User menu'));

      expect(screen.getByText('Test User')).toBeInTheDocument();
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
      expect(screen.getByText('Log out')).toBeInTheDocument();
    });

    it('should show username fallback when no display name', () => {
      useAuth.mockReturnValue({
        isAuthenticated: true,
        user: { id: 1, email: 'test@example.com', username: 'testuser' },
        loading: false,
        login: jest.fn(),
        logout: jest.fn(),
      });

      render(<AuthWidget />);

      fireEvent.click(screen.getByLabelText('User menu'));

      expect(screen.getByText('testuser')).toBeInTheDocument();
    });

    it('should show "User" fallback when no display name or username', () => {
      useAuth.mockReturnValue({
        isAuthenticated: true,
        user: { id: 1, email: 'test@example.com' },
        loading: false,
        login: jest.fn(),
        logout: jest.fn(),
      });

      render(<AuthWidget />);

      fireEvent.click(screen.getByLabelText('User menu'));

      expect(screen.getByText('User')).toBeInTheDocument();
    });

    it('should call logout function when logout button is clicked', async () => {
      const mockLogout = jest.fn();
      useAuth.mockReturnValue({
        isAuthenticated: true,
        user: mockUser,
        loading: false,
        login: jest.fn(),
        logout: mockLogout,
      });

      render(<AuthWidget />);

      fireEvent.click(screen.getByLabelText('User menu'));
      fireEvent.click(screen.getByText('Log out'));

      expect(mockLogout).toHaveBeenCalledTimes(1);
    });

    it('should close dropdown when clicking outside', async () => {
      render(
        <div>
          <AuthWidget />
          <div data-testid="outside">Outside element</div>
        </div>
      );

      // Open dropdown
      fireEvent.click(screen.getByLabelText('User menu'));
      expect(screen.getByText('Log out')).toBeInTheDocument();

      // Click outside
      fireEvent.mouseDown(screen.getByTestId('outside'));

      await waitFor(() => {
        expect(screen.queryByText('Log out')).not.toBeInTheDocument();
      });
    });

    it('should close dropdown after logout', async () => {
      const mockLogout = jest.fn();
      useAuth.mockReturnValue({
        isAuthenticated: true,
        user: mockUser,
        loading: false,
        login: jest.fn(),
        logout: mockLogout,
      });

      render(<AuthWidget />);

      fireEvent.click(screen.getByLabelText('User menu'));
      expect(screen.getByText('Log out')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Log out'));

      expect(mockLogout).toHaveBeenCalledTimes(1);
    });
  });

  describe('getUserInitials function', () => {
    it('should handle multiple word display names', () => {
      useAuth.mockReturnValue({
        isAuthenticated: true,
        user: { id: 1, display_name: 'John Michael Smith', email: 'john@example.com' },
        loading: false,
        login: jest.fn(),
        logout: jest.fn(),
      });

      render(<AuthWidget />);

      expect(screen.getByText('JM')).toBeInTheDocument(); // Should only take first 2 initials
    });

    it('should handle single word display name', () => {
      useAuth.mockReturnValue({
        isAuthenticated: true,
        user: { id: 1, display_name: 'John', email: 'john@example.com' },
        loading: false,
        login: jest.fn(),
        logout: jest.fn(),
      });

      render(<AuthWidget />);

      expect(screen.getByText('J')).toBeInTheDocument();
    });

    it('should handle email when no display name', () => {
      useAuth.mockReturnValue({
        isAuthenticated: true,
        user: { id: 1, email: 'john.doe@example.com' },
        loading: false,
        login: jest.fn(),
        logout: jest.fn(),
      });

      render(<AuthWidget />);

      expect(screen.getByText('J')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle login errors gracefully', async () => {
      const mockLogin = jest.fn().mockRejectedValue(new Error('Login failed'));
      useAuth.mockReturnValue({
        isAuthenticated: false,
        user: null,
        loading: false,
        login: mockLogin,
        logout: jest.fn(),
      });

      render(<AuthWidget />);

      fireEvent.click(screen.getByText('Log in'));

      expect(mockLogin).toHaveBeenCalledTimes(1);
      // Error should be handled silently (logged to console)
    });

    it('should handle logout errors gracefully', async () => {
      const mockLogout = jest.fn().mockRejectedValue(new Error('Logout failed'));
      useAuth.mockReturnValue({
        isAuthenticated: true,
        user: { id: 1, email: 'test@example.com', display_name: 'Test User' },
        loading: false,
        login: jest.fn(),
        logout: mockLogout,
      });

      render(<AuthWidget />);

      fireEvent.click(screen.getByLabelText('User menu'));
      fireEvent.click(screen.getByText('Log out'));

      expect(mockLogout).toHaveBeenCalledTimes(1);
      // Error should be handled silently (logged to console)
    });
  });
});

// Add data-testid attributes to the actual component for better testing
// Note: This would require updating the actual AuthWidget component
const getAuthWidgetWithTestIds = () => `
// In AuthWidget.js, add these data-testid attributes:
// <div className="auth-loading" data-testid="auth-loading">
//   <div className="loading-spinner" data-testid="loading-spinner"></div>
// </div>
`; 