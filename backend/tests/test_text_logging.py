import unittest
import json
import base64
from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app import create_app, db
from app.models import InteractionLog, InteractionMetadata, InteractionMediaData


class TestTextLogging(unittest.TestCase):
    """Test suite for text input and API response content-type handling"""
    
    def setUp(self):
        """Set up test environment"""
        self.app = create_app('testing')
        self.app_context = self.app.app_context()
        self.app_context.push()
        
        self.client = self.app.test_client()
        
        # Create all tables
        db.create_all()
        
        # Sample test data
        self.test_session_id = "test_text_session_123"
        self.sample_text_input = "Hello, can you help me with my project?"
        self.sample_api_response = "Of course! I'd be happy to help you with your project. What specific aspects are you working on?"
        
    def tearDown(self):
        """Clean up test environment"""
        db.session.remove()
        db.drop_all()
        self.app_context.pop()
    
    @patch('requests.get')
    def test_text_input_proxy_content_type(self, mock_requests_get):
        """Test that text_input interactions return proper text/plain content-type"""
        # Mock successful GCS response with our text
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = self.sample_text_input.encode('utf-8')
        mock_requests_get.return_value = mock_response
        
        # Create test interaction log for text_input
        interaction_log = InteractionLog(
            session_id=self.test_session_id,
            interaction_type="text_input"
        )
        db.session.add(interaction_log)
        db.session.flush()
        
        # Create test media data with .txt URL
        media_data = InteractionMediaData(
            interaction_log_id=interaction_log.id,
            storage_type="cloud_storage",
            cloud_storage_url=f"https://storage.googleapis.com/test-bucket/interactions/test_text_input_{interaction_log.id}.txt"
        )
        db.session.add(media_data)
        db.session.commit()
        
        # Test the proxy endpoint
        response = self.client.get(f'/api/interaction-logs/media/{interaction_log.id}')
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get('Content-Type'), 'text/plain; charset=utf-8')
        self.assertEqual(response.headers.get('Access-Control-Allow-Origin'), '*')
        self.assertEqual(response.data.decode('utf-8'), self.sample_text_input)
        
        # Verify GCS was called
        mock_requests_get.assert_called_once()
    
    @patch('requests.get')
    def test_api_response_text_with_txt_extension(self, mock_requests_get):
        """Test that API response with .txt extension returns text/plain content-type"""
        # Mock successful GCS response with our text
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = self.sample_api_response.encode('utf-8')
        mock_requests_get.return_value = mock_response
        
        # Create test interaction log for api_response
        interaction_log = InteractionLog(
            session_id=self.test_session_id,
            interaction_type="api_response"
        )
        db.session.add(interaction_log)
        db.session.flush()
        
        # Create test media data with .txt extension
        media_data = InteractionMediaData(
            interaction_log_id=interaction_log.id,
            storage_type="cloud_storage",
            cloud_storage_url=f"https://storage.googleapis.com/test-bucket/interactions/test_api_response_{interaction_log.id}.txt"
        )
        db.session.add(media_data)
        db.session.commit()
        
        # Test the proxy endpoint
        response = self.client.get(f'/api/interaction-logs/media/{interaction_log.id}')
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get('Content-Type'), 'text/plain; charset=utf-8')
        self.assertEqual(response.headers.get('Access-Control-Allow-Origin'), '*')
        self.assertEqual(response.data.decode('utf-8'), self.sample_api_response)
        
        # Verify GCS was called
        mock_requests_get.assert_called_once()
    
    @patch('requests.get')
    def test_api_response_text_without_extension_small_content(self, mock_requests_get):
        """Test that small API response without extension defaults to text/plain"""
        # Mock successful GCS response with small text content
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = self.sample_api_response.encode('utf-8')  # Small response < 1000 bytes
        mock_requests_get.return_value = mock_response
        
        # Create test interaction log for api_response
        interaction_log = InteractionLog(
            session_id=self.test_session_id,
            interaction_type="api_response"
        )
        db.session.add(interaction_log)
        db.session.flush()
        
        # Create metadata for gemini_live_api
        metadata = InteractionMetadata(
            interaction_log_id=interaction_log.id,
            api_endpoint='gemini_live_api'
        )
        db.session.add(metadata)
        
        # Create test media data without extension
        media_data = InteractionMediaData(
            interaction_log_id=interaction_log.id,
            storage_type="cloud_storage",
            cloud_storage_url=f"https://storage.googleapis.com/test-bucket/interactions/test_api_response_{interaction_log.id}"
        )
        db.session.add(media_data)
        db.session.commit()
        
        # Test the proxy endpoint
        response = self.client.get(f'/api/interaction-logs/media/{interaction_log.id}')
        
        self.assertEqual(response.status_code, 200)
        # Should default to text for small API responses
        self.assertEqual(response.headers.get('Content-Type'), 'text/plain; charset=utf-8')
        self.assertEqual(response.data.decode('utf-8'), self.sample_api_response)
    
    @patch('requests.get')
    def test_api_response_large_content_defaults_to_audio(self, mock_requests_get):
        """Test that large API response without extension defaults to audio/pcm"""
        # Mock successful GCS response with large content (>1000 bytes)
        large_audio_data = b'\x00\x01\x02\x03' * 500  # 2KB of audio data
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = large_audio_data
        mock_requests_get.return_value = mock_response
        
        # Create test interaction log for api_response
        interaction_log = InteractionLog(
            session_id=self.test_session_id,
            interaction_type="api_response"
        )
        db.session.add(interaction_log)
        db.session.flush()
        
        # Create metadata for gemini_live_api
        metadata = InteractionMetadata(
            interaction_log_id=interaction_log.id,
            api_endpoint='gemini_live_api'
        )
        db.session.add(metadata)
        
        # Create test media data without extension
        media_data = InteractionMediaData(
            interaction_log_id=interaction_log.id,
            storage_type="cloud_storage",
            cloud_storage_url=f"https://storage.googleapis.com/test-bucket/interactions/test_api_response_{interaction_log.id}"
        )
        db.session.add(media_data)
        db.session.commit()
        
        # Test the proxy endpoint
        response = self.client.get(f'/api/interaction-logs/media/{interaction_log.id}')
        
        self.assertEqual(response.status_code, 200)
        # Should default to audio for large API responses
        self.assertEqual(response.headers.get('Content-Type'), 'audio/pcm')
        self.assertEqual(response.data, large_audio_data)
    
    def test_text_input_inline_storage(self):
        """Test text_input with inline storage gets proper content-type"""
        # Create test interaction log for text_input
        interaction_log = InteractionLog(
            session_id=self.test_session_id,
            interaction_type="text_input"
        )
        db.session.add(interaction_log)
        db.session.flush()
        
        # Create test media data with inline storage
        media_data = InteractionMediaData(
            interaction_log_id=interaction_log.id,
            storage_type="inline",
            data_inline=self.sample_text_input.encode('utf-8')
        )
        db.session.add(media_data)
        db.session.commit()
        
        # Test the proxy endpoint
        response = self.client.get(f'/api/interaction-logs/media/{interaction_log.id}')
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get('Content-Type'), 'text/plain; charset=utf-8')
        self.assertEqual(response.headers.get('Access-Control-Allow-Origin'), '*')
        self.assertEqual(response.data.decode('utf-8'), self.sample_text_input)
    
    def test_api_response_inline_small_text(self):
        """Test small API response with inline storage gets text content-type"""
        # Create test interaction log for api_response
        interaction_log = InteractionLog(
            session_id=self.test_session_id,
            interaction_type="api_response"
        )
        db.session.add(interaction_log)
        db.session.flush()
        
        # Create test media data with small inline storage
        media_data = InteractionMediaData(
            interaction_log_id=interaction_log.id,
            storage_type="inline",
            data_inline=self.sample_api_response.encode('utf-8')  # Small < 1000 bytes
        )
        db.session.add(media_data)
        db.session.commit()
        
        # Test the proxy endpoint
        response = self.client.get(f'/api/interaction-logs/media/{interaction_log.id}')
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get('Content-Type'), 'text/plain; charset=utf-8')
        self.assertEqual(response.data.decode('utf-8'), self.sample_api_response)
    
    def test_api_response_inline_large_audio(self):
        """Test large API response with inline storage gets audio content-type"""
        # Create test interaction log for api_response
        interaction_log = InteractionLog(
            session_id=self.test_session_id,
            interaction_type="api_response"
        )
        db.session.add(interaction_log)
        db.session.flush()
        
        # Create test media data with large inline storage (>1000 bytes)
        large_audio_data = b'\x00\x01\x02\x03' * 500  # 2KB
        media_data = InteractionMediaData(
            interaction_log_id=interaction_log.id,
            storage_type="inline",
            data_inline=large_audio_data
        )
        db.session.add(media_data)
        db.session.commit()
        
        # Test the proxy endpoint
        response = self.client.get(f'/api/interaction-logs/media/{interaction_log.id}')
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get('Content-Type'), 'audio/pcm')
        self.assertEqual(response.data, large_audio_data)


if __name__ == '__main__':
    unittest.main() 