import unittest
import json
import os
from unittest.mock import patch, MagicMock, Mock
from datetime import datetime, timedelta

import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app import create_app, db
from app.models import User, OAuthAccount
from app.services.auth_service import AuthService


class TestAuthService(unittest.TestCase):
    """Test suite for AuthService"""
    
    def setUp(self):
        """Set up test environment"""
        self.app = create_app('testing')
        self.app_context = self.app.app_context()
        self.app_context.push()
        
        # Create all tables
        db.create_all()
        
        # Create auth service instance
        self.auth_service = AuthService()
        
        # Mock discovery document
        self.mock_discovery = {
            'authorization_endpoint': 'http://localhost/dex/auth',
            'token_endpoint': 'http://localhost:5556/dex/token',
            'userinfo_endpoint': 'http://localhost:5556/dex/userinfo'
        }
        
        # Mock user info from OAuth provider
        self.mock_user_info = {
            'sub': 'test_user_123',
            'email': 'test@example.com',
            'name': 'Test User',
            'preferred_username': 'testuser'
        }
        
        # Mock OAuth tokens
        self.mock_tokens = {
            'access_token': 'mock_access_token_123',
            'refresh_token': 'mock_refresh_token_456',
            'expires_in': 3600,
            'token_type': 'Bearer'
        }
        
    def tearDown(self):
        """Clean up test environment"""
        db.session.remove()
        db.drop_all()
        self.app_context.pop()
    
    def test_auth_service_initialization(self):
        """Test AuthService initialization with environment variables"""
        self.assertEqual(self.auth_service.oauth_issuer, 'http://localhost:5556')
        self.assertEqual(self.auth_service.client_id, 'chat-app-dev')
        self.assertEqual(self.auth_service.client_secret, 'chat-app-dev-secret-12345')
        self.assertEqual(self.auth_service.redirect_uri, 'http://localhost/auth/callback')
    
    @patch('app.services.auth_service.requests.get')
    def test_get_discovery_document_success(self, mock_get):
        """Test successful discovery document retrieval"""
        mock_response = Mock()
        mock_response.json.return_value = self.mock_discovery
        mock_response.raise_for_status.return_value = None
        mock_get.return_value = mock_response
        
        result = self.auth_service.get_discovery_document()
        
        self.assertEqual(result, self.mock_discovery)
        mock_get.assert_called_once_with('http://localhost:5556/.well-known/openid_configuration')
    
    @patch('app.services.auth_service.requests.get')
    def test_get_discovery_document_fallback(self, mock_get):
        """Test discovery document fallback when request fails"""
        import requests
        mock_get.side_effect = requests.RequestException("Connection failed")
        
        with self.app.test_request_context():
            # Create a fresh instance to ensure the mock is applied
            from app.services.auth_service import AuthService
            test_auth_service = AuthService()
            result = test_auth_service.get_discovery_document()
        
        self.assertIn('authorization_endpoint', result)
        self.assertIn('token_endpoint', result)
        self.assertIn('userinfo_endpoint', result)
        self.assertEqual(result['authorization_endpoint'], 'http://localhost/dex/auth')
    
    def test_generate_pkce_challenge(self):
        """Test PKCE challenge generation"""
        code_verifier, code_challenge = self.auth_service.generate_pkce_challenge()
        
        # Verify code verifier is base64url encoded string
        self.assertIsInstance(code_verifier, str)
        self.assertGreaterEqual(len(code_verifier), 43)
        self.assertLessEqual(len(code_verifier), 128)
        
        # Verify code challenge is base64url encoded SHA256 hash
        self.assertIsInstance(code_challenge, str)
        self.assertNotEqual(code_verifier, code_challenge)
    
    @patch('app.services.auth_service.AuthService.get_discovery_document')
    def test_get_authorization_url_success(self, mock_discovery):
        """Test successful authorization URL generation"""
        mock_discovery.return_value = self.mock_discovery
        
        with self.app.test_request_context():
            auth_url, state, code_verifier = self.auth_service.get_authorization_url()
        
        self.assertIsNotNone(auth_url)
        self.assertIsNotNone(state)
        self.assertIsNotNone(code_verifier)
        self.assertIn('localhost/dex/auth', auth_url)
        self.assertIn('client_id=chat-app-dev', auth_url)
        self.assertIn('response_type=code', auth_url)
        self.assertIn('code_challenge=', auth_url)
    
    @patch('app.services.auth_service.AuthService.get_discovery_document')
    def test_get_authorization_url_no_discovery(self, mock_discovery):
        """Test authorization URL generation when discovery fails"""
        mock_discovery.return_value = None
        
        with self.app.test_request_context():
            result = self.auth_service.get_authorization_url()
        
        self.assertEqual(result, (None, None, None))
    
    @patch('app.services.auth_service.requests.post')
    @patch('app.services.auth_service.AuthService.get_discovery_document')
    def test_exchange_code_for_tokens_success(self, mock_discovery, mock_post):
        """Test successful token exchange"""
        mock_discovery.return_value = self.mock_discovery
        mock_response = Mock()
        mock_response.json.return_value = self.mock_tokens
        mock_response.raise_for_status.return_value = None
        mock_post.return_value = mock_response
        
        with self.app.test_request_context() as ctx:
            # Set up session data
            ctx.session['oauth_state'] = 'test_state_123'
            ctx.session['oauth_code_verifier'] = 'test_verifier_456'
            
            result = self.auth_service.exchange_code_for_tokens('auth_code_123', 'test_state_123')
        
        self.assertEqual(result, self.mock_tokens)
        mock_post.assert_called_once()
    
    @patch('app.services.auth_service.AuthService.get_discovery_document')
    def test_exchange_code_for_tokens_state_mismatch(self, mock_discovery):
        """Test token exchange with state mismatch"""
        mock_discovery.return_value = self.mock_discovery
        
        with self.app.test_request_context() as ctx:
            ctx.session['oauth_state'] = 'valid_state'
            
            result = self.auth_service.exchange_code_for_tokens('auth_code_123', 'invalid_state')
        
        self.assertIsNone(result)
    
    @patch('app.services.auth_service.requests.get')
    @patch('app.services.auth_service.AuthService.get_discovery_document')
    def test_get_user_info_success(self, mock_discovery, mock_get):
        """Test successful user info retrieval"""
        mock_discovery.return_value = self.mock_discovery
        mock_response = Mock()
        mock_response.json.return_value = self.mock_user_info
        mock_response.raise_for_status.return_value = None
        mock_get.return_value = mock_response
        
        result = self.auth_service.get_user_info('mock_access_token')
        
        self.assertEqual(result, self.mock_user_info)
        mock_get.assert_called_once()
        
        # Verify Authorization header
        call_args = mock_get.call_args
        headers = call_args[1]['headers']
        self.assertEqual(headers['Authorization'], 'Bearer mock_access_token')
    
    def test_create_or_update_user_new_user(self):
        """Test creating a new user from OAuth info"""
        with self.app.test_request_context():
            user = self.auth_service.create_or_update_user(self.mock_user_info, self.mock_tokens)
        
        self.assertIsNotNone(user)
        self.assertEqual(user.email, 'test@example.com')
        self.assertEqual(user.username, 'testuser')
        self.assertEqual(user.display_name, 'Test User')
        self.assertTrue(user.is_active)
        self.assertTrue(user.is_verified)
        
        # Verify OAuth account was created
        oauth_account = OAuthAccount.query.filter_by(user_id=user.id).first()
        self.assertIsNotNone(oauth_account)
        self.assertEqual(oauth_account.provider, 'dex')
        self.assertEqual(oauth_account.provider_id, 'test_user_123')
        self.assertEqual(oauth_account.access_token, 'mock_access_token_123')
    
    def test_create_or_update_user_existing_oauth_account(self):
        """Test updating existing user via OAuth account"""
        # Create existing user and OAuth account
        with self.app.test_request_context():
            existing_user = User(
                email='test@example.com',
                username='testuser',
                display_name='Old Name',
                is_active=True,
                is_verified=True
            )
            db.session.add(existing_user)
            db.session.flush()
            
            existing_oauth = OAuthAccount(
                user_id=existing_user.id,
                provider='dex',
                provider_id='test_user_123',
                provider_email='test@example.com',
                access_token='old_token'
            )
            db.session.add(existing_oauth)
            db.session.commit()
            
            # Update user
            updated_user = self.auth_service.create_or_update_user(self.mock_user_info, self.mock_tokens)
        
        self.assertEqual(updated_user.id, existing_user.id)
        self.assertIsNotNone(updated_user.last_login_at)
        
        # Verify OAuth account was updated
        oauth_account = OAuthAccount.query.filter_by(user_id=updated_user.id).first()
        self.assertEqual(oauth_account.access_token, 'mock_access_token_123')
    
    def test_create_or_update_user_missing_required_info(self):
        """Test handling missing required user info"""
        incomplete_user_info = {'email': 'test@example.com'}  # Missing 'sub'
        
        with self.app.test_request_context():
            user = self.auth_service.create_or_update_user(incomplete_user_info, self.mock_tokens)
        
        self.assertIsNone(user)
    
    def test_login_user(self):
        """Test user login session management"""
        user = User(email='test@example.com', username='testuser')
        db.session.add(user)
        db.session.commit()
        
        with self.app.test_request_context() as ctx:
            self.auth_service.login_user(user)
            
            self.assertEqual(ctx.session['user_id'], user.id)
            self.assertTrue(ctx.session['logged_in'])
            self.assertTrue(ctx.session.permanent)
    
    def test_logout_user(self):
        """Test user logout"""
        with self.app.test_request_context() as ctx:
            ctx.session['user_id'] = 123
            ctx.session['logged_in'] = True
            
            self.auth_service.logout_user()
            
            self.assertNotIn('user_id', ctx.session)
            self.assertNotIn('logged_in', ctx.session)
    
    def test_get_current_user_authenticated(self):
        """Test getting current user when authenticated"""
        user = User(email='test@example.com', username='testuser')
        db.session.add(user)
        db.session.commit()
        
        with self.app.test_request_context() as ctx:
            ctx.session['user_id'] = user.id
            ctx.session['logged_in'] = True
            
            current_user = self.auth_service.get_current_user()
            
            self.assertEqual(current_user.id, user.id)
            self.assertEqual(current_user.email, 'test@example.com')
    
    def test_get_current_user_not_authenticated(self):
        """Test getting current user when not authenticated"""
        with self.app.test_request_context():
            current_user = self.auth_service.get_current_user()
            self.assertIsNone(current_user)
    
    def test_is_authenticated_true(self):
        """Test authentication check when user is logged in"""
        with self.app.test_request_context() as ctx:
            ctx.session['user_id'] = 123
            ctx.session['logged_in'] = True
            
            self.assertTrue(self.auth_service.is_authenticated())
    
    def test_is_authenticated_false(self):
        """Test authentication check when user is not logged in"""
        with self.app.test_request_context():
            self.assertFalse(self.auth_service.is_authenticated())


if __name__ == '__main__':
    unittest.main() 