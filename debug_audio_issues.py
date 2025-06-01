#!/usr/bin/env python3

import subprocess
import os
import tempfile

def debug_audio_issues():
    """Debug sample rate and segment grouping issues"""
    
    print("🔍 Debugging audio issues...")
    
    # Run this script inside the Docker container to access the database
    debug_script = '''
import sys
sys.path.append('/app')

from app import create_app
from app.models import InteractionLog
from app.services.video_processor import VideoProcessor
import requests
import tempfile
import subprocess
import os

app = create_app()
with app.app_context():
    # Get recent session data
    recent_logs = InteractionLog.query.order_by(InteractionLog.id.desc()).limit(100).all()
    
    if not recent_logs:
        print("❌ No recent logs found")
        exit()
    
    # Group by session
    sessions = {}
    for log in recent_logs:
        if log.session_id not in sessions:
            sessions[log.session_id] = []
        sessions[log.session_id].append(log)
    
    # Get most recent session with audio chunks
    target_session = None
    for session_id, logs in sessions.items():
        audio_chunks = [log for log in logs if log.interaction_type == 'audio_chunk']
        if len(audio_chunks) > 10:  # Session with substantial audio
            target_session = session_id
            break
    
    if not target_session:
        print("❌ No session with sufficient audio chunks found")
        exit()
    
    print(f"🔍 Analyzing session: {target_session}")
    
    # Get all logs for this session
    session_logs = InteractionLog.query.filter_by(session_id=target_session).order_by(InteractionLog.timestamp.asc()).all()
    
    # Analyze audio chunks by type
    user_audio = []
    api_audio = []
    api_responses = []
    
    for log in session_logs:
        if log.interaction_type == 'audio_chunk':
            log_dict = log.to_dict(include_media=True)
            metadata = log_dict.get('interaction_metadata', {})
            
            if metadata.get('microphone_on', False):
                user_audio.append(log_dict)
            else:
                api_audio.append(log_dict)
        elif log.interaction_type == 'api_response':
            log_dict = log.to_dict(include_media=True)
            api_responses.append(log_dict)
    
    print(f"📊 Audio Analysis:")
    print(f"  User audio chunks: {len(user_audio)}")
    print(f"  API audio chunks: {len(api_audio)}")
    print(f"  API responses: {len(api_responses)}")
    
    # Check API responses for audio content
    api_audio_responses = []
    for response in api_responses:
        metadata = response.get('interaction_metadata', {})
        is_audio = (
            metadata.get('response_type') == 'audio' or
            metadata.get('mime_type', '').startswith('audio/') or
            (response.get('media_data', {}).get('cloud_storage_url', '').endswith('.pcm'))
        )
        if is_audio:
            api_audio_responses.append(response)
    
    print(f"  API audio responses: {len(api_audio_responses)}")
    
    # Show details of API responses
    for i, response in enumerate(api_responses[:5]):  # Check more responses
        metadata = response.get('interaction_metadata', {})
        media_data = response.get('media_data', {})
        print(f"  API Response {i+1}:")
        print(f"    - response_type: {metadata.get('response_type', 'not set')}")
        print(f"    - mime_type: {metadata.get('mime_type', 'not set')}")
        print(f"    - has media_data: {bool(media_data)}")
        if media_data and media_data.get('cloud_storage_url'):
            url = media_data['cloud_storage_url']
            print(f"    - cloud_storage_url: {url[:80]}...")
            print(f"    - URL contains .pcm: {'.pcm' in url}")
            print(f"    - URL contains audio: {'audio' in url}")
        print()
    
    # Test sample rates with a few chunks
    with tempfile.TemporaryDirectory() as temp_dir:
        print(f"\\n🔍 Testing sample rates...")
        
        # Test user audio chunk
        if user_audio:
            chunk = user_audio[0]
            if chunk.get('media_data', {}).get('cloud_storage_url'):
                url = chunk['media_data']['cloud_storage_url']
                test_file = os.path.join(temp_dir, "user_chunk.pcm")
                
                try:
                    response = requests.get(url, timeout=30)
                    response.raise_for_status()
                    
                    with open(test_file, 'wb') as f:
                        f.write(response.content)
                    
                    print(f"📁 User audio chunk: {len(response.content)} bytes")
                    
                    # Test different sample rates
                    for sample_rate in [16000, 24000, 48000]:
                        output_file = os.path.join(temp_dir, f"user_{sample_rate}.wav")
                        cmd = ['ffmpeg', '-y', '-f', 's16le', '-ar', str(sample_rate), '-ac', '1', 
                               '-i', test_file, '-c:a', 'pcm_s16le', '-t', '2', output_file]
                        
                        result = subprocess.run(cmd, capture_output=True, text=True)
                        if result.returncode == 0:
                            size = os.path.getsize(output_file)
                            print(f"  ✅ {sample_rate}Hz: {size} bytes")
                        else:
                            print(f"  ❌ {sample_rate}Hz: failed")
                            
                except Exception as e:
                    print(f"❌ Error testing user audio: {e}")
        
        # Test API audio chunk  
        if api_audio:
            chunk = api_audio[0]
            if chunk.get('media_data', {}).get('cloud_storage_url'):
                url = chunk['media_data']['cloud_storage_url']
                test_file = os.path.join(temp_dir, "api_chunk.pcm")
                
                try:
                    response = requests.get(url, timeout=30)
                    response.raise_for_status()
                    
                    with open(test_file, 'wb') as f:
                        f.write(response.content)
                    
                    print(f"📁 API audio chunk: {len(response.content)} bytes")
                    
                    # Test different sample rates
                    for sample_rate in [16000, 24000, 48000]:
                        output_file = os.path.join(temp_dir, f"api_{sample_rate}.wav")
                        cmd = ['ffmpeg', '-y', '-f', 's16le', '-ar', str(sample_rate), '-ac', '1', 
                               '-i', test_file, '-c:a', 'pcm_s16le', '-t', '2', output_file]
                        
                        result = subprocess.run(cmd, capture_output=True, text=True)
                        if result.returncode == 0:
                            size = os.path.getsize(output_file)
                            print(f"  ✅ {sample_rate}Hz: {size} bytes")
                        else:
                            print(f"  ❌ {sample_rate}Hz: failed")
                            
                except Exception as e:
                    print(f"❌ Error testing API audio: {e}")
    
    # Test segment grouping
    print(f"\\n🔍 Testing segment grouping...")
    processor = VideoProcessor('cursor-test-llm-assets')
    segments = processor.group_into_conversation_segments([log.to_dict(include_media=True) for log in session_logs])
    
    print(f"📊 Segment Analysis:")
    print(f"  Total segments: {len(segments)}")
    
    for i, segment in enumerate(segments):
        audio_count = len(segment.get('audio_chunks', []))
        video_count = len(segment.get('video_frames', []))
        segment_type = segment.get('type', 'unknown')
        duration = segment.get('duration', 0)
        
        print(f"  Segment {i+1}: {segment_type} - {audio_count} audio, {video_count} video, {duration}ms")
        
        # Check if API response segments have audio
        if segment_type == 'api_response' and audio_count == 0:
            print(f"    ⚠️  API response segment has no audio!")
        elif segment_type == 'user_speech' and audio_count == 0:
            print(f"    ⚠️  User speech segment has no audio!")
    '''
    
    # Write the debug script to a temporary file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
        f.write(debug_script)
        script_path = f.name
    
    try:
        # Copy script to Docker container and run it
        copy_result = subprocess.run(['docker', 'cp', script_path, 'webapp_starter_cursor-backend-1:/tmp/debug_audio.py'], 
                                   capture_output=True, text=True)
        
        if copy_result.returncode != 0:
            print(f"❌ Failed to copy script to container: {copy_result.stderr}")
            return
        
        # Run the script inside the container
        run_result = subprocess.run(['docker-compose', 'exec', '-T', 'backend', 'python3', '/tmp/debug_audio.py'], 
                                  capture_output=True, text=True)
        
        print("🔍 Audio debugging results:")
        print(run_result.stdout)
        if run_result.stderr:
            print("Errors:")
            print(run_result.stderr)
            
    finally:
        # Clean up
        os.unlink(script_path)

if __name__ == "__main__":
    debug_audio_issues() 