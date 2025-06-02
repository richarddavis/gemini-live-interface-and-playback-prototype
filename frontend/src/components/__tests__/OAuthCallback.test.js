import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import OAuthCallback from '../OAuthCallback';
import { useAuth } from '../../contexts/AuthContext';

// Mock the useAuth hook
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

// Mock window.location
delete window.location;
window.location = { 
  search: '',
  href: ''
};

// Mock URLSearchParams
global.URLSearchParams = jest.fn();

describe('OAuthCallback', () => {
  let mockHandleOAuthCallback;

  beforeEach(() => {
    jest.clearAllMocks();
    mockHandleOAuthCallback = jest.fn();
    
    useAuth.mockReturnValue({
      handleOAuthCallback: mockHandleOAuthCallback,
    });

    // Mock console.error to avoid noise in tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Reset window.location
    window.location.search = '';
    window.location.href = '';
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  describe('Processing State', () => {
    it('should show processing state initially', () => {
      // Mock URLSearchParams to return code and state
      URLSearchParams.mockImplementation(() => ({
        get: jest.fn((param) => {
          if (param === 'code') return 'auth_code';
          if (param === 'state') return 'state_token';
          return null;
        }),
      }));

      // Make the callback hang to keep it in processing state
      mockHandleOAuthCallback.mockImplementation(() => new Promise(() => {}));

      render(<OAuthCallback />);

      expect(screen.getByText('Completing sign in...')).toBeInTheDocument();
      expect(screen.getByText('Please wait while we authenticate your account.')).toBeInTheDocument();
    });
  });

  describe('Success State', () => {
    it('should show success state and redirect after successful authentication', async () => {
      // Mock URLSearchParams to return code and state
      URLSearchParams.mockImplementation(() => ({
        get: jest.fn((param) => {
          if (param === 'code') return 'auth_code';
          if (param === 'state') return 'state_token';
          return null;
        }),
      }));

      mockHandleOAuthCallback.mockResolvedValue({ success: true });

      render(<OAuthCallback />);

      await waitFor(() => {
        expect(screen.getByText('Sign in successful!')).toBeInTheDocument();
      });

      expect(screen.getByText('Redirecting you to the app...')).toBeInTheDocument();
      expect(mockHandleOAuthCallback).toHaveBeenCalledWith('auth_code', 'state_token');

      // Test redirect after 2 seconds
      setTimeout(() => {
        expect(window.location.href).toBe('/');
      }, 2000);
    });
  });

  describe('Error State', () => {
    it('should show error state when code is missing', async () => {
      // Mock URLSearchParams to return state but no code
      URLSearchParams.mockImplementation(() => ({
        get: jest.fn((param) => {
          if (param === 'state') return 'state_token';
          return null;
        }),
      }));

      render(<OAuthCallback />);

      await waitFor(() => {
        expect(screen.getByText('Sign in failed')).toBeInTheDocument();
      });

      expect(screen.getByText('Missing authorization code or state parameter')).toBeInTheDocument();
      expect(screen.getByText('Return to app')).toBeInTheDocument();
    });

    it('should show error state when state is missing', async () => {
      // Mock URLSearchParams to return code but no state
      URLSearchParams.mockImplementation(() => ({
        get: jest.fn((param) => {
          if (param === 'code') return 'auth_code';
          return null;
        }),
      }));

      render(<OAuthCallback />);

      await waitFor(() => {
        expect(screen.getByText('Sign in failed')).toBeInTheDocument();
      });

      expect(screen.getByText('Missing authorization code or state parameter')).toBeInTheDocument();
    });

    it('should show error state when callback returns failure', async () => {
      URLSearchParams.mockImplementation(() => ({
        get: jest.fn((param) => {
          if (param === 'code') return 'auth_code';
          if (param === 'state') return 'state_token';
          return null;
        }),
      }));

      mockHandleOAuthCallback.mockResolvedValue({ 
        success: false, 
        error: 'Authentication failed' 
      });

      render(<OAuthCallback />);

      await waitFor(() => {
        expect(screen.getByText('Sign in failed')).toBeInTheDocument();
      });

      expect(screen.getByText('Authentication failed')).toBeInTheDocument();
    });

    it('should show error state when callback throws exception', async () => {
      URLSearchParams.mockImplementation(() => ({
        get: jest.fn((param) => {
          if (param === 'code') return 'auth_code';
          if (param === 'state') return 'state_token';
          return null;
        }),
      }));

      mockHandleOAuthCallback.mockRejectedValue(new Error('Network error'));

      render(<OAuthCallback />);

      await waitFor(() => {
        expect(screen.getByText('Sign in failed')).toBeInTheDocument();
      });

      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    it('should redirect to home when "Return to app" is clicked', async () => {
      URLSearchParams.mockImplementation(() => ({
        get: jest.fn(() => null),
      }));

      render(<OAuthCallback />);

      await waitFor(() => {
        expect(screen.getByText('Return to app')).toBeInTheDocument();
      });

      // Click the return button
      const returnButton = screen.getByText('Return to app');
      returnButton.click();

      expect(window.location.href).toBe('/');
    });

    it('should show default error message when no specific error is provided', async () => {
      URLSearchParams.mockImplementation(() => ({
        get: jest.fn((param) => {
          if (param === 'code') return 'auth_code';
          if (param === 'state') return 'state_token';
          return null;
        }),
      }));

      mockHandleOAuthCallback.mockResolvedValue({ success: false });

      render(<OAuthCallback />);

      await waitFor(() => {
        expect(screen.getByText('Sign in failed')).toBeInTheDocument();
      });

      expect(screen.getByText('Authentication failed')).toBeInTheDocument();
    });
  });

  describe('URL Parameter Parsing', () => {
    it('should correctly parse code and state from URL', async () => {
      URLSearchParams.mockImplementation(() => ({
        get: jest.fn((param) => {
          if (param === 'code') return 'test_auth_code';
          if (param === 'state') return 'test_state_token';
          return null;
        }),
      }));

      mockHandleOAuthCallback.mockResolvedValue({ success: true });

      render(<OAuthCallback />);

      await waitFor(() => {
        expect(mockHandleOAuthCallback).toHaveBeenCalledWith('test_auth_code', 'test_state_token');
      });
    });

    it('should handle empty URL parameters', async () => {
      URLSearchParams.mockImplementation(() => ({
        get: jest.fn(() => null),
      }));

      render(<OAuthCallback />);

      await waitFor(() => {
        expect(screen.getByText('Sign in failed')).toBeInTheDocument();
      });

      expect(mockHandleOAuthCallback).not.toHaveBeenCalled();
    });
  });

  describe('Visual Elements', () => {
    it('should show loading spinner in processing state', () => {
      URLSearchParams.mockImplementation(() => ({
        get: jest.fn((param) => {
          if (param === 'code') return 'auth_code';
          if (param === 'state') return 'state_token';
          return null;
        }),
      }));

      mockHandleOAuthCallback.mockImplementation(() => new Promise(() => {}));

      render(<OAuthCallback />);

      // Check for spinner (we can't directly test CSS animations, but we can check for the element)
      const spinnerElement = screen.getByText('Completing sign in...').previousElementSibling;
      expect(spinnerElement).toHaveStyle({
        'border-radius': '50%',
        animation: 'spin 1s linear infinite'
      });
    });

    it('should show success checkmark in success state', async () => {
      URLSearchParams.mockImplementation(() => ({
        get: jest.fn((param) => {
          if (param === 'code') return 'auth_code';
          if (param === 'state') return 'state_token';
          return null;
        }),
      }));

      mockHandleOAuthCallback.mockResolvedValue({ success: true });

      render(<OAuthCallback />);

      await waitFor(() => {
        expect(screen.getByText('Sign in successful!')).toBeInTheDocument();
      });

      // Check for success icon styling
      const successIcon = screen.getByText('Sign in successful!').previousElementSibling;
      expect(successIcon).toHaveStyle({
        'background-color': '#10b981',
        'border-radius': '50%'
      });
    });

    it('should show error icon in error state', async () => {
      URLSearchParams.mockImplementation(() => ({
        get: jest.fn(() => null),
      }));

      render(<OAuthCallback />);

      await waitFor(() => {
        expect(screen.getByText('Sign in failed')).toBeInTheDocument();
      });

      // Check for error icon styling
      const errorIcon = screen.getByText('Sign in failed').previousElementSibling;
      expect(errorIcon).toHaveStyle({
        'background-color': '#ef4444',
        'border-radius': '50%'
      });
    });
  });
}); 