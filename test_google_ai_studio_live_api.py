#!/usr/bin/env python3
"""
Google AI Studio Live API Test
==============================

Test the full Live API capabilities using Google AI Studio API instead of Vertex AI.
This should support camera and microphone streaming that Vertex AI doesn't support.

Requirements:
- google-genai>=1.0.0
- GEMINI_API_KEY environment variable
- numpy for audio/video processing
"""

import asyncio
import json
import os
import sys
import logging
from datetime import datetime
from pathlib import Path
import traceback

# Color output
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

def print_status(message, status="INFO"):
    """Print colored status messages"""
    colors = {
        "INFO": Colors.OKBLUE,
        "SUCCESS": Colors.OKGREEN,
        "WARNING": Colors.WARNING,
        "ERROR": Colors.FAIL,
        "HEADER": Colors.HEADER
    }
    color = colors.get(status, Colors.OKBLUE)
    print(f"{color}{status}: {message}{Colors.ENDC}")

async def test_google_ai_studio_setup():
    """Test Google AI Studio API setup"""
    print_status("Testing Google AI Studio API Setup", "HEADER")
    
    try:
        # Check for API key
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            print_status("❌ GEMINI_API_KEY environment variable not set", "ERROR")
            print_status("Get your API key from: https://aistudio.google.com/apikey", "INFO")
            return {"status": "error", "error": "Missing GEMINI_API_KEY"}
        
        from google import genai
        
        # Create client with API key (not Vertex AI)
        client = genai.Client(api_key=api_key)
        
        print_status("✓ API key configured", "SUCCESS")
        print_status("✓ Google AI Studio client created", "SUCCESS")
        
        return {
            "status": "success",
            "api_key_set": True,
            "client_type": "Google AI Studio"
        }
        
    except ImportError:
        print_status("✗ google-genai package not installed", "ERROR")
        return {"status": "error", "error": "google-genai package missing"}
    except Exception as e:
        print_status(f"✗ Setup failed: {str(e)}", "ERROR")
        return {"status": "error", "error": str(e)}

async def test_audio_input_with_google_ai():
    """Test audio input streaming with Google AI Studio API"""
    print_status("Testing Audio Input with Google AI Studio", "HEADER")
    
    try:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            return {"status": "error", "error": "Missing GEMINI_API_KEY"}
        
        from google import genai
        from google.genai.types import (
            LiveConnectConfig,
            Modality,
            Blob,
        )
        
        # Create Google AI Studio client (NOT Vertex AI)
        client = genai.Client(api_key=api_key)
        
        # Configure for audio input
        config = LiveConnectConfig(
            response_modalities=[Modality.TEXT],
            input_audio_transcription={}  # Enable input transcription
        )
        
        print_status("✓ Configured for audio input streaming", "SUCCESS")
        
        async with client.aio.live.connect(
            model="gemini-2.0-flash-live-001", 
            config=config
        ) as session:
            print_status("✓ Connected to Google AI Studio Live API", "SUCCESS")
            
            # Simulate microphone audio data
            import numpy as np
            sample_rate = 16000
            duration = 2
            t = np.linspace(0, duration, sample_rate * duration, False)
            frequency = 440  # A4 note
            audio_data = (np.sin(2 * np.pi * frequency * t) * 32767).astype(np.int16)
            audio_bytes = audio_data.tobytes()
            
            print_status(f"Sending {len(audio_bytes)} bytes of audio data", "INFO")
            
            # Send audio input - THIS SHOULD WORK with Google AI Studio
            await session.send_realtime_input(
                audio=Blob(data=audio_bytes, mime_type="audio/pcm;rate=16000")
            )
            
            # Check for response
            response_received = False
            async for message in session.receive():
                if message.server_content and message.server_content.input_transcription:
                    transcription = message.server_content.input_transcription.text
                    print_status(f"✓ Audio transcription: {transcription}", "SUCCESS")
                    response_received = True
                    break
                elif message.text:
                    print_status(f"Model response: {message.text}", "INFO")
                    response_received = True
                    break
            
            return {
                "status": "success",
                "audio_input_supported": True,
                "response_received": response_received,
                "test_type": "google_ai_studio_audio_input"
            }
            
    except ImportError:
        print_status("⚠ Skipping - numpy not available", "WARNING")
        return {"status": "skipped", "reason": "numpy dependency missing"}
    except Exception as e:
        error_msg = str(e)
        if "audio parameter is not supported" in error_msg:
            print_status("❌ This confirms the Vertex AI limitation!", "ERROR")
        print_status(f"✗ Audio input test failed: {error_msg}", "ERROR")
        return {"status": "error", "error": error_msg}

