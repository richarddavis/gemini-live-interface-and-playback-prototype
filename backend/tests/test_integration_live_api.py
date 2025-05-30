#!/usr/bin/env python3
"""
Integration test to simulate the exact Gemini Live API interaction scenario
that was causing 400 errors in the frontend.
"""

import unittest
import json
import base64
import requests
import time
import sys
import os

# Test configuration
API_BASE_URL = "http://localhost:5000/api"
TEST_SESSION_ID = f"integration_test_{int(time.time())}"

class TestGeminiLiveIntegration(unittest.TestCase):
    """Integration test for Gemini Live API interaction logging"""
    
    def setUp(self):
        """Set up test session"""
        self.session_id = TEST_SESSION_ID
        
    def test_live_audio_video_interaction_flow(self):
        """Test the complete live audio/video interaction flow that was failing"""
        
        print(f"\n🧪 Testing complete live interaction flow with session: {self.session_id}")
        
        # 1. Test session start with user_action (microphone start)
        user_action_data = {
            "session_id": self.session_id,
            "interaction_type": "user_action",
            "media_data": {
                "storage_type": "cloud_storage",
                "data": "",  # Empty for user actions like mic toggle
                "is_anonymized": False,
                "retention_days": 7
            },
            "metadata": {
                "processing_time_ms": 5,
                "data_size_bytes": 0
            }
        }
        
        response = requests.post(f"{API_BASE_URL}/interaction-logs", json=user_action_data)
        print(f"📱 User action logged: {response.status_code}")
        self.assertEqual(response.status_code, 201)
        
        # 2. Test audio chunk logging (simulating real audio data)
        audio_chunk_data = {
            "session_id": self.session_id,
            "interaction_type": "audio_chunk",
            "media_data": {
                "storage_type": "cloud_storage",
                "data": base64.b64encode(b"Real audio chunk data here" * 100).decode('utf-8'),
                "is_anonymized": False,
                "retention_days": 7
            },
            "metadata": {
                "processing_time_ms": 25,
                "data_size_bytes": 2400
            }
        }
        
        response = requests.post(f"{API_BASE_URL}/interaction-logs", json=audio_chunk_data)
        print(f"🎵 Audio chunk logged: {response.status_code}")
        self.assertEqual(response.status_code, 201)
        
        # 3. Test video frame logging
        video_frame_data = {
            "session_id": self.session_id,
            "interaction_type": "video_frame",
            "media_data": {
                "storage_type": "cloud_storage",
                "data": base64.b64encode(b"Fake JPEG frame data" * 200).decode('utf-8'),
                "is_anonymized": False,
                "retention_days": 7
            },
            "metadata": {
                "processing_time_ms": 15,
                "data_size_bytes": 3800
            }
        }
        
        response = requests.post(f"{API_BASE_URL}/interaction-logs", json=video_frame_data)
        print(f"📹 Video frame logged: {response.status_code}")
        self.assertEqual(response.status_code, 201)
        
        # 4. Test API response with embedded JSON (the problematic case)
        api_response_data = {
            "session_id": self.session_id,
            "interaction_type": "api_response",
            "media_data": {
                "storage_type": "cloud_storage",
                "data": json.dumps({
                    "mimeType": "audio/pcm;rate=24000",
                    "data": base64.b64encode(b"Response audio data from Gemini").decode('utf-8')
                }),
                "is_anonymized": False,
                "retention_days": 7
            },
            "metadata": {
                "processing_time_ms": 120,
                "data_size_bytes": 1500
            }
        }
        
        response = requests.post(f"{API_BASE_URL}/interaction-logs", json=api_response_data)
        print(f"🤖 API response logged: {response.status_code}")
        self.assertEqual(response.status_code, 201)
        
        # 5. Test session end
        session_end_data = {
            "session_id": self.session_id,
            "interaction_type": "user_action",
            "media_data": {
                "storage_type": "hash_only",  # Privacy mode for session end
                "data": "session_end",
                "is_anonymized": True,
                "retention_days": 1
            },
            "metadata": {
                "processing_time_ms": 2,
                "data_size_bytes": 0
            }
        }
        
        response = requests.post(f"{API_BASE_URL}/interaction-logs", json=session_end_data)
        print(f"🔚 Session end logged: {response.status_code}")
        self.assertEqual(response.status_code, 201)
        
        print(f"✅ Complete live interaction flow test PASSED")
        
    def test_rapid_interaction_logging(self):
        """Test rapid successive interactions like in real live sessions"""
        
        print(f"\n⚡ Testing rapid interaction logging")
        
        for i in range(5):
            interaction_data = {
                "session_id": f"{self.session_id}_rapid",
                "interaction_type": "audio_chunk",
                "media_data": {
                    "storage_type": "cloud_storage",
                    "data": base64.b64encode(f"Audio chunk {i}".encode()).decode('utf-8'),
                    "is_anonymized": False,
                    "retention_days": 7
                },
                "metadata": {
                    "processing_time_ms": 10 + i,
                    "data_size_bytes": 100 + i * 10
                }
            }
            
            response = requests.post(f"{API_BASE_URL}/interaction-logs", json=interaction_data)
            print(f"  🎵 Rapid chunk {i}: {response.status_code}")
            self.assertEqual(response.status_code, 201)
            
        print(f"✅ Rapid interaction logging test PASSED")

if __name__ == "__main__":
    # Check if API is available
    try:
        response = requests.get(f"{API_BASE_URL}/health", timeout=5)
        print(f"🌐 API health check: {response.status_code}")
    except Exception as e:
        print(f"❌ API not available: {e}")
        sys.exit(1)
    
    # Run tests
    unittest.main(verbosity=2) 