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


class TestInteractionReplayFix(unittest.TestCase):
    """Test suite for the interaction replay CORS fix"""
    
    def setUp(self):
        """Set up test environment"""
        self.app = create_app('testing')
        self.app_context = self.app.app_context()
        self.app_context.push()
        
        self.client = self.app.test_client()
        
        # Create all tables
        db.create_all()
        
        # Sample test data
        self.test_session_id = "test_replay_session"
        self.sample_audio_data = b'\x00\x01\x02\x03' * 1000  # 4KB of test data
        self.sample_base64_audio = base64.b64encode(self.sample_audio_data).decode('utf-8')
    
    def tearDown(self):
        """Clean up test environment"""
        db.session.remove()
        db.drop_all()
        self.app_context.pop()
    
    @patch('requests.get')
    def test_media_proxy_audio_chunk(self, mock_requests_get):
        """Test media proxy endpoint for audio chunks"""
        # Setup mock GCS response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = self.sample_audio_data
        mock_requests_get.return_value = mock_response
        
        # Create test interaction log
        interaction_log = InteractionLog(
            session_id=self.test_session_id,
            interaction_type="audio_chunk"
        )
        db.session.add(interaction_log)
        db.session.flush()
        
        # Create test media data
        media_data = InteractionMediaData(
            interaction_log_id=interaction_log.id,
            storage_type="cloud_storage",
            cloud_storage_url="https://storage.googleapis.com/test/audio.pcm"
        )
        db.session.add(media_data)
        db.session.commit()
        
        # Test the proxy endpoint
        response = self.client.get(f'/api/interaction-logs/media/{interaction_log.id}')
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get('Content-Type'), 'audio/pcm')
        self.assertEqual(response.headers.get('Access-Control-Allow-Origin'), '*')
        self.assertEqual(response.data, self.sample_audio_data)
        
        # Verify GCS was called
        mock_requests_get.assert_called_once_with(
            "https://storage.googleapis.com/test/audio.pcm", 
            timeout=30
        )
    
    @patch('requests.get')
    def test_media_proxy_api_response_audio(self, mock_requests_get):
        """Test media proxy endpoint for API response audio"""
        # Setup mock GCS response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = self.sample_audio_data
        mock_requests_get.return_value = mock_response
        
        # Create test interaction log
        interaction_log = InteractionLog(
            session_id=self.test_session_id,
            interaction_type="api_response"
        )
        db.session.add(interaction_log)
        db.session.flush()
        
        # Create test metadata
        metadata = InteractionMetadata(
            interaction_log_id=interaction_log.id,
            api_endpoint="gemini_live_api"
        )
        db.session.add(metadata)
        
        # Create test media data
        media_data = InteractionMediaData(
            interaction_log_id=interaction_log.id,
            storage_type="cloud_storage",
            cloud_storage_url="https://storage.googleapis.com/test/response.pcm"
        )
        db.session.add(media_data)
        db.session.commit()
        
        # Test the proxy endpoint
        response = self.client.get(f'/api/interaction-logs/media/{interaction_log.id}')
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get('Content-Type'), 'audio/pcm')
        self.assertEqual(response.headers.get('Access-Control-Allow-Origin'), '*')
        self.assertEqual(response.data, self.sample_audio_data)
    
    def test_media_proxy_hash_only_storage(self):
        """Test media proxy endpoint for hash-only storage"""
        # Create test interaction log
        interaction_log = InteractionLog(
            session_id=self.test_session_id,
            interaction_type="audio_chunk"
        )
        db.session.add(interaction_log)
        db.session.flush()
        
        # Create test media data with hash-only storage
        media_data = InteractionMediaData(
            interaction_log_id=interaction_log.id,
            storage_type="hash_only",
            data_hash="test_hash"
        )
        db.session.add(media_data)
        db.session.commit()
        
        # Test the proxy endpoint
        response = self.client.get(f'/api/interaction-logs/media/{interaction_log.id}')
        
        self.assertEqual(response.status_code, 404)
        response_data = json.loads(response.data)
        self.assertIn("hash only", response_data['error'])
    
    def test_media_proxy_nonexistent_interaction(self):
        """Test media proxy endpoint for non-existent interaction"""
        response = self.client.get('/api/interaction-logs/media/99999')
        
        self.assertEqual(response.status_code, 404)
        response_data = json.loads(response.data)
        self.assertEqual(response_data['error'], "Interaction not found")
    
    @patch('requests.get')
    def test_media_proxy_gcs_failure(self, mock_requests_get):
        """Test media proxy endpoint when GCS fetch fails"""
        # Setup mock GCS response failure
        mock_response = MagicMock()
        mock_response.status_code = 403
        mock_requests_get.return_value = mock_response
        
        # Create test interaction log
        interaction_log = InteractionLog(
            session_id=self.test_session_id,
            interaction_type="audio_chunk"
        )
        db.session.add(interaction_log)
        db.session.flush()
        
        # Create test media data
        media_data = InteractionMediaData(
            interaction_log_id=interaction_log.id,
            storage_type="cloud_storage",
            cloud_storage_url="https://storage.googleapis.com/test/audio.pcm"
        )
        db.session.add(media_data)
        db.session.commit()
        
        # Test the proxy endpoint
        response = self.client.get(f'/api/interaction-logs/media/{interaction_log.id}')
        
        self.assertEqual(response.status_code, 502)
        response_data = json.loads(response.data)
        self.assertIn("Failed to fetch from cloud storage", response_data['error'])


if __name__ == '__main__':
    unittest.main() 