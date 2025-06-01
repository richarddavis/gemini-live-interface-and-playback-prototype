#!/usr/bin/env python3
"""
Debug script to check what's happening with our backend timestamp changes.
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from datetime import datetime
import requests

def debug_backend_endpoint():
    """Test the backend endpoint directly"""
    api_url = 'http://localhost:8080/api'
    
    print("🔍 DEBUGGING BACKEND TIMESTAMP HANDLING")
    print("=" * 50)
    
    # Test 1: Check if server is responding
    try:
        response = requests.get(f"{api_url}/health")
        if response.ok:
            print("✅ Backend server is responding")
        else:
            print(f"❌ Backend health check failed: {response.status_code}")
            return
    except Exception as e:
        print(f"❌ Cannot connect to backend: {e}")
        return
    
    # Test 2: Create a single test log with known timestamp
    test_timestamp = "2025-06-01T12:00:00.000Z"
    session_id = "debug_timestamp_test"
    
    payload = {
        "session_id": session_id,
        "interaction_type": "audio_chunk",
        "metadata": {
            "timestamp": test_timestamp,
            "audio_sample_rate": 16000,
            "microphone_on": True
        }
    }
    
    print(f"\n📤 Sending test log with timestamp: {test_timestamp}")
    
    try:
        response = requests.post(f"{api_url}/interaction-logs", 
                               json=payload,
                               headers={'Content-Type': 'application/json'})
        
        if response.ok:
            result = response.json()
            interaction_id = result.get("interaction_id")
            print(f"✅ Created log with ID: {interaction_id}")
        else:
            print(f"❌ Failed to create log: {response.status_code}")
            print(f"Response: {response.text}")
            return
    except Exception as e:
        print(f"❌ Error creating log: {e}")
        return
    
    # Test 3: Retrieve the log and check timestamp
    print(f"\n📥 Retrieving logs for session: {session_id}")
    
    try:
        response = requests.get(f"{api_url}/interaction-logs/{session_id}?include_media=true")
        
        if response.ok:
            data = response.json()
            logs = data.get('logs', [])
            
            if logs:
                log = logs[0]
                stored_timestamp = log.get('timestamp')
                metadata = log.get('interaction_metadata', {})
                
                print(f"📊 RESULTS:")
                print(f"  📤 Sent timestamp:     {test_timestamp}")
                print(f"  📥 Stored timestamp:   {stored_timestamp}")
                print(f"  🔄 Timestamps match:   {'✅' if stored_timestamp == test_timestamp else '❌'}")
                print(f"  📋 Metadata saved:     {'✅' if metadata else '❌'}")
                
                if metadata:
                    print(f"  🎵 Sample rate:        {metadata.get('audio_sample_rate', 'NOT FOUND')}")
                    print(f"  🎤 Microphone on:      {metadata.get('microphone_on', 'NOT FOUND')}")
                    print(f"  📋 Metadata available: ✅")
                else:
                    print(f"  ❌ No metadata found for this log")
                
                # Test the sorting issue
                if stored_timestamp != test_timestamp:
                    print(f"\n🚨 TIMESTAMP MISMATCH DETECTED!")
                    print(f"   This explains why ordering is wrong - backend isn't using frontend timestamps")
                else:
                    print(f"\n✅ Timestamp preservation is working")
                    
            else:
                print(f"❌ No logs retrieved")
        else:
            print(f"❌ Failed to retrieve logs: {response.status_code}")
            
    except Exception as e:
        print(f"❌ Error retrieving logs: {e}")

    # Test 4: Check ordering with multiple logs
    print(f"\n🔄 Testing ordering with multiple logs...")
    
    session_id_multi = "debug_ordering_test"
    
    # Create 3 logs with specific timestamps  
    test_timestamps = [
        "2025-06-01T12:00:01.000Z",
        "2025-06-01T12:00:02.000Z", 
        "2025-06-01T12:00:03.000Z"
    ]
    
    for i, ts in enumerate(test_timestamps):
        payload = {
            "session_id": session_id_multi,
            "interaction_type": "audio_chunk",
            "metadata": {
                "timestamp": ts,
                "test_index": i,
                "audio_sample_rate": 16000
            }
        }
        
        try:
            response = requests.post(f"{api_url}/interaction-logs", 
                                   json=payload,
                                   headers={'Content-Type': 'application/json'})
            if response.ok:
                result = response.json()
                print(f"  ✅ Log {i}: ID {result.get('interaction_id')} at {ts}")
            else:
                print(f"  ❌ Log {i}: Failed with {response.status_code}")
        except Exception as e:
            print(f"  ❌ Log {i}: Error {e}")
    
    # Retrieve and check order
    try:
        response = requests.get(f"{api_url}/interaction-logs/{session_id_multi}?include_media=true")
        
        if response.ok:
            data = response.json()
            logs = data.get('logs', [])
            
            print(f"\n📊 Retrieved {len(logs)} logs:")
            for i, log in enumerate(logs):
                timestamp = log.get('timestamp')
                metadata = log.get('interaction_metadata', {})
                test_index = metadata.get('test_index', -1)
                print(f"  Position {i}: timestamp={timestamp}, test_index={test_index}")
            
            # Check if in chronological order
            timestamps = [log.get('timestamp') for log in logs]
            sorted_timestamps = sorted(timestamps)
            
            if timestamps == sorted_timestamps:
                print(f"✅ Logs are in chronological order!")
            else:
                print(f"❌ Logs are NOT in chronological order!")
                print(f"   Actual:   {timestamps}")
                print(f"   Expected: {sorted_timestamps}")
                
    except Exception as e:
        print(f"❌ Error retrieving multi-logs: {e}")

if __name__ == '__main__':
    debug_backend_endpoint() 