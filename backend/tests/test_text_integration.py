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


class TestTextIntegration(unittest.TestCase):
    """Integration test for complete text logging and replay workflow"""
    
    def setUp(self):
        """Set up test environment"""
        self.app = create_app('testing')
        self.app_context = self.app.app_context()
        self.app_context.push()
        
        self.client = self.app.test_client()
        
        # Create all tables
        db.create_all()
        
        # Test data simulating a real session
        self.test_session_id = "integration_test_session_123"
        self.test_user_text = "Hello, can you help me with my Python project?"
        self.test_api_response = "Of course! I'd be happy to help you with your Python project. What specific aspects are you working on?"
    
    def tearDown(self):
        """Clean up test environment"""
        db.session.remove()
        db.drop_all()
        self.app_context.pop()
    
    @patch('requests.get')
    def test_complete_text_workflow_simulation(self, mock_requests_get):
        """Test the complete text workflow simulating how frontend logging and replay works"""
        
        print("\n🔍 INTEGRATION TEST: Complete Text Workflow Simulation")
        
        # Step 1: Simulate backend receiving and storing text data (what the POST endpoint does)
        print("\n🔍 STEP 1: Simulating backend text storage...")
        
        # Create text input log (simulating what interactionLogger.logTextInput() creates)
        text_input_log = InteractionLog(
            session_id=self.test_session_id,
            interaction_type="text_input",
            timestamp=datetime.utcnow()
        )
        db.session.add(text_input_log)
        db.session.flush()
        
        # Create text input metadata (simulating frontend metadata)
        text_input_metadata = InteractionMetadata(
            interaction_log_id=text_input_log.id,
            data_size_bytes=len(self.test_user_text),
            is_connected=True,
            camera_on=False,
            custom_metadata={
                'input_type': 'client_content',
                'message_length': len(self.test_user_text)
            }
        )
        db.session.add(text_input_metadata)
        
        # Create text input media data (simulating GCS upload result)
        text_input_media = InteractionMediaData(
            interaction_log_id=text_input_log.id,
            storage_type="cloud_storage",
            cloud_storage_url=f"https://storage.googleapis.com/test-bucket/interactions_20250604_092501_test_text_input_{text_input_log.id}.txt"
        )
        db.session.add(text_input_media)
        
        # Create API response log (simulating what interactionLogger.logApiResponse() creates)
        api_response_log = InteractionLog(
            session_id=self.test_session_id,
            interaction_type="api_response",
            timestamp=datetime.utcnow()
        )
        db.session.add(api_response_log)
        db.session.flush()
        
        # Create API response metadata
        api_response_metadata = InteractionMetadata(
            interaction_log_id=api_response_log.id,
            api_endpoint='gemini_live_api',
            api_response_time_ms=250,
            api_status_code=200,
            data_size_bytes=len(self.test_api_response),
            custom_metadata={
                'response_type': 'text',
                'response_length': len(self.test_api_response)
            }
        )
        db.session.add(api_response_metadata)
        
        # Create API response media data (simulating GCS upload result)
        api_response_media = InteractionMediaData(
            interaction_log_id=api_response_log.id,
            storage_type="cloud_storage",
            cloud_storage_url=f"https://storage.googleapis.com/test-bucket/interactions_20250604_092501_test_api_response_{api_response_log.id}.txt"
        )
        db.session.add(api_response_media)
        
        db.session.commit()
        
        print(f"✅ Text input log created: ID {text_input_log.id}")
        print(f"✅ API response log created: ID {api_response_log.id}")
        print(f"✅ Text input stored to: {text_input_media.cloud_storage_url}")
        print(f"✅ API response stored to: {api_response_media.cloud_storage_url}")
        
        # Step 2: Simulate frontend retrieving session data (what InteractionReplay.js does)
        print("\n🔍 STEP 2: Simulating frontend session retrieval...")
        
        session_response = self.client.get(f'/api/interaction-logs/{self.test_session_id}')
        self.assertEqual(session_response.status_code, 200)
        session_data = session_response.get_json()
        
        # Verify session contains both interactions
        interactions = session_data['logs']
        self.assertEqual(len(interactions), 2)
        
        # Find text input and API response
        text_interaction = next((i for i in interactions if i['interaction_type'] == 'text_input'), None)
        api_interaction = next((i for i in interactions if i['interaction_type'] == 'api_response'), None)
        
        self.assertIsNotNone(text_interaction)
        self.assertIsNotNone(api_interaction)
        print(f"✅ Session retrieved with {len(interactions)} interactions")
        print(f"   - Text input interaction: {text_interaction['id']}")
        print(f"   - API response interaction: {api_interaction['id']}")
        
        # Step 3: Mock GCS responses for content retrieval (what happens during replay)
        print("\n🔍 STEP 3: Simulating frontend content retrieval during replay...")
        
        # Mock GCS responses for both text files
        def mock_gcs_get(url, *args, **kwargs):
            mock_response = MagicMock()
            mock_response.status_code = 200
            if 'text_input' in url:
                mock_response.content = self.test_user_text.encode('utf-8')
                print(f"   📥 GCS Mock: Returning user text for {url}")
            elif 'api_response' in url:
                mock_response.content = self.test_api_response.encode('utf-8')
                print(f"   📥 GCS Mock: Returning API response for {url}")
            else:
                mock_response.status_code = 404
                print(f"   📥 GCS Mock: 404 for {url}")
            return mock_response
        
        mock_requests_get.side_effect = mock_gcs_get
        
        # Step 4: Test media proxy endpoints (what playTextSegment/playApiResponseSegment calls)
        print("\n🔍 STEP 4: Testing media proxy retrieval (frontend replay calls)...")
        
        # Test text input retrieval (what playTextSegment() does)
        text_proxy_response = self.client.get(f'/api/interaction-logs/media/{text_input_log.id}')
        self.assertEqual(text_proxy_response.status_code, 200)
        self.assertEqual(text_proxy_response.headers.get('Content-Type'), 'text/plain; charset=utf-8')
        self.assertEqual(text_proxy_response.data.decode('utf-8'), self.test_user_text)
        print(f"✅ Text input retrieved via proxy: '{self.test_user_text[:50]}{'...' if len(self.test_user_text) > 50 else ''}'")
        print(f"   Content-Type: {text_proxy_response.headers.get('Content-Type')}")
        
        # Test API response retrieval (what playApiResponseSegment() does)
        api_proxy_response = self.client.get(f'/api/interaction-logs/media/{api_response_log.id}')
        self.assertEqual(api_proxy_response.status_code, 200)
        self.assertEqual(api_proxy_response.headers.get('Content-Type'), 'text/plain; charset=utf-8')
        self.assertEqual(api_proxy_response.data.decode('utf-8'), self.test_api_response)
        print(f"✅ API response retrieved via proxy: '{self.test_api_response[:50]}{'...' if len(self.test_api_response) > 50 else ''}'")
        print(f"   Content-Type: {api_proxy_response.headers.get('Content-Type')}")
        
        # Step 5: Verify the complete workflow
        print("\n🔍 STEP 5: Final verification...")
        
        # Verify GCS was called for retrievals
        self.assertEqual(mock_requests_get.call_count, 2)  # Two proxy retrievals
        print(f"✅ GCS retrieval called {mock_requests_get.call_count} times")
        
        print("\n🎉 COMPLETE TEXT WORKFLOW TEST PASSED!")
        print("✅ Frontend logging workflow: Text is stored to GCS with .txt extension")
        print("✅ Frontend replay workflow: Text is retrieved with correct content-type")
        print("✅ Backend content-type fix: text_input → 'text/plain; charset=utf-8'")
        print("✅ Backend content-type fix: api_response with .txt → 'text/plain; charset=utf-8'")
        print("✅ End-to-end compatibility: Frontend can replay actual text content")

    def test_session_with_mixed_content(self):
        """Test a session with mixed text and audio content"""
        print("\n🔍 Testing mixed content session simulation...")
        
        # Create a text input log
        text_log = InteractionLog(
            session_id=self.test_session_id,
            interaction_type="text_input"
        )
        db.session.add(text_log)
        db.session.flush()
        
        text_media = InteractionMediaData(
            interaction_log_id=text_log.id,
            storage_type="cloud_storage",
            cloud_storage_url=f"https://storage.googleapis.com/test/text_input_{text_log.id}.txt"
        )
        db.session.add(text_media)
        
        # Create an audio response log
        audio_log = InteractionLog(
            session_id=self.test_session_id,
            interaction_type="api_response"
        )
        db.session.add(audio_log)
        db.session.flush()
        
        audio_media = InteractionMediaData(
            interaction_log_id=audio_log.id,
            storage_type="cloud_storage",
            cloud_storage_url=f"https://storage.googleapis.com/test/api_response_{audio_log.id}.pcm"
        )
        db.session.add(audio_media)
        
        # Create a text API response log
        text_api_log = InteractionLog(
            session_id=self.test_session_id,
            interaction_type="api_response"
        )
        db.session.add(text_api_log)
        db.session.flush()
        
        text_api_media = InteractionMediaData(
            interaction_log_id=text_api_log.id,
            storage_type="cloud_storage",
            cloud_storage_url=f"https://storage.googleapis.com/test/api_response_{text_api_log.id}.txt"
        )
        db.session.add(text_api_media)
        
        db.session.commit()
        
        # Test content-type detection
        with patch('requests.get') as mock_get:
            # Mock text response
            mock_text_response = MagicMock()
            mock_text_response.status_code = 200
            mock_text_response.content = self.test_user_text.encode('utf-8')
            
            # Mock audio response
            mock_audio_response = MagicMock()
            mock_audio_response.status_code = 200
            mock_audio_response.content = b'\x00\x01\x02\x03' * 100  # Fake audio data
            
            def mock_get_side_effect(url, *args, **kwargs):
                if '.txt' in url:
                    return mock_text_response
                elif '.pcm' in url:
                    return mock_audio_response
                return MagicMock(status_code=404)
            
            mock_get.side_effect = mock_get_side_effect
            
            # Test text input proxy
            text_response = self.client.get(f'/api/interaction-logs/media/{text_log.id}')
            self.assertEqual(text_response.status_code, 200)
            self.assertEqual(text_response.headers.get('Content-Type'), 'text/plain; charset=utf-8')
            
            # Test audio response proxy
            audio_response = self.client.get(f'/api/interaction-logs/media/{audio_log.id}')
            self.assertEqual(audio_response.status_code, 200)
            self.assertEqual(audio_response.headers.get('Content-Type'), 'audio/pcm')
            
            # Test text API response proxy
            text_api_response = self.client.get(f'/api/interaction-logs/media/{text_api_log.id}')
            self.assertEqual(text_api_response.status_code, 200)
            self.assertEqual(text_api_response.headers.get('Content-Type'), 'text/plain; charset=utf-8')
            
        print("✅ Mixed content session handles different content types correctly")


if __name__ == '__main__':
    unittest.main() 