#!/usr/bin/env python3

import requests
import subprocess
import os
import tempfile

def test_ffmpeg_audio():
    """Test FFmpeg with a real audio chunk from the logs"""
    
    # Use one of the chunk URLs we saw in the logs that was successfully downloaded
    test_url = "https://storage.googleapis.com/cursor-test-llm-assets/interactions_20250531_225238_iokh07sd_audio_chunk_4242.pcm?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Credential=cursor-test-llm-assets%40generative-fashion-355408.iam.gserviceaccount.com%2F20250531%2Fauto%2Fstorage%2Fgoog4_request&X-Goog-Date=20250531T225356Z&X-Goog-Expires=604800&X-Goog-SignedHeaders=host&X-Goog-Signature=aabbcc"
    
    # Actually, let's use a more recent URL that should still be valid
    print("🎵 Testing FFmpeg audio processing...")
    
    with tempfile.TemporaryDirectory() as temp_dir:
        # Download the file using curl (should work inside Docker)
        test_file = os.path.join(temp_dir, "test_chunk.pcm")
        
        print(f"🎵 Downloading test chunk to {test_file}")
        
        # Use a simpler approach - create a dummy PCM file with known content
        print("🎵 Creating test PCM file with known content...")
        
        # Generate 8192 bytes of simple sine wave PCM data (16-bit, 24kHz, mono)
        import math
        sample_rate = 24000
        duration = 0.17  # About 8192 bytes / 2 bytes per sample / 24000 Hz
        samples = int(sample_rate * duration)
        
        pcm_data = bytearray()
        for i in range(samples):
            # Simple sine wave at 440 Hz
            t = i / sample_rate
            sample = int(32767 * 0.5 * math.sin(2 * math.pi * 440 * t))
            # Convert to 16-bit little-endian
            pcm_data.extend(sample.to_bytes(2, byteorder='little', signed=True))
        
        # Pad to 8192 bytes to match our chunk size
        while len(pcm_data) < 8192:
            pcm_data.append(0)
        pcm_data = pcm_data[:8192]
        
        with open(test_file, 'wb') as f:
            f.write(pcm_data)
        
        print(f"🎵 Created test PCM file: {len(pcm_data)} bytes")
        print(f"🎵 First 32 bytes: {pcm_data[:32].hex()}")
        
        # Test different FFmpeg commands
        output_file = os.path.join(temp_dir, "test_output.wav")
        
        test_commands = [
            # Test 1: Basic PCM conversion (what we're currently using)
            {
                'name': 'Basic PCM s16le 24kHz mono',
                'cmd': ['ffmpeg', '-y', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', test_file, '-c:a', 'pcm_s16le', output_file]
            },
            # Test 2: Without specifying format (let FFmpeg detect)
            {
                'name': 'Auto-detect format',
                'cmd': ['ffmpeg', '-y', '-i', test_file, '-c:a', 'pcm_s16le', '-ar', '24000', output_file]
            },
            # Test 3: Different sample rates
            {
                'name': 'PCM s16le 16kHz mono',
                'cmd': ['ffmpeg', '-y', '-f', 's16le', '-ar', '16000', '-ac', '1', '-i', test_file, '-c:a', 'pcm_s16le', output_file]
            },
            # Test 4: Big endian
            {
                'name': 'PCM s16be 24kHz mono',
                'cmd': ['ffmpeg', '-y', '-f', 's16be', '-ar', '24000', '-ac', '1', '-i', test_file, '-c:a', 'pcm_s16le', output_file]
            },
            # Test 5: Try as raw audio with different bit depth
            {
                'name': 'Raw PCM u8 24kHz mono',
                'cmd': ['ffmpeg', '-y', '-f', 'u8', '-ar', '24000', '-ac', '1', '-i', test_file, '-c:a', 'pcm_s16le', output_file]
            },
            # Test 6: Try different channel configurations
            {
                'name': 'PCM s16le 24kHz stereo',
                'cmd': ['ffmpeg', '-y', '-f', 's16le', '-ar', '24000', '-ac', '2', '-i', test_file, '-c:a', 'pcm_s16le', output_file]
            }
        ]
        
        successful_commands = []
        
        for test in test_commands:
            print(f"\n🎵 Testing: {test['name']}")
            print(f"🎵 Command: {' '.join(test['cmd'])}")
            
            try:
                # Remove output file if it exists
                if os.path.exists(output_file):
                    os.remove(output_file)
                
                result = subprocess.run(test['cmd'], capture_output=True, text=True, timeout=10)
                
                if result.returncode == 0:
                    output_size = os.path.getsize(output_file) if os.path.exists(output_file) else 0
                    print(f"✅ SUCCESS! Output size: {output_size} bytes")
                    successful_commands.append(test['name'])
                else:
                    print(f"❌ FAILED: {result.stderr}")
                    
            except subprocess.TimeoutExpired:
                print(f"⏰ TIMEOUT")
            except Exception as e:
                print(f"💥 ERROR: {e}")
        
        print(f"\n🎵 SUMMARY:")
        print(f"🎵 Successful commands: {len(successful_commands)}")
        for cmd in successful_commands:
            print(f"🎵   ✅ {cmd}")
        
        if not successful_commands:
            print(f"🎵   ❌ No commands worked - PCM format issue confirmed")
            
            # Let's also check what file thinks this is
            try:
                file_result = subprocess.run(['file', test_file], capture_output=True, text=True)
                print(f"🎵 File type detection: {file_result.stdout.strip()}")
            except:
                print(f"🎵 Could not run 'file' command")

if __name__ == "__main__":
    test_ffmpeg_audio() 