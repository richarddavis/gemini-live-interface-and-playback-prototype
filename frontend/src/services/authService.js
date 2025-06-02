/**
 * Authentication Service
 * Handles all authentication-related API calls to the backend
 */

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

class AuthService {
  /**
   * Get current authentication status
   */
  async getAuthStatus() {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/status`, {
        method: 'GET',
        credentials: 'include', // Include cookies for session
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Auth status check failed: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to get auth status:', error);
      return { authenticated: false, user: null };
    }
  }

  /**
   * Initiate OAuth login flow
   */
  async initiateLogin() {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Login initiation failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Redirect to OAuth provider
      if (data.auth_url) {
        window.location.href = data.auth_url;
      } else {
        throw new Error('No authorization URL received');
      }
    } catch (error) {
      console.error('Failed to initiate login:', error);
      throw error;
    }
  }

  /**
   * Handle OAuth callback (complete the authentication)
   */
  async handleCallback(code, state) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/callback`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code, state }),
      });
      
      if (!response.ok) {
        throw new Error(`OAuth callback failed: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to handle OAuth callback:', error);
      throw error;
    }
  }

  /**
   * Logout user
   */
  async logout() {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Logout failed: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to logout:', error);
      throw error;
    }
  }

  /**
   * Get current user information
   */
  async getCurrentUser() {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/user`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Get user failed: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to get current user:', error);
      throw error;
    }
  }
}

// Export a singleton instance
export default new AuthService(); 