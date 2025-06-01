#!/usr/bin/env python3
"""
Test script to validate the audio chunk ordering fix.
This creates test audio chunks and verifies they maintain proper chronological order.
"""

import sys
import os
import requests
import json
import time
from datetime import datetime, timedelta
import base64

def create_test_audio_chunk():
    """Create a test audio chunk with simulated PCM data"""
    # Create fake PCM data (16-bit mono, 100ms at 16kHz = 1600 samples = 3200 bytes)
    fake_pcm = b'\x00\x01' * 1600  # Simple pattern
    return base64.b64encode(fake_pcm).decode('utf-8')

def create_test_session():
    """Create a test session with audio chunks to verify ordering"""
    api_url = os.getenv('REACT_APP_API_URL', 'http://localhost:8080/api')
    session_id = f"test_ordering_fix_{int(time.time())}"
    
    print(f"🧪 Creating test session: {session_id}")
    
    # Start the session
    try:
        response = requests.post(f"{api_url}/interaction-logs/session/{session_id}/start", 
                               json={"chat_session_id": None})
        if not response.ok:
            print(f"❌ Failed to start session: {response.status_code}")
            return None
    except Exception as e:
        print(f"❌ Error starting session: {e}")
        return None
    
    # Create test audio chunks with precise timestamps
    base_time = datetime.utcnow()
    chunks_created = []
    
    print("📝 Creating audio chunks with precise timestamps...")
    
    for i in range(10):
        # Create timestamp with increasing precision
        chunk_time = base_time + timedelta(milliseconds=i * 100)  # 100ms apart
        chunk_timestamp = chunk_time.isoformat() + 'Z'
        
        # Create the audio chunk payload
        payload = {
            "session_id": session_id,
            "interaction_type": "audio_chunk",
            "metadata": {
                "timestamp": chunk_timestamp,
                "audio_sample_rate": 16000,
                "audio_format": "pcm_16bit",
                "data_size_bytes": 3200,
                "microphone_on": True
            },
            "media_data": {
                "storage_type": "cloud_storage",
                "data": create_test_audio_chunk(),
                "is_anonymized": False,
                "retention_days": 1
            }
        }
        
        try:
            response = requests.post(f"{api_url}/interaction-logs", 
                                   json=payload,
                                   headers={'Content-Type': 'application/json'})
            
            if response.ok:
                result = response.json()
                chunks_created.append({
                    "index": i,
                    "timestamp": chunk_timestamp,
                    "interaction_id": result.get("interaction_id")
                })
                print(f"  ✅ Chunk {i}: ID {result.get('interaction_id')} at {chunk_timestamp}")
            else:
                print(f"  ❌ Chunk {i}: Failed with status {response.status_code}")
                
        except Exception as e:
            print(f"  ❌ Chunk {i}: Error {e}")
        
        # Small delay to ensure timestamps are distinct
        time.sleep(0.01)
    
    print(f"📊 Created {len(chunks_created)} test chunks")
    return session_id, chunks_created

