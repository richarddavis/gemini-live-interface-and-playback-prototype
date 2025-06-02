import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import authService from '../services/authService';

// Create the AuthContext
const AuthContext = createContext();

// Action types for the auth reducer
const AUTH_ACTIONS = {
  SET_LOADING: 'SET_LOADING',
  SET_AUTHENTICATED: 'SET_AUTHENTICATED',
  SET_USER: 'SET_USER',
  LOGOUT: 'LOGOUT',
  SET_ERROR: 'SET_ERROR',
};

// Initial state
const initialState = {
  isAuthenticated: false,
  user: null,
  loading: true,
  error: null,
};

// Auth reducer
function authReducer(state, action) {
  switch (action.type) {
    case AUTH_ACTIONS.SET_LOADING:
      return {
        ...state,
        loading: action.payload,
        error: null,
      };
    
    case AUTH_ACTIONS.SET_AUTHENTICATED:
      return {
        ...state,
        isAuthenticated: action.payload,
        loading: false,
        error: null,
      };
    
    case AUTH_ACTIONS.SET_USER:
      return {
        ...state,
        user: action.payload,
        isAuthenticated: !!action.payload,
        loading: false,
        error: null,
      };
    
    case AUTH_ACTIONS.LOGOUT:
      return {
        ...state,
        isAuthenticated: false,
        user: null,
        loading: false,
        error: null,
      };
    
    case AUTH_ACTIONS.SET_ERROR:
      return {
        ...state,
        error: action.payload,
        loading: false,
      };
    
    default:
      return state;
  }
}

// AuthProvider component
export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Check authentication status on app load
  const checkAuthStatus = useCallback(async () => {
    try {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
      const authStatus = await authService.getAuthStatus();
      
      if (authStatus.authenticated && authStatus.user) {
        dispatch({ type: AUTH_ACTIONS.SET_USER, payload: authStatus.user });
      } else {
        dispatch({ type: AUTH_ACTIONS.SET_AUTHENTICATED, payload: false });
      }
    } catch (error) {
      console.error('Failed to check auth status:', error);
      dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: error.message });
    }
  }, [dispatch]);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  const login = useCallback(async () => {
    try {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
      await authService.initiateLogin();
      // Note: This will redirect to OAuth provider, so we won't reach here
    } catch (error) {
      console.error('Login failed:', error);
      dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: error.message });
    }
  }, [dispatch]);

  const logout = useCallback(async () => {
    try {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
      await authService.logout();
      dispatch({ type: AUTH_ACTIONS.LOGOUT });
    } catch (error) {
      console.error('Logout failed:', error);
      dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: error.message });
      // Even if logout API fails, clear local state
      dispatch({ type: AUTH_ACTIONS.LOGOUT });
    }
  }, [dispatch]);

  const handleOAuthCallback = useCallback(async (code, state) => {
    try {
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
      const result = await authService.handleCallback(code, state);
      
      if (result.success && result.user) {
        dispatch({ type: AUTH_ACTIONS.SET_USER, payload: result.user });
        return { success: true };
      } else {
        throw new Error(result.error || 'OAuth callback failed during context processing');
      }
    } catch (error) {
      console.error('OAuth callback processing failed in AuthContext:', error);
      dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: error.message });
      return { success: false, error: error.message };
    }
  }, [dispatch]);

  const refreshUser = useCallback(async () => {
    try {
      const userResponse = await authService.getCurrentUser();
      if (userResponse.user) {
        dispatch({ type: AUTH_ACTIONS.SET_USER, payload: userResponse.user });
      }
    } catch (error) {
      console.error('Failed to refresh user:', error);
      // If getting user fails, user might be logged out
      dispatch({ type: AUTH_ACTIONS.LOGOUT });
    }
  }, [dispatch]);

  const value = {
    ...state,
    login,
    logout,
    handleOAuthCallback,
    refreshUser,
    checkAuthStatus,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to use the AuthContext
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext; 