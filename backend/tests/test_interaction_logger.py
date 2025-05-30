import unittest
import json
import base64
import hashlib
from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta
from io import BytesIO

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app import create_app, db
from app.models import InteractionLog, InteractionMetadata, InteractionMediaData, InteractionSessionSummary


class TestInteractionLogger(unittest.TestCase):
    """Test suite for interaction logging functionality"""
    
    def setUp(self):
        """Set up test environment"""
        self.app = create_app('testing')
        self.app_context = self.app.app_context()
        self.app_context.push()
        
        self.client = self.app.test_client()
        
        # Create all tables
        db.create_all()
        
        # Sample test data
        self.test_session_id = "test_session_123"
        self.test_interaction_types = ['user_action', 'audio_chunk', 'video_frame', 'api_response']
        
        # Sample audio data (PCM format simulation)
        self.sample_audio_data = b'\x00\x01\x02\x03' * 1000  # 4KB of test data
        self.sample_base64_audio = base64.b64encode(self.sample_audio_data).decode('utf-8')
        
        # Sample API response JSON with embedded base64
        self.sample_api_response = {
            "mimeType": "audio/pcm;rate=24000",
            "data": self.sample_base64_audio
        }
        self.sample_api_response_json = json.dumps(self.sample_api_response)
    
    def tearDown(self):
        """Clean up test environment"""
        db.session.remove()
        db.drop_all()
        self.app_context.pop()
    
    def test_basic_interaction_logging(self):
        """Test basic interaction logging without media"""
        payload = {
            "session_id": self.test_session_id,
            "interaction_type": "user_action",
            "metadata": {
                "processing_time_ms": 150,
                "data_size_bytes": 1024
            }
        }
        
        response = self.client.post('/api/interaction-logs', 
                                  json=payload,
                                  headers={'Content-Type': 'application/json'})
        
        self.assertEqual(response.status_code, 201)
        
        # Verify data was stored
        log = InteractionLog.query.filter_by(session_id=self.test_session_id).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.interaction_type, "user_action")
        
        # Verify metadata
        metadata = InteractionMetadata.query.filter_by(interaction_log_id=log.id).first()
        self.assertIsNotNone(metadata)
        self.assertEqual(metadata.processing_time_ms, 150)
    
    @patch('app.services.storage.GCSStorageService.upload_file')
    def test_cloud_storage_audio_chunk(self, mock_gcs_upload):
        """Test audio chunk logging with cloud storage"""
        mock_gcs_upload.return_value = ('https://storage.googleapis.com/test/audio.pcm', 'audio/pcm')
        
        payload = {
            "session_id": self.test_session_id,
            "interaction_type": "audio_chunk",
            "media_data": {
                "storage_type": "cloud_storage",
                "data": self.sample_base64_audio,
                "is_anonymized": False,
                "retention_days": 7
            },
            "metadata": {
                "processing_time_ms": 50,
                "data_size_bytes": len(self.sample_audio_data)
            }
        }
        
        response = self.client.post('/api/interaction-logs', 
                                  json=payload,
                                  headers={'Content-Type': 'application/json'})
        
        self.assertEqual(response.status_code, 201)
        
        # Verify GCS upload was called
        mock_gcs_upload.assert_called_once()
        
        # Verify media data
        log = InteractionLog.query.filter_by(session_id=self.test_session_id).first()
        media_data = InteractionMediaData.query.filter_by(interaction_log_id=log.id).first()
        
        self.assertIsNotNone(media_data)
        self.assertEqual(media_data.storage_type, 'cloud_storage')
        self.assertEqual(media_data.cloud_storage_url, 'https://storage.googleapis.com/test/audio.pcm')
        self.assertEqual(media_data.data_hash, hashlib.sha256(self.sample_audio_data).hexdigest())
    
    @patch('app.services.storage.GCSStorageService.upload_file')
    def test_api_response_json_parsing(self, mock_gcs_upload):
        """Test API response with embedded JSON base64 data"""
        mock_gcs_upload.return_value = ('https://storage.googleapis.com/test/response.pcm', 'audio/pcm')
        
        payload = {
            "session_id": self.test_session_id,
            "interaction_type": "api_response",
            "media_data": {
                "storage_type": "cloud_storage",
                "data": self.sample_api_response_json,
                "is_anonymized": False,
                "retention_days": 7
            }
        }
        
        response = self.client.post('/api/interaction-logs', 
                                  json=payload,
                                  headers={'Content-Type': 'application/json'})
        
        self.assertEqual(response.status_code, 201)
        
        # Verify JSON was parsed and base64 extracted
        mock_gcs_upload.assert_called_once()
        
        # Check that the correct data was uploaded (extracted from JSON)
        uploaded_data = mock_gcs_upload.call_args[0][0].read()
        mock_gcs_upload.call_args[0][0].seek(0)  # Reset for potential reuse
        
        self.assertEqual(uploaded_data, self.sample_audio_data)
    
    def test_hash_only_storage(self):
        """Test hash-only storage for privacy mode"""
        payload = {
            "session_id": self.test_session_id,
            "interaction_type": "video_frame",
            "media_data": {
                "storage_type": "hash_only",
                "data": self.sample_base64_audio,
                "is_anonymized": True,
                "retention_days": 1
            }
        }
        
        response = self.client.post('/api/interaction-logs', 
                                  json=payload,
                                  headers={'Content-Type': 'application/json'})
        
        self.assertEqual(response.status_code, 201)
        
        # Verify only hash is stored
        log = InteractionLog.query.filter_by(session_id=self.test_session_id).first()
        media_data = InteractionMediaData.query.filter_by(interaction_log_id=log.id).first()
        
        self.assertIsNotNone(media_data)
        self.assertEqual(media_data.storage_type, 'hash_only')
        self.assertIsNone(media_data.cloud_storage_url)
        self.assertIsNone(media_data.data_inline)
        self.assertEqual(media_data.data_hash, hashlib.sha256(self.sample_audio_data).hexdigest())
    
    @patch('app.services.storage.GCSStorageService.upload_file')
    def test_gcs_upload_failure_fallback(self, mock_gcs_upload):
        """Test fallback to hash-only when GCS upload fails"""
        mock_gcs_upload.side_effect = Exception("GCS upload failed")
        
        payload = {
            "session_id": self.test_session_id,
            "interaction_type": "audio_chunk",
            "media_data": {
                "storage_type": "cloud_storage",
                "data": self.sample_base64_audio,
                "is_anonymized": False,
                "retention_days": 7
            }
        }
        
        response = self.client.post('/api/interaction-logs', 
                                  json=payload,
                                  headers={'Content-Type': 'application/json'})
        
        self.assertEqual(response.status_code, 201)
        
        # Verify fallback to hash_only storage
        log = InteractionLog.query.filter_by(session_id=self.test_session_id).first()
        media_data = InteractionMediaData.query.filter_by(interaction_log_id=log.id).first()
        
        self.assertEqual(media_data.storage_type, 'hash_only')
        self.assertIsNotNone(media_data.data_hash)
    
    def test_invalid_base64_handling(self):
        """Test handling of base64 with missing padding (should auto-fix)"""
        response = self.client.post('/api/interaction-logs', 
            json={
                'session_id': 'test_session_123',
                'interaction_type': 'audio_chunk',
                'media_data': {
                    'storage_type': 'cloud_storage',
                    'data': 'VGVzdEF1ZGlv',  # Missing padding, but should be auto-fixed
                    'is_anonymized': False,
                    'retention_days': 7
                }
            })
        
        # Should succeed now that we auto-fix padding
        self.assertEqual(response.status_code, 201)
        data = response.get_json()
        self.assertIn('interaction_id', data)
        
    def test_truly_invalid_base64_handling(self):
        """Test handling of completely invalid base64 data"""
        response = self.client.post('/api/interaction-logs', 
            json={
                'session_id': 'test_session_123',
                'interaction_type': 'audio_chunk',
                'media_data': {
                    'storage_type': 'cloud_storage',
                    'data': 'Invalid!@#$%^&*()Characters',  # Truly invalid base64
                    'is_anonymized': False,
                    'retention_days': 7
                }
            })
        
        # Should fallback to text storage gracefully
        self.assertEqual(response.status_code, 201)  # Still succeeds with fallback
    
    def test_missing_required_fields(self):
        """Test validation of required fields"""
        # Missing session_id
        payload = {
            "interaction_type": "user_action"
        }
        
        response = self.client.post('/api/interaction-logs', 
                                  json=payload,
                                  headers={'Content-Type': 'application/json'})
        
        self.assertEqual(response.status_code, 400)
        self.assertIn("session_id and interaction_type are required", response.get_json()['error'])
        
        # Missing interaction_type
        payload = {
            "session_id": self.test_session_id
        }
        
        response = self.client.post('/api/interaction-logs', 
                                  json=payload,
                                  headers={'Content-Type': 'application/json'})
        
        self.assertEqual(response.status_code, 400)
        self.assertIn("session_id and interaction_type are required", response.get_json()['error'])
    
    def test_session_summary_update(self):
        """Test that session summary is updated correctly"""
        # Log multiple interactions
        for i, interaction_type in enumerate(self.test_interaction_types):
            payload = {
                "session_id": self.test_session_id,
                "interaction_type": interaction_type,
                "metadata": {
                    "processing_time_ms": 100 + i * 10,
                    "data_size_bytes": 1000 + i * 100
                }
            }
            
            response = self.client.post('/api/interaction-logs', 
                                      json=payload,
                                      headers={'Content-Type': 'application/json'})
            
            self.assertEqual(response.status_code, 201)
        
        # Verify session summary
        summary = InteractionSessionSummary.query.filter_by(session_id=self.test_session_id).first()
        self.assertIsNotNone(summary)
        self.assertEqual(summary.total_interactions, len(self.test_interaction_types))
    
    def test_file_extension_mapping(self):
        """Test that file extensions are correctly assigned based on interaction type"""
        test_cases = [
            ('audio_chunk', 'pcm'),
            ('video_frame', 'jpg'), 
            ('api_response', 'pcm'),  # JSON with audio data
            ('user_action', 'bin')
        ]
        
        with patch('app.services.storage.GCSStorageService.upload_file') as mock_gcs:
            mock_gcs.return_value = ('https://storage.googleapis.com/test/file', 'application/octet-stream')
            
            for interaction_type, expected_ext in test_cases:
                payload = {
                    "session_id": f"{self.test_session_id}_{interaction_type}",
                    "interaction_type": interaction_type,
                    "media_data": {
                        "storage_type": "cloud_storage",
                        "data": self.sample_base64_audio if interaction_type != 'api_response' else self.sample_api_response_json,
                        "is_anonymized": False,
                        "retention_days": 7
                    }
                }
                
                response = self.client.post('/api/interaction-logs', 
                                          json=payload,
                                          headers={'Content-Type': 'application/json'})
                
                self.assertEqual(response.status_code, 201)
                
                # Check that the filename contains the expected extension
                call_args = mock_gcs.call_args
                filename = call_args[1]['filename'] if len(call_args) > 1 and 'filename' in call_args[1] else call_args[0][0].name
                self.assertTrue(filename.endswith(f'.{expected_ext}'), 
                               f"Expected {expected_ext} extension for {interaction_type}, got {filename}")


if __name__ == '__main__':
    unittest.main() 