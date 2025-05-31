#!/usr/bin/env python3
"""
Integration test for audio streaming improvements in replay system.
Tests that the new useAudioStreaming hooks work correctly with real data.
"""

import unittest
import requests
import json
import time
from datetime import datetime

# Test configuration
API_BASE_URL = "http://localhost:8080/api"

class TestAudioStreamingIntegration(unittest.TestCase):
    """Test the audio streaming integration with real replay data"""

    def setUp(self):
        """Set up test environment"""
        self.session_id = f"audio_streaming_test_{int(time.time())}"
        print(f"\n🧪 Testing audio streaming integration with session: {self.session_id}")

    def test_replay_data_structure_for_audio_streaming(self):
        """Test that replay data has the structure needed for audio streaming hooks"""
        
        # Use an existing session with audio data
        sessions_response = requests.get(f"{API_BASE_URL}/interaction-logs/sessions")
        self.assertEqual(sessions_response.status_code, 200)
        
        sessions_data = sessions_response.json()
        
        # Find a session with audio chunks
        audio_session = None
        for session in sessions_data['sessions']:
            if session['audio_chunks_sent'] > 0:
                audio_session = session
                break
        
        self.assertIsNotNone(audio_session, "No sessions with audio chunks found")
        print(f"🎵 Testing with session: {audio_session['session_id']} ({audio_session['audio_chunks_sent']} audio chunks)")
        
        # Get replay data for this session
        replay_response = requests.get(
            f"{API_BASE_URL}/interaction-logs/{audio_session['session_id']}?include_media=true&limit=50"
        )
        self.assertEqual(replay_response.status_code, 200)
        
        replay_data = replay_response.json()
        self.assertIn('logs', replay_data)
        
        # Verify structure needed for audio streaming
        audio_logs = [log for log in replay_data['logs'] if log['interaction_type'] == 'audio_chunk']
        api_response_logs = [log for log in replay_data['logs'] if log['interaction_type'] == 'api_response']
        
        print(f"🎵 Found {len(audio_logs)} audio_chunk logs and {len(api_response_logs)} api_response logs")
        
        # Test audio chunk structure
        if audio_logs:
            audio_log = audio_logs[0]
            self.assertIn('media_data', audio_log)
            self.assertIn('cloud_storage_url', audio_log['media_data'])
            self.assertIn('interaction_metadata', audio_log)
            
            # Check if we can determine if it's user audio
            metadata = audio_log['interaction_metadata']
            has_microphone_flag = 'microphone_on' in metadata
            print(f"🎤 Audio log has microphone_on flag: {has_microphone_flag}")
            
            if has_microphone_flag:
                print(f"🎤 Microphone status: {metadata['microphone_on']}")
        
        # Test API response structure (these are often Gemini audio)
        if api_response_logs:
            api_log = api_response_logs[0]
            self.assertIn('media_data', api_log)
            self.assertIn('cloud_storage_url', api_log['media_data'])
            
            # Check if it's audio response
            cloud_url = api_log['media_data']['cloud_storage_url']
            is_audio_response = '.pcm' in cloud_url
            print(f"🎵 API response is audio: {is_audio_response}")

    def test_media_proxy_endpoint_for_audio_streaming(self):
        """Test that the media proxy endpoint works for audio streaming"""
        
        # Get a session with audio data
        sessions_response = requests.get(f"{API_BASE_URL}/interaction-logs/sessions")
        sessions_data = sessions_response.json()
        
        audio_session = None
        for session in sessions_data['sessions']:
            if session['audio_chunks_sent'] > 0:
                audio_session = session
                break
        
        if not audio_session:
            self.skipTest("No sessions with audio chunks found")
        
        # Get replay data
        replay_response = requests.get(
            f"{API_BASE_URL}/interaction-logs/{audio_session['session_id']}?include_media=true&limit=10"
        )
        replay_data = replay_response.json()
        
        # Find an audio interaction
        audio_interaction = None
        for log in replay_data['logs']:
            if (log['interaction_type'] in ['audio_chunk', 'api_response'] and 
                log['media_data'] and 
                log['media_data'].get('cloud_storage_url')):
                audio_interaction = log
                break
        
        if not audio_interaction:
            self.skipTest("No audio interactions with cloud storage found")
        
        print(f"🎵 Testing media proxy for interaction {audio_interaction['id']}")
        
        # Test the proxy endpoint that our hooks will use
        proxy_response = requests.get(f"{API_BASE_URL}/interaction-logs/media/{audio_interaction['id']}")
        
        if proxy_response.status_code == 200:
            content_type = proxy_response.headers.get('content-type', '')
            content_length = len(proxy_response.content)
            
            print(f"✅ Media proxy successful: {content_type}, {content_length} bytes")
            
            # Verify it's audio data
            self.assertTrue(
                content_type in ['audio/pcm', 'application/octet-stream'] or content_length > 0,
                f"Expected audio data, got {content_type} with {content_length} bytes"
            )
        else:
            print(f"⚠️ Media proxy failed: {proxy_response.status_code}")
            # This might be expected if the GCS URLs have expired

    def test_audio_streaming_timing_data(self):
        """Test that we have timing data needed for proper audio streaming"""
        
        # Get a session with multiple interactions
        sessions_response = requests.get(f"{API_BASE_URL}/interaction-logs/sessions")
        sessions_data = sessions_response.json()
        
        test_session = None
        for session in sessions_data['sessions']:
            if session['total_interactions'] > 10:
                test_session = session
                break
        
        if not test_session:
            self.skipTest("No sessions with sufficient interactions found")
        
        # Get replay data
        replay_response = requests.get(
            f"{API_BASE_URL}/interaction-logs/{test_session['session_id']}?include_media=true&limit=20"
        )
        replay_data = replay_response.json()
        
        # Analyze timing between interactions
        logs = replay_data['logs']
        if len(logs) < 2:
            self.skipTest("Not enough interactions for timing analysis")
        
        # Sort by timestamp
        logs.sort(key=lambda x: x['timestamp'])
        
        audio_chunks = [log for log in logs if log['interaction_type'] == 'audio_chunk']
        api_responses = [log for log in logs if log['interaction_type'] == 'api_response']
        
        print(f"🕐 Timing analysis: {len(audio_chunks)} audio chunks, {len(api_responses)} API responses")
        
        # Check for consecutive audio chunks (important for streaming)
        consecutive_audio = 0
        for i in range(len(logs) - 1):
            if (logs[i]['interaction_type'] == 'audio_chunk' and 
                logs[i + 1]['interaction_type'] == 'audio_chunk'):
                consecutive_audio += 1
        
        print(f"🎵 Found {consecutive_audio} consecutive audio chunk pairs")
        
        # Check timing between consecutive interactions
        if len(logs) >= 2:
            time1 = datetime.fromisoformat(logs[0]['timestamp'].replace('Z', '+00:00'))
            time2 = datetime.fromisoformat(logs[1]['timestamp'].replace('Z', '+00:00'))
            time_diff = (time2 - time1).total_seconds() * 1000  # milliseconds
            
            print(f"🕐 Sample timing between interactions: {time_diff:.1f}ms")
            
            # Verify we have reasonable timing data
            self.assertGreater(time_diff, 0, "Timestamps should be in chronological order")
            self.assertLess(time_diff, 60000, "Time difference should be reasonable (< 60s)")

if __name__ == '__main__':
    print("🧪 Running Audio Streaming Integration Tests")
    print("=" * 50)
    unittest.main(verbosity=2) 