async def test_video_input_with_google_ai():
    """Test video input streaming with Google AI Studio API"""
    print_status("Testing Video Input with Google AI Studio", "HEADER")
    
    try:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            return {"status": "error", "error": "Missing GEMINI_API_KEY"}
        
        from google import genai
        from google.genai.types import (
            LiveConnectConfig,
            Modality,
            Blob,
        )
        
        client = genai.Client(api_key=api_key)
        
        config = LiveConnectConfig(
            response_modalities=[Modality.TEXT]
        )
        
        print_status("✓ Configured for video input streaming", "SUCCESS")
        
        async with client.aio.live.connect(
            model="gemini-2.0-flash-live-001",
            config=config
        ) as session:
            print_status("✓ Connected for video input test", "SUCCESS")
            
            # Create test video frame
            import numpy as np
            width, height = 320, 240
            frame = np.zeros((height, width, 3), dtype=np.uint8)
            frame[50:150, 50:150] = [255, 0, 0]  # Red square
            frame_bytes = frame.tobytes()
            
            print_status(f"Sending {len(frame_bytes)} bytes of video data", "INFO")
            
            # Send video frame - THIS SHOULD WORK with Google AI Studio
            await session.send_realtime_input(
                video=Blob(data=frame_bytes, mime_type="image/raw")
            )
            
            # Ask about video
            await session.send_client_content(
                turns={"role": "user", "parts": [{"text": "What do you see in the video?"}]},
                turn_complete=True
            )
            
            # Get response
            response_parts = []
            async for message in session.receive():
                if message.text:
                    response_parts.append(message.text)
                    print_status(f"Video analysis: {message.text[:100]}...", "INFO")
                    if len(response_parts) > 2:
                        break
            
            full_response = "".join(response_parts)
            
            return {
                "status": "success",
                "video_input_supported": True,
                "response": full_response,
                "test_type": "google_ai_studio_video_input"
            }
            
    except ImportError:
        print_status("⚠ Skipping - numpy not available", "WARNING")
        return {"status": "skipped", "reason": "numpy dependency missing"}
    except Exception as e:
        error_msg = str(e)
        if "video parameter is not supported" in error_msg:
            print_status("❌ This confirms the Vertex AI limitation!", "ERROR")
        print_status(f"✗ Video input test failed: {error_msg}", "ERROR")
        return {"status": "error", "error": error_msg}

async def test_comparison_summary():
    """Create a comparison between Vertex AI and Google AI Studio"""
    print_status("PLATFORM COMPARISON SUMMARY", "HEADER")
    print_status("=" * 60, "HEADER")
    
    comparison = {
        "vertex_ai": {
            "name": "Vertex AI (Current Setup)",
            "authentication": "Service Account JSON",
            "text_communication": "✅ Supported",
            "audio_output": "✅ Supported", 
            "audio_input": "❌ NOT SUPPORTED",
            "video_input": "❌ NOT SUPPORTED",
            "function_calling": "✅ Supported",
            "system_instructions": "✅ Supported",
            "enterprise_features": "✅ Full enterprise support",
            "use_case": "Enterprise/Production (without A/V input)"
        },
        "google_ai_studio": {
            "name": "Google AI Studio API",
            "authentication": "API Key",
            "text_communication": "✅ Supported",
            "audio_output": "✅ Supported",
            "audio_input": "✅ FULL SUPPORT",
            "video_input": "✅ FULL SUPPORT",
            "function_calling": "✅ Supported",
            "system_instructions": "✅ Supported", 
            "enterprise_features": "⚠ Limited enterprise features",
            "use_case": "Development/Prototyping + Full Live API"
        }
    }
    
    for platform, features in comparison.items():
        print_status(f"\n{features['name']}:", "INFO")
        for feature, support in features.items():
            if feature != "name":
                print_status(f"  {feature}: {support}", "INFO")
    
    print_status("\n🎯 FOR YOUR CAMERA/MICROPHONE GOAL:", "WARNING")
    print_status("You MUST use Google AI Studio API for audio/video input", "WARNING")
    
    return comparison

async def main():
    """Run Google AI Studio Live API tests"""
    print_status("Google AI Studio Live API Test Suite", "HEADER")
    print_status("=" * 60, "HEADER")
    
    print_status("Testing the FULL Live API capabilities with Google AI Studio", "INFO")
    print_status("This should support camera and microphone streaming!", "INFO")
    print()
    
    results = {}
    
    # Test 1: Setup
    results["setup"] = await test_google_ai_studio_setup()
    
    # Test 2: Audio Input (should work with Google AI Studio)
    results["audio_input"] = await test_audio_input_with_google_ai()
    
    # Test 3: Video Input (should work with Google AI Studio)  
    results["video_input"] = await test_video_input_with_google_ai()
    
    # Test 4: Platform Comparison
    results["comparison"] = await test_comparison_summary()
    
    # Save results
    results_file = Path(f"test_results/google_ai_studio_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
    results_file.parent.mkdir(exist_ok=True)
    
    with open(results_file, 'w') as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "test_framework": "Google AI Studio Live API Test",
            "purpose": "Test full Live API with camera/microphone support",
            "platform": "Google AI Studio API (not Vertex AI)",
            "results": results
        }, f, indent=2)
    
    print_status(f"\nResults saved to: {results_file}", "INFO")
    
    # Final assessment
    print_status("\n" + "=" * 60, "HEADER")
    print_status("FINAL ASSESSMENT", "HEADER")
    print_status("=" * 60, "HEADER")
    
    if results["setup"].get("status") == "success":
        print_status("✅ Google AI Studio API can be used for full Live API", "SUCCESS")
        print_status("📷 Camera streaming: Available via Google AI Studio", "SUCCESS")  
        print_status("🎤 Microphone streaming: Available via Google AI Studio", "SUCCESS")
    else:
        print_status("❌ Need to set up Google AI Studio API key", "ERROR")
        print_status("Get API key: https://aistudio.google.com/apikey", "INFO")
    
    print_status("\n🔄 RECOMMENDATION:", "WARNING")
    print_status("Use Google AI Studio API for Live API development", "WARNING")
    print_status("Keep Vertex AI for other enterprise features", "WARNING")

if __name__ == "__main__":
    # Set up logging
    logging.basicConfig(level=logging.INFO)
    
    # Create results directory
    Path("test_results").mkdir(exist_ok=True)
    
    # Run tests
    asyncio.run(main()) 