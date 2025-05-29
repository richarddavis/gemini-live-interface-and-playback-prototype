#!/usr/bin/env python3
"""
Modern Gemini Live API Test Based on Official Documentation
==========================================================

This test implements the Live API following the official Vertex AI documentation:
- Uses correct model: gemini-2.0-flash-live-preview-04-09
- Uses google-genai SDK (v1.0+) with async WebSocket connections
- Implements proper authentication for Vertex AI
- Tests text-to-text and text-to-audio communication

Requirements:
- google-genai>=1.0.0
- Vertex AI service account authentication
- Project ID: generative-fashion-355408
"""

import asyncio
import json
import os
import sys
import logging
from datetime import datetime
from pathlib import Path
import traceback

# Color output for better readability
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

async def test_text_communication():
    """Test basic text-to-text communication using Live API"""
    print_status("Testing Text Communication with Live API", "HEADER")
    
    try:
        # Import the google-genai SDK components
try:
            from google import genai
            from google.genai.types import (
                Content,
                LiveConnectConfig,
                HttpOptions,
                Modality,
                Part,
            )
            print_status("✓ Successfully imported google-genai SDK", "SUCCESS")
except ImportError as e:
            print_status(f"✗ Failed to import google-genai SDK: {e}", "ERROR")
            print_status("Install with: pip install google-genai", "WARNING")
            return False

        # Set up environment for Vertex AI
        PROJECT_ID = "generative-fashion-355408"
        LOCATION = "us-central1"  # Changed from global to us-central1 for Live API support
        
        os.environ["GOOGLE_CLOUD_PROJECT"] = PROJECT_ID
        os.environ["GOOGLE_CLOUD_LOCATION"] = LOCATION
        os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "True"
        
        print_status(f"✓ Configured for Vertex AI - Project: {PROJECT_ID}, Location: {LOCATION}", "SUCCESS")

        # Create client with proper configuration
        client = genai.Client(
            http_options=HttpOptions(api_version="v1beta1"),
            vertexai=True,
            project=PROJECT_ID,
            location=LOCATION
        )
        print_status("✓ Created genai.Client for Vertex AI", "SUCCESS")

        # CRITICAL: Use the correct Live API model name
        MODEL_ID = "gemini-2.0-flash-live-preview-04-09"
        print_status(f"✓ Using Live API model: {MODEL_ID}", "SUCCESS")

        # Configure for text-only communication
        config = LiveConnectConfig(
            response_modalities=[Modality.TEXT]
        )
        print_status("✓ Configured for text-only communication", "SUCCESS")

        # Test the connection and communication
        async with client.aio.live.connect(
            model=MODEL_ID,
            config=config,
        ) as session:
            print_status("✓ Successfully connected to Live API session", "SUCCESS")
            
            # Send a test message
            text_input = "Hello? Gemini, are you there? Please confirm you can hear me."
            print_status(f"Sending: {text_input}", "INFO")
            
            await session.send_client_content(
                turns=Content(role="user", parts=[Part(text=text_input)])
            )
            print_status("✓ Successfully sent client content", "SUCCESS")

            # Collect response
            response_parts = []
            async for message in session.receive():
                if message.text:
                    response_parts.append(message.text)
                    print_status(f"Received text chunk: {message.text[:50]}...", "INFO")

            full_response = "".join(response_parts)
            print_status(f"Complete Response: {full_response}", "SUCCESS")
            
            if full_response.strip():
                print_status("✓ Live API text communication test PASSED", "SUCCESS")
                return {
                    "status": "success",
                    "input": text_input,
                    "output": full_response,
                    "model": MODEL_ID,
                    "modality": "text"
                }
            else:
                print_status("✗ Received empty response", "ERROR")
                return {"status": "failed", "error": "Empty response"}

        except Exception as e:
        print_status(f"✗ Text communication test failed: {str(e)}", "ERROR")
        print_status(f"Traceback: {traceback.format_exc()}", "ERROR")
        return {"status": "error", "error": str(e), "traceback": traceback.format_exc()}

