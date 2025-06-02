import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './AuthWidget.css';

function AuthWidget() {
  const { isAuthenticated, user, loading, login, logout } = useAuth();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    }

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  // Generate user initials from display name or email
  const getUserInitials = (user) => {
    if (!user) return '?';
    
    if (user.display_name) {
      return user.display_name
        .split(' ')
        .map(name => name.charAt(0))
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    
    if (user.email) {
      return user.email.charAt(0).toUpperCase();
    }
    
    return '?';
  };

  const handleLogin = async () => {
    try {
      await login();
    } catch (error) {
      console.error('Login failed:', error);
      // Could show a toast notification here
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setIsDropdownOpen(false);
    } catch (error) {
      console.error('Logout failed:', error);
      // Could show a toast notification here
    }
  };

  const toggleDropdown = () => {
    setIsDropdownOpen(!isDropdownOpen);
  };

  // Show loading spinner
  if (loading) {
    return (
      <div className="auth-widget">
        <div className="auth-loading" data-testid="auth-loading">
          <div className="loading-spinner" data-testid="loading-spinner"></div>
        </div>
      </div>
    );
  }

  // Authenticated user view
  if (isAuthenticated && user) {
    return (
      <div className="auth-widget" ref={dropdownRef}>
        <button 
          className="user-avatar"
          onClick={toggleDropdown}
          aria-label="User menu"
        >
          <span className="user-initials">
            {getUserInitials(user)}
          </span>
        </button>

        {isDropdownOpen && (
          <div className="user-dropdown">
            <div className="user-info">
              <div className="user-name">
                {user.display_name || user.username || 'User'}
              </div>
              <div className="user-email">
                {user.email}
              </div>
            </div>
            <div className="dropdown-divider"></div>
            <button 
              className="dropdown-item logout-button"
              onClick={handleLogout}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M16 17L21 12L16 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Log out
            </button>
          </div>
        )}
      </div>
    );
  }

  // Not authenticated view
  return (
    <div className="auth-widget">
      <div className="auth-buttons">
        <button 
          className="auth-button signup-button"
          onClick={handleLogin}
        >
          Sign up
        </button>
        <button 
          className="auth-button login-button"
          onClick={handleLogin}
        >
          Log in
        </button>
      </div>
    </div>
  );
}

export default AuthWidget; 