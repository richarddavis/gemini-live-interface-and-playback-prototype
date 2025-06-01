#!/usr/bin/env python3

import subprocess
import os
import tempfile

def test_real_audio_chunk():
    """Test FFmpeg with a real audio chunk downloaded from inside the Docker container"""
    
    print("🎵 Testing FFmpeg with real audio chunks from the database...")
    
    # Run this script inside the Docker container to access the database
    test_script = '''
import sys
sys.path.append('/app')

from app import create_app
from app.models import InteractionLog
import requests
import tempfile
import subprocess
import os

app = create_app()
with app.app_context():
    # Get a recent audio chunk that we know exists
    audio_chunks = InteractionLog.query.filter_by(interaction_type='audio_chunk').order_by(InteractionLog.id.desc()).limit(5).all()
    
    print(f"Found {len(audio_chunks)} recent audio chunks")
    
    for chunk in audio_chunks:
        chunk_dict = chunk.to_dict(include_media=True)
        if chunk_dict.get('media_data', {}).get('cloud_storage_url'):
            url = chunk_dict['media_data']['cloud_storage_url']
            print(f"\\n🎵 Testing chunk {chunk.id}: {url[:100]}...")
            
            with tempfile.TemporaryDirectory() as temp_dir:
                test_file = os.path.join(temp_dir, f"chunk_{chunk.id}.pcm")
                
                # Download the file
                try:
                    response = requests.get(url, timeout=30)
                    response.raise_for_status()
                    
                    with open(test_file, 'wb') as f:
                        f.write(response.content)
                    
                    print(f"🎵 Downloaded {len(response.content)} bytes")
                    print(f"🎵 First 32 bytes: {response.content[:32].hex()}")
                    
                    # Test FFmpeg commands
                    output_file = os.path.join(temp_dir, "test_output.wav")
                    
                    tests = [
                        ['ffmpeg', '-y', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', test_file, '-c:a', 'pcm_s16le', output_file],
                        ['ffmpeg', '-y', '-f', 's16le', '-ar', '16000', '-ac', '1', '-i', test_file, '-c:a', 'pcm_s16le', output_file],
                        ['ffmpeg', '-y', '-f', 'u8', '-ar', '24000', '-ac', '1', '-i', test_file, '-c:a', 'pcm_s16le', output_file],
                        ['ffmpeg', '-y', '-f', 'f32le', '-ar', '24000', '-ac', '1', '-i', test_file, '-c:a', 'pcm_s16le', output_file],
                    ]
                    
                    for i, cmd in enumerate(tests):
                        if os.path.exists(output_file):
                            os.remove(output_file)
                            
                        result = subprocess.run(cmd, capture_output=True, text=True)
                        
                        if result.returncode == 0:
                            size = os.path.getsize(output_file) if os.path.exists(output_file) else 0
                            print(f"✅ Test {i+1} SUCCESS: {' '.join(cmd[1:6])} -> {size} bytes")
                            break
                        else:
                            print(f"❌ Test {i+1} FAILED: {' '.join(cmd[1:6])}")
                            if i == 0:  # Show error for first test
                                print(f"   Error: {result.stderr[:200]}")
                    
                    # Also check file type
                    file_result = subprocess.run(['file', test_file], capture_output=True, text=True)
                    print(f"🎵 File type: {file_result.stdout.strip()}")
                    
                    break  # Only test first valid chunk
                    
                except Exception as e:
                    print(f"❌ Error with chunk {chunk.id}: {e}")
                    continue
    '''
    
    # Write the test script to a temporary file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
        f.write(test_script)
        script_path = f.name
    
    try:
        # Copy script to Docker container and run it
        copy_result = subprocess.run(['docker', 'cp', script_path, 'webapp_starter_cursor-backend-1:/tmp/test_real_chunks.py'], 
                                   capture_output=True, text=True)
        
        if copy_result.returncode != 0:
            print(f"❌ Failed to copy script to container: {copy_result.stderr}")
            return
        
        # Run the script inside the container
        run_result = subprocess.run(['docker-compose', 'exec', '-T', 'backend', 'python3', '/tmp/test_real_chunks.py'], 
                                  capture_output=True, text=True)
        
        print("🎵 Real audio chunk test results:")
        print(run_result.stdout)
        if run_result.stderr:
            print("Errors:")
            print(run_result.stderr)
            
    finally:
        # Clean up
        os.unlink(script_path)

if __name__ == "__main__":
    test_real_audio_chunk() 