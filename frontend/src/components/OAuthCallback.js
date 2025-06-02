import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';

function OAuthCallback() {
  const { handleOAuthCallback } = useAuth();
  const [status, setStatus] = useState('processing');
  const [error, setError] = useState(null);
  
  // Use ref to track if we're already processing
  const isProcessing = useRef(false);
  const hasProcessed = useRef(false);

  useEffect(() => {
    // Prevent double execution
    if (isProcessing.current || hasProcessed.current) {
      return;
    }

    const processCallback = async () => {
      try {
        // Mark as processing
        isProcessing.current = true;

        // Extract code and state from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');

        if (!code || !state) {
          throw new Error('Missing authorization code or state parameter');
        }

        // Handle the OAuth callback
        const result = await handleOAuthCallback(code, state);

        if (result.success) {
          hasProcessed.current = true;
          setStatus('success');
          // Redirect to main app after successful authentication
          setTimeout(() => {
            window.location.href = '/';
          }, 2000);
        } else {
          throw new Error(result.error || 'Authentication failed');
        }
      } catch (error) {
        console.error('OAuth callback error:', error);
        setError(error.message);
        setStatus('error');
        hasProcessed.current = true;
      } finally {
        isProcessing.current = false;
      }
    };

    processCallback();
  }, [handleOAuthCallback]);

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '100vh',
      padding: '20px',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {status === 'processing' && (
        <>
          <div style={{
            width: '40px',
            height: '40px',
            border: '4px solid #e5e7eb',
            borderTop: '4px solid #3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginBottom: '16px'
          }}></div>
          <h2 style={{ margin: 0, color: '#374151' }}>Completing sign in...</h2>
          <p style={{ margin: '8px 0 0 0', color: '#6b7280', textAlign: 'center' }}>
            Please wait while we authenticate your account.
          </p>
        </>
      )}

      {status === 'success' && (
        <>
          <div style={{
            width: '40px',
            height: '40px',
            backgroundColor: '#10b981',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px'
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M20 6L9 17L4 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h2 style={{ margin: 0, color: '#374151' }}>Sign in successful!</h2>
          <p style={{ margin: '8px 0 0 0', color: '#6b7280', textAlign: 'center' }}>
            Redirecting you to the app...
          </p>
        </>
      )}

      {status === 'error' && (
        <>
          <div style={{
            width: '40px',
            height: '40px',
            backgroundColor: '#ef4444',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '16px'
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6L18 18" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h2 style={{ margin: 0, color: '#374151' }}>Sign in failed</h2>
          <p style={{ margin: '8px 0 16px 0', color: '#6b7280', textAlign: 'center', maxWidth: '400px' }}>
            {error || 'An error occurred during authentication. Please try again.'}
          </p>
          <button 
            onClick={() => window.location.href = '/'}
            style={{
              padding: '8px 16px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Return to app
          </button>
        </>
      )}

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default OAuthCallback; 