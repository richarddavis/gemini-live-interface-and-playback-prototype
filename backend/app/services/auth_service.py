import os
import requests
from datetime import datetime, timedelta
from flask import current_app, session
from urllib.parse import urlencode
from ..models import User, OAuthAccount
from .. import db
import secrets
import hashlib
import base64

class AuthService:
    """Service for handling OAuth authentication with Dex"""
    
    def __init__(self):
        self.oauth_issuer = os.getenv('OAUTH_ISSUER', 'http://localhost:5556')
        self.client_id = os.getenv('OAUTH_CLIENT_ID', 'chat-app-dev')
        self.client_secret = os.getenv('OAUTH_CLIENT_SECRET', 'chat-app-dev-secret-12345')
        self.redirect_uri = 'http://localhost:3000/auth/callback'
        
    def get_discovery_document(self):
        """Get OAuth discovery document from Dex"""
        try:
            response = requests.get(f"{self.oauth_issuer}/.well-known/openid_configuration")
            response.raise_for_status()
            discovery = response.json()
            
            # Only replace oauth-server with localhost for browser-facing endpoints
            # Keep internal endpoints as-is for server-to-server communication
            if 'authorization_endpoint' in discovery and discovery['authorization_endpoint']:
                discovery['authorization_endpoint'] = discovery['authorization_endpoint'].replace('http://oauth-server:', 'http://localhost:')
            
            # Keep the issuer as oauth-server for internal token validation
            # but create a browser-friendly issuer for the frontend
            discovery['browser_issuer'] = discovery.get('issuer', '').replace('http://oauth-server:', 'http://localhost:')
            
            return discovery
        except requests.RequestException as e:
            current_app.logger.error(f"Failed to get discovery document: {e}")
            # Fallback for development
            return {
                'authorization_endpoint': f"{self.oauth_issuer.replace('oauth-server', 'localhost')}/auth",
                'token_endpoint': f"{self.oauth_issuer}/token",
                'userinfo_endpoint': f"{self.oauth_issuer}/userinfo",
                'jwks_uri': f"{self.oauth_issuer}/keys",
                'issuer': self.oauth_issuer,
                'browser_issuer': self.oauth_issuer.replace('oauth-server', 'localhost')
            }
    
    def generate_pkce_challenge(self):
        """Generate PKCE challenge for OAuth 2.1 compliance"""
        # Generate code verifier (43-128 characters)
        code_verifier = base64.urlsafe_b64encode(os.urandom(32)).decode('utf-8').rstrip('=')
        
        # Generate code challenge (SHA256 hash of verifier)
        code_challenge = base64.urlsafe_b64encode(
            hashlib.sha256(code_verifier.encode('utf-8')).digest()
        ).decode('utf-8').rstrip('=')
        
        return code_verifier, code_challenge
    
    def get_authorization_url(self):
        """Generate OAuth authorization URL with PKCE"""
        discovery = self.get_discovery_document()
        if not discovery:
            return None, None, None
            
        authorization_endpoint = discovery.get('authorization_endpoint')
        if not authorization_endpoint:
            return None, None, None
        
        # Generate PKCE parameters
        code_verifier, code_challenge = self.generate_pkce_challenge()
        
        # Generate state parameter for CSRF protection
        state = secrets.token_urlsafe(32)
        
        # Store PKCE verifier and state in session
        session['oauth_code_verifier'] = code_verifier
        session['oauth_state'] = state
        
        # Build authorization URL
        params = {
            'client_id': self.client_id,
            'response_type': 'code',
            'scope': 'openid profile email',
            'redirect_uri': self.redirect_uri,
            'state': state,
            'code_challenge': code_challenge,
            'code_challenge_method': 'S256'
        }
        
        auth_url = f"{authorization_endpoint}?{urlencode(params)}"
        return auth_url, state, code_verifier
    
    def exchange_code_for_tokens(self, authorization_code, state):
        """Exchange authorization code for access tokens"""
        # Verify state parameter
        if state != session.get('oauth_state'):
            current_app.logger.error("OAuth state mismatch")
            return None
        
        discovery = self.get_discovery_document()
        if not discovery:
            return None
            
        token_endpoint = discovery.get('token_endpoint')
        if not token_endpoint:
            return None
        
        # Get PKCE code verifier from session
        code_verifier = session.get('oauth_code_verifier')
        if not code_verifier:
            current_app.logger.error("Missing PKCE code verifier")
            return None
        
        # Exchange code for tokens
        token_data = {
            'grant_type': 'authorization_code',
            'client_id': self.client_id,
            'client_secret': self.client_secret,
            'code': authorization_code,
            'redirect_uri': self.redirect_uri,
            'code_verifier': code_verifier
        }
        
        try:
            response = requests.post(token_endpoint, data=token_data)
            response.raise_for_status()
            tokens = response.json()
            
            # Clean up session
            session.pop('oauth_code_verifier', None)
            session.pop('oauth_state', None)
            
            return tokens
        except requests.RequestException as e:
            current_app.logger.error(f"Token exchange failed: {e}")
            return None
    
    def get_user_info(self, access_token):
        """Get user information from OAuth provider"""
        discovery = self.get_discovery_document()
        if not discovery:
            return None
            
        userinfo_endpoint = discovery.get('userinfo_endpoint')
        if not userinfo_endpoint:
            return None
        
        headers = {'Authorization': f'Bearer {access_token}'}
        
        try:
            response = requests.get(userinfo_endpoint, headers=headers)
            response.raise_for_status()
            return response.json()
        except requests.RequestException as e:
            current_app.logger.error(f"Failed to get user info: {e}")
            return None
    
    def create_or_update_user(self, user_info, tokens):
        """Create or update user from OAuth user info"""
        try:
            provider = 'dex'
            provider_id = user_info.get('sub')
            email = user_info.get('email')
            username = user_info.get('preferred_username', user_info.get('name'))
            
            if not provider_id or not email:
                current_app.logger.error("Missing required user info")
                return None
            
            # Check if OAuth account exists
            oauth_account = OAuthAccount.query.filter_by(
                provider=provider,
                provider_id=provider_id
            ).first()
            
            if oauth_account:
                # Update existing user
                user = oauth_account.user
                user.last_login_at = datetime.utcnow()
                
                # Update OAuth account tokens
                oauth_account.access_token = tokens.get('access_token')
                oauth_account.refresh_token = tokens.get('refresh_token')
                oauth_account.last_used_at = datetime.utcnow()
                
                # Update token expiration if provided
                if 'expires_in' in tokens:
                    oauth_account.token_expires_at = datetime.utcnow() + timedelta(
                        seconds=tokens['expires_in']
                    )
                
            else:
                # Check if user exists by email
                user = User.query.filter_by(email=email).first()
                
                if not user:
                    # Create new user
                    user = User(
                        email=email,
                        username=username,
                        display_name=user_info.get('name', username),
                        is_active=True,
                        is_verified=True,  # OAuth users are considered verified
                        last_login_at=datetime.utcnow()
                    )
                    db.session.add(user)
                    db.session.flush()  # Get user ID
                
                # Create OAuth account
                oauth_account = OAuthAccount(
                    user_id=user.id,
                    provider=provider,
                    provider_id=provider_id,
                    provider_email=email,
                    provider_username=username,
                    access_token=tokens.get('access_token'),
                    refresh_token=tokens.get('refresh_token'),
                    provider_data=user_info
                )
                
                # Set token expiration if provided
                if 'expires_in' in tokens:
                    oauth_account.token_expires_at = datetime.utcnow() + timedelta(
                        seconds=tokens['expires_in']
                    )
                
                db.session.add(oauth_account)
            
            db.session.commit()
            return user
            
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Failed to create/update user: {e}")
            return None
    
    def login_user(self, user):
        """Log in user by setting session"""
        session['user_id'] = user.id
        session['logged_in'] = True
        session.permanent = True
        current_app.permanent_session_lifetime = timedelta(days=7)
    
    def logout_user(self):
        """Log out user by clearing session"""
        session.clear()
    
    def get_current_user(self):
        """Get current logged in user"""
        if not session.get('logged_in') or not session.get('user_id'):
            return None
        
        return User.query.get(session['user_id'])
    
    def is_authenticated(self):
        """Check if user is authenticated"""
        return bool(session.get('logged_in') and session.get('user_id'))

# Global auth service instance
auth_service = AuthService() 