import authService from '../authService';

// Mock fetch globally
global.fetch = jest.fn();

describe('AuthService', () => {
  beforeEach(() => {
    fetch.mockClear();
    // Reset any global state
    delete window.location;
    window.location = { href: '' };
  });

  describe('getAuthStatus', () => {
    it('should return auth status on successful response', async () => {
      const mockResponse = { authenticated: true, user: { id: 1, email: 'test@example.com' } };
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await authService.getAuthStatus();

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/auth/status',
        expect.objectContaining({
          method: 'GET',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        })
      );
      expect(result).toEqual(mockResponse);
    });

    it('should return default auth status on failed response', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const result = await authService.getAuthStatus();

      expect(result).toEqual({ authenticated: false, user: null });
    });

    it('should handle network errors gracefully', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await authService.getAuthStatus();

      expect(result).toEqual({ authenticated: false, user: null });
    });
  });

  describe('initiateLogin', () => {
    it('should redirect to auth URL on successful response', async () => {
      const mockAuthUrl = 'http://oauth-provider/auth?client_id=test';
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ auth_url: mockAuthUrl }),
      });

      await authService.initiateLogin();

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/auth/login',
        expect.objectContaining({
          method: 'GET',
          credentials: 'include',
        })
      );
      expect(window.location.href).toBe(mockAuthUrl);
    });

    it('should throw error when no auth URL received', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await expect(authService.initiateLogin()).rejects.toThrow('No authorization URL received');
    });

    it('should throw error on failed response', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(authService.initiateLogin()).rejects.toThrow('Login initiation failed: 500');
    });
  });

  describe('handleCallback', () => {
    it('should handle OAuth callback successfully', async () => {
      const mockResult = { success: true, user: { id: 1, email: 'test@example.com' } };
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
      });

      const result = await authService.handleCallback('auth_code', 'state_token');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/auth/callback',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: 'auth_code', state: 'state_token' }),
        })
      );
      expect(result).toEqual(mockResult);
    });

    it('should throw error on failed callback', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

      await expect(authService.handleCallback('code', 'state')).rejects.toThrow('OAuth callback failed: 400');
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      const mockResult = { success: true };
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
      });

      const result = await authService.logout();

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/auth/logout',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        })
      );
      expect(result).toEqual(mockResult);
    });

    it('should throw error on failed logout', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(authService.logout()).rejects.toThrow('Logout failed: 500');
    });
  });

  describe('getCurrentUser', () => {
    it('should get current user successfully', async () => {
      const mockUser = { user: { id: 1, email: 'test@example.com' } };
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockUser,
      });

      const result = await authService.getCurrentUser();

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8080/api/auth/user',
        expect.objectContaining({
          method: 'GET',
          credentials: 'include',
        })
      );
      expect(result).toEqual(mockUser);
    });

    it('should throw error when user request fails', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      await expect(authService.getCurrentUser()).rejects.toThrow('Get user failed: 401');
    });
  });
}); 