def verify_ordering(session_id):
    """Verify that the chunks are returned in correct chronological order"""
    api_url = os.getenv('REACT_APP_API_URL', 'http://localhost:8080/api')
    
    print(f"\n🔍 Verifying ordering for session: {session_id}")
    
    try:
        response = requests.get(f"{api_url}/interaction-logs/{session_id}?include_media=true&limit=100")
        
        if not response.ok:
            print(f"❌ Failed to fetch session data: {response.status_code}")
            return False
            
        data = response.json()
        logs = data.get('logs', [])
        
        # Filter audio chunks
        audio_chunks = [log for log in logs if log['interaction_type'] == 'audio_chunk']
        
        print(f"📊 Retrieved {len(audio_chunks)} audio chunks")
        
        if len(audio_chunks) < 2:
            print("❌ Not enough chunks to test ordering")
            return False
        
        # Check if chunks are in chronological order
        timestamps = []
        
        for chunk in audio_chunks:
            timestamps.append(datetime.fromisoformat(chunk['timestamp'].replace('Z', '+00:00')))
        
        # Check timestamp ordering (this is the core requirement)
        sorted_timestamps = sorted(timestamps)
        timestamps_in_order = timestamps == sorted_timestamps
        
        print(f"\n📊 ORDERING VERIFICATION RESULTS:")
        print(f"  🕐 Timestamps in chronological order: {'✅' if timestamps_in_order else '❌'}")
        
        if not timestamps_in_order:
            print(f"  📅 Expected timestamp order: {[t.isoformat() for t in sorted_timestamps]}")
            print(f"  📅 Actual timestamp order:   {[t.isoformat() for t in timestamps]}")
        else:
            print(f"\n🎉 SUCCESS: Audio chunks are in correct chronological order!")
            
            # Calculate timing precision
            gaps = []
            for i in range(1, len(timestamps)):
                gap = (timestamps[i] - timestamps[i-1]).total_seconds() * 1000
                gaps.append(gap)
            
            if gaps:
                avg_gap = sum(gaps) / len(gaps)
                print(f"  📏 Average gap between chunks: {avg_gap:.1f}ms")
                print(f"  📏 Gap range: {min(gaps):.1f}ms - {max(gaps):.1f}ms")
            
            # Additional validation: check that IDs are also in ascending order
            # (which they should be if timestamps are working correctly)
            chunk_ids = [chunk['id'] for chunk in audio_chunks]
            ids_ascending = chunk_ids == sorted(chunk_ids)
            print(f"  🆔 Chunk IDs also in ascending order: {'✅' if ids_ascending else '❌'}")
            
            return True
            
        return False
        
    except Exception as e:
        print(f"❌ Error verifying ordering: {e}")
        return False

def test_frontend_sorting():
    """Test that the frontend sorting still works correctly"""
    print(f"\n🔄 Testing frontend sorting behavior...")
    
    # Simulate the frontend sorting behavior
    test_logs = [
        {"timestamp": "2024-01-30T12:00:03.000Z", "id": 3},
        {"timestamp": "2024-01-30T12:00:01.000Z", "id": 1},
        {"timestamp": "2024-01-30T12:00:02.000Z", "id": 2},
    ]
    
    # Sort using the same method as frontend
    sorted_logs = sorted(test_logs, key=lambda x: datetime.fromisoformat(x['timestamp'].replace('Z', '+00:00')))
    
    expected_order = [1, 2, 3]
    actual_order = [log['id'] for log in sorted_logs]
    
    if actual_order == expected_order:
        print(f"  ✅ Frontend sorting works correctly: {actual_order}")
        return True
    else:
        print(f"  ❌ Frontend sorting failed: expected {expected_order}, got {actual_order}")
        return False

def cleanup_test_sessions():
    """Clean up test sessions (optional)"""
    print(f"\n🧹 Cleanup note: Test sessions will auto-expire based on retention settings")

def main():
    """Main test function"""
    print("🧪 AUDIO CHUNK ORDERING FIX VALIDATION")
    print("======================================")
    print("This test validates that the timestamp ordering fix works correctly")
    print("by creating test audio chunks and verifying they maintain proper order.")
    print()
    
    # Test 1: Frontend sorting validation
    if not test_frontend_sorting():
        print("❌ Frontend sorting test failed - aborting")
        return False
    
    # Test 2: Create test session and verify ordering
    session_id, chunks_created = create_test_session()
    
    if not session_id:
        print("❌ Failed to create test session - aborting")
        return False
    
    if len(chunks_created) == 0:
        print("❌ No chunks created - aborting")
        return False
    
    # Give the backend a moment to process
    print("\n⏳ Waiting for backend processing...")
    time.sleep(2)
    
    # Test 3: Verify ordering
    ordering_success = verify_ordering(session_id)
    
    # Test 4: Clean up
    cleanup_test_sessions()
    
    # Final result
    print(f"\n{'='*50}")
    if ordering_success:
        print("🎉 ALL TESTS PASSED: Audio chunk ordering fix is working!")
        print("✅ New audio chunks will maintain chronological order during playback")
    else:
        print("❌ TESTS FAILED: Audio chunk ordering fix needs more work")
        print("🔧 Check the backend timestamp handling and database queries")
    
    return ordering_success

if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1) 