async def test_audio_communication():
    """Test text-to-audio communication using Live API"""
    print_status("Testing Text-to-Audio Communication with Live API", "HEADER")
    
    try:
        # Check for numpy dependency
        try:
            import numpy as np
        except ImportError:
            print_status("⚠ Skipping audio test - numpy not installed", "WARNING")
            return {"status": "skipped", "reason": "numpy dependency missing"}
        
        from google import genai
        from google.genai.types import (
            Content,
            LiveConnectConfig,
            HttpOptions,
            Modality,
            Part,
            SpeechConfig,
            VoiceConfig,
            PrebuiltVoiceConfig,
        )

        # Configuration
        PROJECT_ID = "generative-fashion-355408"
        LOCATION = "us-central1"  # Changed from global to us-central1 for Live API support
        
        os.environ["GOOGLE_CLOUD_PROJECT"] = PROJECT_ID
        os.environ["GOOGLE_CLOUD_LOCATION"] = LOCATION
        os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "True"

        client = genai.Client(
            http_options=HttpOptions(api_version="v1beta1"),
            vertexai=True,
            project=PROJECT_ID,
            location=LOCATION
        )

        MODEL_ID = "gemini-2.0-flash-live-preview-04-09"
        
        # Configure for audio output with voice settings
        config = LiveConnectConfig(
            response_modalities=[Modality.AUDIO],
            speech_config=SpeechConfig(
                voice_config=VoiceConfig(
                    prebuilt_voice_config=PrebuiltVoiceConfig(
                        voice_name="Aoede",  # Can be: Aoede, Puck, Charon, Kore, Fenrir, Leda, Orus, Zephyr
                    )
                ),
            ),
        )
        print_status("✓ Configured for audio output with Aoede voice", "SUCCESS")

        async with client.aio.live.connect(
            model=MODEL_ID,
            config=config,
        ) as session:
            print_status("✓ Successfully connected to Live API session", "SUCCESS")
            
            text_input = "Hello! Please say a brief greeting in a friendly voice."
            print_status(f"Sending: {text_input}", "INFO")
            
            await session.send_client_content(
                turns=Content(role="user", parts=[Part(text=text_input)])
            )

            # Collect audio data
            audio_chunks = []
            async for message in session.receive():
                if (
                    message.server_content.model_turn
                    and message.server_content.model_turn.parts
                ):
                    for part in message.server_content.model_turn.parts:
                        if part.inline_data:
                            audio_data = np.frombuffer(part.inline_data.data, dtype=np.int16)
                            audio_chunks.append(audio_data)
                            print_status(f"Received audio chunk: {len(audio_data)} samples", "INFO")

            if audio_chunks:
                total_audio = np.concatenate(audio_chunks)
                print_status(f"✓ Received {len(total_audio)} total audio samples at 24kHz", "SUCCESS")
                print_status("✓ Live API audio communication test PASSED", "SUCCESS")
                
                # Optionally save audio file
                audio_file = Path(f"test_results/live_api_audio_{datetime.now().strftime('%Y%m%d_%H%M%S')}.raw")
                audio_file.parent.mkdir(exist_ok=True)
                total_audio.tofile(audio_file)
                print_status(f"Audio saved to: {audio_file}", "INFO")
                
                return {
                    "status": "success",
                    "input": text_input,
                    "audio_samples": len(total_audio),
                    "audio_file": str(audio_file),
                    "model": MODEL_ID,
                    "modality": "audio",
                    "voice": "Aoede"
                }
            else:
                print_status("✗ No audio data received", "ERROR")
                return {"status": "failed", "error": "No audio data received"}

        except Exception as e:
        print_status(f"✗ Audio communication test failed: {str(e)}", "ERROR")
        return {"status": "error", "error": str(e)}

