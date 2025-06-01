#!/usr/bin/env python3
"""
Test script to analyze audio chunk ordering issues in the Gemini Live API playback.
This script checks for potential timing inconsistencies that could cause out-of-order playback.
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from datetime import datetime
import json
import requests
from collections import defaultdict

def analyze_session_timing(session_id):
    """Analyze timing patterns for a specific session"""
    print(f"\n🔍 ANALYZING SESSION: {session_id}")
    print("=" * 60)
    
    # Get session data from backend
    try:
        api_url = os.getenv('REACT_APP_API_URL', 'http://localhost:8080/api')
        response = requests.get(f"{api_url}/interaction-logs/{session_id}?include_media=true&limit=1000")
        
        if not response.ok:
            print(f"❌ Failed to fetch session data: {response.status_code}")
            return
            
        data = response.json()
        logs = data.get('logs', [])
        
        if not logs:
            print(f"❌ No logs found for session {session_id}")
            return
            
        print(f"📊 Found {len(logs)} total interactions")
        
    except Exception as e:
        print(f"❌ Error fetching session data: {e}")
        return
    
    # Filter and analyze audio chunks
    audio_chunks = []
    api_responses = []
    
    for log in logs:
        if log['interaction_type'] == 'audio_chunk':
            audio_chunks.append(log)
        elif log['interaction_type'] == 'api_response' and log.get('media_data'):
            # Check if this is an audio API response
            media_data = log.get('media_data', {})
            if (media_data.get('cloud_storage_url', '').endswith('.pcm') or 
                log.get('interaction_metadata', {}).get('response_type') == 'audio'):
                api_responses.append(log)
    
    print(f"🎵 Audio chunks: {len(audio_chunks)}")
    print(f"🤖 Audio API responses: {len(api_responses)}")
    
    # Analyze timing patterns
    analyze_audio_timing(audio_chunks, "User Audio Chunks")
    analyze_audio_timing(api_responses, "API Audio Responses")
    
    # Check for timestamp ordering issues
    check_timestamp_ordering(logs)
    
    # Analyze upload completion timing
    analyze_upload_timing(audio_chunks + api_responses)
    
    # Check frontend vs backend timing
    analyze_frontend_backend_timing(audio_chunks + api_responses)

def analyze_audio_timing(chunks, chunk_type):
    """Analyze timing patterns within audio chunks"""
    if not chunks:
        return
        
    print(f"\n🎵 {chunk_type} Analysis:")
    print("-" * 40)
    
    # Sort by timestamp
    sorted_chunks = sorted(chunks, key=lambda x: x['timestamp'])
    
    # Calculate gaps between chunks
    gaps = []
    for i in range(1, len(sorted_chunks)):
        prev_time = datetime.fromisoformat(sorted_chunks[i-1]['timestamp'].replace('Z', '+00:00'))
        curr_time = datetime.fromisoformat(sorted_chunks[i]['timestamp'].replace('Z', '+00:00'))
        gap_ms = (curr_time - prev_time).total_seconds() * 1000
        gaps.append(gap_ms)
    
    if gaps:
        avg_gap = sum(gaps) / len(gaps)
        min_gap = min(gaps)
        max_gap = max(gaps)
        
        print(f"  📏 Average gap: {avg_gap:.1f}ms")
        print(f"  📏 Min gap: {min_gap:.1f}ms") 
        print(f"  📏 Max gap: {max_gap:.1f}ms")
        
        # Check for suspiciously large gaps
        large_gaps = [gap for gap in gaps if gap > 1000]  # > 1 second
        if large_gaps:
            print(f"  ⚠️  {len(large_gaps)} gaps > 1 second: {[f'{g:.1f}ms' for g in large_gaps]}")
    
    # Check for out-of-order IDs vs timestamps
    check_id_timestamp_correlation(sorted_chunks, chunk_type)

def check_id_timestamp_correlation(chunks, chunk_type):
    """Check if database IDs correlate with timestamp order"""
    if len(chunks) < 2:
        return
        
    print(f"\n🔄 {chunk_type} ID/Timestamp Correlation:")
    
    # Sort by timestamp and check if IDs are also in order
    timestamp_sorted = sorted(chunks, key=lambda x: x['timestamp'])
    id_sorted = sorted(chunks, key=lambda x: x['id'])
    
    timestamp_ids = [chunk['id'] for chunk in timestamp_sorted]
    id_order_ids = [chunk['id'] for chunk in id_sorted]
    
    if timestamp_ids != id_order_ids:
        print(f"  ❌ ORDERING MISMATCH DETECTED!")
        print(f"  📅 Timestamp order IDs: {timestamp_ids[:10]}...") 
        print(f"  🆔 Database ID order:   {id_order_ids[:10]}...")
        
        # Find specific mismatches
        mismatches = []
        for i, (ts_id, db_id) in enumerate(zip(timestamp_ids, id_order_ids)):
            if ts_id != db_id:
                mismatches.append((i, ts_id, db_id))
        
        print(f"  🚨 {len(mismatches)} position mismatches found")
        if mismatches:
            print(f"  🚨 First few mismatches: {mismatches[:5]}")
    else:
        print(f"  ✅ IDs match timestamp order")

def check_timestamp_ordering(logs):
    """Check overall timestamp ordering"""
    print(f"\n🕐 Overall Timestamp Ordering Analysis:")
    print("-" * 40)
    
    # Check if logs are in chronological order
    timestamps = [datetime.fromisoformat(log['timestamp'].replace('Z', '+00:00')) for log in logs]
    sorted_timestamps = sorted(timestamps)
    
    if timestamps == sorted_timestamps:
        print("  ✅ All logs are in chronological order")
    else:
        print("  ❌ TIMESTAMP ORDERING ISSUES DETECTED!")
        
        # Find out-of-order entries
        out_of_order = 0
        for i, (actual, expected) in enumerate(zip(timestamps, sorted_timestamps)):
            if actual != expected:
                out_of_order += 1
        
        print(f"  🚨 {out_of_order} logs are out of chronological order")

def analyze_upload_timing(audio_logs):
    """Analyze upload completion timing vs initial log timing"""
    print(f"\n📤 Upload Timing Analysis:")
    print("-" * 40)
    
    pending_uploads = 0
    completed_uploads = 0
    failed_uploads = 0
    
    for log in audio_logs:
        media_data = log.get('media_data', {})
        storage_url = media_data.get('cloud_storage_url', '')
        
        if storage_url.startswith('pending_upload_'):
            pending_uploads += 1
        elif storage_url and ('googleapis.com' in storage_url or 'storage.cloud.google.com' in storage_url):
            completed_uploads += 1
        else:
            failed_uploads += 1
    
    total = len(audio_logs)
    print(f"  📤 Completed uploads: {completed_uploads}/{total} ({completed_uploads/total*100:.1f}%)")
    print(f"  ⏳ Pending uploads: {pending_uploads}/{total} ({pending_uploads/total*100:.1f}%)")
    print(f"  ❌ Failed uploads: {failed_uploads}/{total} ({failed_uploads/total*100:.1f}%)")
    
    if pending_uploads > 0:
        print(f"  ⚠️  WARNING: {pending_uploads} uploads still pending - this could affect playback order!")

def analyze_frontend_backend_timing(audio_logs):
    """Check for timing discrepancies between frontend and backend"""
    print(f"\n🔄 Frontend/Backend Timing Analysis:")
    print("-" * 40)
    
    timing_discrepancies = []
    
    for log in audio_logs:
        metadata = log.get('interaction_metadata', {})
        
        # Check for frontend timing metadata
        frontend_logged_at = metadata.get('frontend_logged_at')
        stream_processed_at = metadata.get('stream_processed_at')
        db_timestamp = log.get('timestamp')
        
        if frontend_logged_at and db_timestamp:
            try:
                frontend_time = datetime.fromisoformat(frontend_logged_at.replace('Z', '+00:00'))
                db_time = datetime.fromisoformat(db_timestamp.replace('Z', '+00:00'))
                diff_ms = (db_time - frontend_time).total_seconds() * 1000
                
                if abs(diff_ms) > 100:  # More than 100ms difference
                    timing_discrepancies.append({
                        'id': log['id'],
                        'diff_ms': diff_ms,
                        'frontend_time': frontend_logged_at,
                        'db_time': db_timestamp
                    })
            except:
                pass
    
    if timing_discrepancies:
        print(f"  ⚠️  {len(timing_discrepancies)} timing discrepancies > 100ms found")
        avg_diff = sum(d['diff_ms'] for d in timing_discrepancies) / len(timing_discrepancies)
        print(f"  📊 Average discrepancy: {avg_diff:.1f}ms")
        
        # Show worst cases
        worst_cases = sorted(timing_discrepancies, key=lambda x: abs(x['diff_ms']), reverse=True)[:5]
        print(f"  🚨 Worst timing discrepancies:")
        for case in worst_cases:
            print(f"    ID {case['id']}: {case['diff_ms']:.1f}ms difference")
    else:
        print(f"  ✅ No significant timing discrepancies detected")

def analyze_specific_session():
    """Analyze the specific session mentioned in the bug report"""
    session_id = "session_1748742349949_eqerrgm7k"
    print(f"🎯 ANALYZING SPECIFIC SESSION: {session_id}")
    analyze_session_timing(session_id)

def test_latest_sessions():
    """Test the latest sessions for ordering issues"""
    print(f"🔍 TESTING LATEST SESSIONS FOR ORDERING ISSUES")
    print("=" * 60)
    
    try:
        api_url = os.getenv('REACT_APP_API_URL', 'http://localhost:8080/api')
        response = requests.get(f"{api_url}/interaction-logs/sessions?limit=5")
        
        if not response.ok:
            print(f"❌ Failed to fetch sessions: {response.status_code}")
            return
            
        data = response.json()
        sessions = data.get('sessions', [])
        
        if not sessions:
            print(f"❌ No sessions found")
            return
        
        print(f"📊 Found {len(sessions)} recent sessions")
        
        for session in sessions:
            session_id = session['session_id']
            analyze_session_timing(session_id)
            print("\n" + "="*60)
            
    except Exception as e:
        print(f"❌ Error fetching recent sessions: {e}")

def main():
    """Main analysis function"""
    print("🎵 AUDIO CHUNK ORDERING ANALYSIS TOOL")
    print("====================================")
    print("This tool analyzes potential audio chunk ordering issues")
    print("that could cause out-of-order playback in the Gemini Live API interface.")
    print()
    
    if len(sys.argv) > 1:
        session_id = sys.argv[1]
        analyze_session_timing(session_id)
    else:
        # First try the specific session from the bug report
        analyze_specific_session()
        print("\n" + "="*80 + "\n")
        
        # Then analyze recent sessions
        test_latest_sessions()

if __name__ == '__main__':
    main() 