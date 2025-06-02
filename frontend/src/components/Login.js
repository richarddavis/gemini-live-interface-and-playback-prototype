import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const Login = ({ onLogin }) => {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    fetchProviders();
    
    // Handle OAuth callback
    const urlParams = new URLSearchParams(location.search);
    const token = urlParams.get('token');
    const userId = urlParams.get('user_id');
    
    if (token && userId) {
      // Store token and redirect
      localStorage.setItem('authToken', token);
      localStorage.setItem('userId', userId);
      
      // Fetch user info and call onLogin
      fetchUserInfo(token).then(user => {
        if (user) {
          onLogin(user);
          navigate('/');
        }
      });
    }
  }, [location, navigate, onLogin]);

  const fetchProviders = async () => {
    try {
      const response = await fetch('/api/auth/providers');
      const data = await response.json();
      setProviders(data.providers || []);
    } catch (err) {
      setError('Failed to load authentication providers');
      console.error('Error fetching providers:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserInfo = async (token) => {
    try {
      const response = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.user;
      }
    } catch (err) {
      console.error('Error fetching user info:', err);
    }
    return null;
  };

  const handleProviderLogin = (provider) => {
    // Redirect to OAuth provider
    window.location.href = `/api/auth/login/${provider.name}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading authentication options...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Choose your preferred authentication method
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          {providers.length > 0 ? (
            providers.map((provider) => (
              <button
                key={provider.name}
                onClick={() => handleProviderLogin(provider)}
                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                <span className="flex items-center">
                  {getProviderIcon(provider.name)}
                  <span className="ml-2">Continue with {provider.display_name}</span>
                </span>
              </button>
            ))
          ) : (
            <div className="text-center py-8">
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                <h3 className="text-yellow-800 font-medium">No Authentication Providers Configured</h3>
                <p className="text-yellow-700 text-sm mt-2">
                  To enable authentication, configure OAuth providers in your environment variables:
                </p>
                <ul className="text-yellow-700 text-sm mt-2 list-disc list-inside">
                  <li>OAUTH_GOOGLE_CLIENT_ID & OAUTH_GOOGLE_CLIENT_SECRET</li>
                  <li>OAUTH_GITHUB_CLIENT_ID & OAUTH_GITHUB_CLIENT_SECRET</li>
                  <li>OAUTH_MICROSOFT_CLIENT_ID & OAUTH_MICROSOFT_CLIENT_SECRET</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        <div className="text-center">
          <p className="text-xs text-gray-500">
            By signing in, you agree to our terms of service and privacy policy.
          </p>
        </div>
      </div>
    </div>
  );
};

const getProviderIcon = (providerName) => {
  const iconClass = "w-5 h-5";
  
  switch (providerName) {
    case 'google':
      return (
        <svg className={iconClass} viewBox="0 0 24 24">
          <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
      );
    case 'github':
      return (
        <svg className={iconClass} fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
        </svg>
      );
    case 'microsoft':
      return (
        <svg className={iconClass} fill="currentColor" viewBox="0 0 24 24">
          <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zM24 11.4H12.6V0H24v11.4z"/>
        </svg>
      );
    default:
      return (
        <svg className={iconClass} fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
      );
  }
};

export default Login; 