async def test_conversation_memory():
    """Test conversation memory across multiple turns"""
    print_status("Testing Conversation Memory with Live API", "HEADER")
    
    try:
        from google import genai
        from google.genai.types import (
            Content,
            LiveConnectConfig,
            HttpOptions,
            Modality,
            Part,
        )

        PROJECT_ID = "generative-fashion-355408"
        LOCATION = "us-central1"
        
        os.environ["GOOGLE_CLOUD_PROJECT"] = PROJECT_ID
        os.environ["GOOGLE_CLOUD_LOCATION"] = LOCATION
        os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "True"

        client = genai.Client(
            http_options=HttpOptions(api_version="v1beta1"),
            vertexai=True,
            project=PROJECT_ID,
            location=LOCATION
        )

        MODEL_ID = "gemini-2.0-flash-live-preview-04-09"
        config = LiveConnectConfig(response_modalities=[Modality.TEXT])

        async with client.aio.live.connect(model=MODEL_ID, config=config) as session:
            print_status("✓ Connected for memory test", "SUCCESS")
            
            # First exchange - set context
            first_input = "My name is Alice and my favorite color is blue. Remember this."
            await session.send_client_content(
                turns=Content(role="user", parts=[Part(text=first_input)])
            )
            
            response_parts = []
            async for message in session.receive():
                if message.text:
                    response_parts.append(message.text)
            
            first_response = "".join(response_parts)
            print_status(f"First exchange - Response: {first_response[:100]}...", "INFO")
            
            # Second exchange - test memory
            second_input = "What is my name and favorite color?"
            await session.send_client_content(
                turns=Content(role="user", parts=[Part(text=second_input)])
            )
            
            response_parts = []
            async for message in session.receive():
                if message.text:
                    response_parts.append(message.text)
            
            second_response = "".join(response_parts)
            print_status(f"Memory test - Response: {second_response}", "SUCCESS")
                
            # Check if it remembered
            memory_check = ("alice" in second_response.lower() and "blue" in second_response.lower())
            
            if memory_check:
                print_status("✓ Live API conversation memory test PASSED", "SUCCESS")
                return {
                    "status": "success",
                    "memory_retained": True,
                    "first_input": first_input,
                    "first_response": first_response,
                    "second_input": second_input,
                    "second_response": second_response
                }
            else:
                print_status("✗ Memory test failed - context not retained", "ERROR")
                return {
                    "status": "failed",
                    "memory_retained": False,
                    "second_response": second_response
                }

    except Exception as e:
        print_status(f"✗ Memory test failed: {str(e)}", "ERROR")
        return {"status": "error", "error": str(e)}

async def main():
    """Run all Live API tests"""
    print_status("Starting Modern Gemini Live API Tests", "HEADER")
    print_status("=" * 60, "HEADER")
    
    # Configuration
    PROJECT_ID = "generative-fashion-355408"
    LOCATION = "us-central1"  # Changed from global to us-central1 for Live API support
    MODEL_ID = "gemini-2.0-flash-live-preview-04-09"
    
    # Test results storage
    results = {}
    
    # Check dependencies
    try:
        import google.genai
        print_status(f"✓ google-genai version: {google.genai.__version__}", "SUCCESS")
    except ImportError:
        print_status("✗ google-genai not installed. Install with: pip install google-genai", "ERROR")
        return
    except AttributeError:
        print_status("✓ google-genai installed (version info not available)", "SUCCESS")

    # Run tests
    # Test 1: Text Communication
    results["text_communication"] = await test_text_communication()
    
    # Test 2: Audio Communication  
    results["audio_communication"] = await test_audio_communication()
            
    # Test 3: Conversation Memory
    results["conversation_memory"] = await test_conversation_memory()
    
    # Save results
    results_file = Path(f"test_results/modern_live_api_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
    results_file.parent.mkdir(exist_ok=True)
    
    with open(results_file, 'w') as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "test_framework": "Modern Gemini Live API Test",
            "model": MODEL_ID,
            "results": results
        }, f, indent=2)
    
    print_status(f"Results saved to: {results_file}", "INFO")
    
    # Summary
    print_status("\n" + "=" * 60, "HEADER")
    print_status("TEST SUMMARY", "HEADER")
    print_status("=" * 60, "HEADER")
    
    passed = sum(1 for result in results.values() if result.get("status") == "success")
    total = len(results)
    
    for test_name, result in results.items():
        status = "✓ PASSED" if result.get("status") == "success" else "✗ FAILED"
        color = "SUCCESS" if result.get("status") == "success" else "ERROR"
        print_status(f"{test_name}: {status}", color)
        if result.get("error"):
            print_status(f"  Error: {result.get('error')}", "ERROR")
    
    print_status(f"\nOverall: {passed}/{total} tests passed", 
                "SUCCESS" if passed == total else "WARNING")

if __name__ == "__main__":
    # Set up logging
    logging.basicConfig(level=logging.INFO)
    
    # Create results directory
    Path("test_results").mkdir(exist_ok=True)
    
    # Run the tests
    asyncio.run(main()) 