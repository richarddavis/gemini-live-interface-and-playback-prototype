import unittest
import json
from unittest.mock import patch, Mock

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app import create_app, db
from app.models import User, OAuthAccount

import pytest

pytestmark = pytest.mark.integration

class TestAuthRoutes(unittest.TestCase):
    """Test suite for authentication API routes"""
    
    def setUp(self):
        """Set up test environment"""
        self.app = create_app('testing')
        self.app_context = self.app.app_context()
        self.app_context.push()
        
        self.client = self.app.test_client()
        
        # Create all tables
        db.create_all()
        
        # Mock data
        self.mock_discovery = {
            'authorization_endpoint': 'http://auth.localhost/dex/auth',
            'token_endpoint': 'http://auth.localhost/dex/token',
            'userinfo_endpoint': 'http://auth.localhost/dex/userinfo'
        }
        
        self.mock_user_info = {
            'sub': 'test_user_123',
            'email': 'test@example.com',
            'name': 'Test User',
            'preferred_username': 'testuser'
        }
        
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
    
    def test_auth_status_not_authenticated(self):
        """Test /api/auth/status when user is not authenticated"""
        response = self.client.get('/api/auth/status')
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertFalse(data['authenticated'])
        self.assertIsNone(data['user'])
    
    def test_auth_status_authenticated(self):
        """Test /api/auth/status when user is authenticated"""
        # Create and login user
        user = User(email='test@example.com', username='testuser', display_name='Test User')
        db.session.add(user)
        db.session.commit()
        
        with self.client.session_transaction() as sess:
            sess['user_id'] = user.id
            sess['logged_in'] = True
        
        response = self.client.get('/api/auth/status')
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['authenticated'])
        self.assertIsNotNone(data['user'])
        self.assertEqual(data['user']['email'], 'test@example.com')
    
    @patch('app.services.auth_service.AuthService.get_discovery_document')
    def test_login_success(self, mock_discovery):
        """Test /api/auth/login returns authorization URL"""
        mock_discovery.return_value = self.mock_discovery
        
        response = self.client.get('/api/auth/login')
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertIn('auth_url', data)
        self.assertIn('state', data)
        self.assertIn('auth.localhost/dex/auth', data['auth_url'])
        self.assertIn('client_id=chat-app-dev', data['auth_url'])
    
    @patch('app.services.auth_service.AuthService.get_discovery_document')
    def test_login_discovery_failure(self, mock_discovery):
        """Test /api/auth/login when discovery document fails"""
        mock_discovery.return_value = None
        
        response = self.client.get('/api/auth/login')
        
        self.assertEqual(response.status_code, 500)
        data = json.loads(response.data)
        self.assertIn('error', data)
    
    @patch('app.services.auth_service.requests.get')
    @patch('app.services.auth_service.requests.post')
    @patch('app.services.auth_service.AuthService.get_discovery_document')
    def test_callback_success(self, mock_discovery, mock_post, mock_get):
        """Test successful /api/auth/callback"""
        # Mock discovery
        mock_discovery.return_value = self.mock_discovery
        
        # Mock token exchange
        mock_token_response = Mock()
        mock_token_response.json.return_value = self.mock_tokens
        mock_token_response.raise_for_status.return_value = None
        mock_post.return_value = mock_token_response
        
        # Mock user info
        mock_user_response = Mock()
        mock_user_response.json.return_value = self.mock_user_info
        mock_user_response.raise_for_status.return_value = None
        mock_get.return_value = mock_user_response
        
        # Set up session for OAuth state
        with self.client.session_transaction() as sess:
            sess['oauth_state'] = 'test_state_123'
            sess['oauth_code_verifier'] = 'test_verifier_456'
        
        # Make callback request
        payload = {
            'code': 'auth_code_123',
            'state': 'test_state_123'
        }
        
        response = self.client.post('/api/auth/callback', 
                                  json=payload,
                                  headers={'Content-Type': 'application/json'})
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])
        self.assertIn('user', data)
        self.assertEqual(data['user']['email'], 'test@example.com')
        
        # Verify user was created in database
        user = User.query.filter_by(email='test@example.com').first()
        self.assertIsNotNone(user)
        
        # Verify OAuth account was created
        oauth_account = OAuthAccount.query.filter_by(user_id=user.id).first()
        self.assertIsNotNone(oauth_account)
        self.assertEqual(oauth_account.provider, 'dex')
    
    def test_callback_missing_data(self):
        """Test /api/auth/callback with missing data"""
        response = self.client.post('/api/auth/callback',
                                  json={},
                                  headers={'Content-Type': 'application/json'})
        
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertIn('error', data)
    
    def test_callback_no_json(self):
        """Test /api/auth/callback with no JSON data"""
        response = self.client.post('/api/auth/callback')
        
        # The try-catch block catches the JSON parsing error and returns 500
        self.assertEqual(response.status_code, 500)
        data = json.loads(response.data)
        self.assertIn('error', data)
    
    def test_callback_state_mismatch(self):
        """Test /api/auth/callback with state mismatch"""
        with self.client.session_transaction() as sess:
            sess['oauth_state'] = 'valid_state'
        
        payload = {
            'code': 'auth_code_123',
            'state': 'invalid_state'
        }
        
        response = self.client.post('/api/auth/callback',
                                  json=payload,
                                  headers={'Content-Type': 'application/json'})
        
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.data)
        self.assertIn('error', data)
    
    def test_logout_success(self):
        """Test successful /api/auth/logout"""
        # Create and login user
        user = User(email='test@example.com', username='testuser')
        db.session.add(user)
        db.session.commit()
        
        with self.client.session_transaction() as sess:
            sess['user_id'] = user.id
            sess['logged_in'] = True
        
        response = self.client.post('/api/auth/logout')
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertTrue(data['success'])
        
        # Verify session was cleared
        with self.client.session_transaction() as sess:
            self.assertNotIn('user_id', sess)
            self.assertNotIn('logged_in', sess)
    
    def test_logout_not_authenticated(self):
        """Test /api/auth/logout when not authenticated"""
        response = self.client.post('/api/auth/logout')
        
        self.assertEqual(response.status_code, 401)
        data = json.loads(response.data)
        self.assertIn('error', data)
    
    def test_get_current_user_success(self):
        """Test successful /api/auth/user"""
        # Create and login user
        user = User(email='test@example.com', username='testuser', display_name='Test User')
        db.session.add(user)
        db.session.commit()
        
        with self.client.session_transaction() as sess:
            sess['user_id'] = user.id
            sess['logged_in'] = True
        
        response = self.client.get('/api/auth/user')
        
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.data)
        self.assertIn('user', data)
        self.assertEqual(data['user']['email'], 'test@example.com')
        self.assertEqual(data['user']['display_name'], 'Test User')
    
    def test_get_current_user_not_authenticated(self):
        """Test /api/auth/user when not authenticated"""
        response = self.client.get('/api/auth/user')
        
        self.assertEqual(response.status_code, 401)
        data = json.loads(response.data)
        self.assertIn('error', data)
    
    def test_require_auth_decorator(self):
        """Test that @require_auth decorator works correctly"""
        # Test unauthenticated access to protected route
        response = self.client.get('/api/auth/user')
        self.assertEqual(response.status_code, 401)
        
        # Test authenticated access
        user = User(email='test@example.com', username='testuser')
        db.session.add(user)
        db.session.commit()
        
        with self.client.session_transaction() as sess:
            sess['user_id'] = user.id
            sess['logged_in'] = True
        
        response = self.client.get('/api/auth/user')
        self.assertEqual(response.status_code, 200)


if __name__ == '__main__':
    unittest.main() 