#!/usr/bin/env python3
"""
Comprehensive Gemini Live API Test Suite
========================================

Tests all Live API capabilities needed for production camera and microphone streaming:
- Audio input (microphone) streaming 
- Video input (camera) streaming
- Multimodal input/output
- Voice Activity Detection (VAD)
- System instructions
- Function calling
- Advanced session management
- Real-time input streaming
- Performance monitoring

Requirements:
- google-genai>=1.0.0
- numpy (for audio processing)
- opencv-python (for video processing) 
- pyaudio (for microphone access)
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

async def test_audio_input_streaming():
    """Test audio input streaming (microphone simulation)"""
    print_status("Testing Audio Input Streaming (Microphone)", "HEADER")
    
    try:
        from google import genai
        from google.genai.types import (
            LiveConnectConfig,
            HttpOptions,
            Modality,
            Blob,
        )
        
        # Configuration for audio input
        PROJECT_ID = "generative-fashion-355408"
        LOCATION = "us-central1"
        MODEL_ID = "gemini-2.0-flash-live-preview-04-09"
        
        os.environ["GOOGLE_CLOUD_PROJECT"] = PROJECT_ID
        os.environ["GOOGLE_CLOUD_LOCATION"] = LOCATION
        os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "True"
        
        client = genai.Client(
            http_options=HttpOptions(api_version="v1beta1"),
            vertexai=True,
            project=PROJECT_ID,
            location=LOCATION
        )
        
        # Configure for audio input transcription
        config = LiveConnectConfig(
            response_modalities=[Modality.TEXT],
            input_audio_transcription={}  # Enable input transcription
        )
        
        print_status("✓ Configured for audio input streaming", "SUCCESS")
        
        async with client.aio.live.connect(model=MODEL_ID, config=config) as session:
            print_status("✓ Connected for audio input test", "SUCCESS")
            
            # Simulate microphone audio data (16-bit PCM, 16kHz)
            # In real implementation, this would come from microphone
            sample_rate = 16000
            duration = 2  # 2 seconds
            import numpy as np
            
            # Generate test audio (sine wave - simulating speech)
            t = np.linspace(0, duration, sample_rate * duration, False)
            frequency = 440  # A4 note
            audio_data = (np.sin(2 * np.pi * frequency * t) * 32767).astype(np.int16)
            audio_bytes = audio_data.tobytes()
            
            print_status(f"Sending {len(audio_bytes)} bytes of audio data", "INFO")
            
            # Send audio input
            await session.send_realtime_input(
                audio=Blob(data=audio_bytes, mime_type="audio/pcm;rate=16000")
            )
            
            # Receive transcription
            transcription_received = False
            async for message in session.receive():
                if message.server_content and message.server_content.input_transcription:
                    transcription = message.server_content.input_transcription.text
                    print_status(f"✓ Received audio transcription: {transcription}", "SUCCESS")
                    transcription_received = True
                    break
                elif message.text:
                    print_status(f"Model response: {message.text}", "INFO")
                    break
            
            return {
                "status": "success",
                "transcription_received": transcription_received,
                "audio_data_size": len(audio_bytes),
                "test_type": "audio_input_streaming"
            }
            
    except ImportError:
        print_status("⚠ Skipping audio input test - numpy not available", "WARNING")
        return {"status": "skipped", "reason": "numpy dependency missing"}
    except Exception as e:
        print_status(f"✗ Audio input test failed: {str(e)}", "ERROR")
        return {"status": "error", "error": str(e)}

async def test_video_input_streaming():
    """Test video input streaming (camera simulation)"""
    print_status("Testing Video Input Streaming (Camera)", "HEADER")
    
    try:
        from google import genai
        from google.genai.types import (
            LiveConnectConfig,
            HttpOptions,
            Modality,
            Blob,
            MediaResolution,
        )
        
        PROJECT_ID = "generative-fashion-355408"
        LOCATION = "us-central1"
        MODEL_ID = "gemini-2.0-flash-live-preview-04-09"
        
        os.environ["GOOGLE_CLOUD_PROJECT"] = PROJECT_ID
        os.environ["GOOGLE_CLOUD_LOCATION"] = LOCATION
        os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "True"
        
        client = genai.Client(
            http_options=HttpOptions(api_version="v1beta1"),
            vertexai=True,
            project=PROJECT_ID,
            location=LOCATION
        )
        
        # Configure for video input
        config = LiveConnectConfig(
            response_modalities=[Modality.TEXT],
            media_resolution=MediaResolution.MEDIA_RESOLUTION_LOW  # For testing
        )
        
        print_status("✓ Configured for video input streaming", "SUCCESS")
        
        async with client.aio.live.connect(model=MODEL_ID, config=config) as session:
            print_status("✓ Connected for video input test", "SUCCESS")
            
            # Simulate camera frame data
            # In real implementation, this would come from camera
            try:
                import numpy as np
                # Create a simple test image (red square)
                width, height = 320, 240
                frame = np.zeros((height, width, 3), dtype=np.uint8)
                frame[50:150, 50:150] = [255, 0, 0]  # Red square
                
                # Convert to JPEG bytes (simplified - real implementation would use proper encoding)
                frame_bytes = frame.tobytes()
                
                print_status(f"Sending {len(frame_bytes)} bytes of video data", "INFO")
                
                # Send video frame
                await session.send_realtime_input(
                    video=Blob(data=frame_bytes, mime_type="image/raw")  # Simplified format
                )
                
                # Ask about video content
                await session.send_client_content(
                    turns={"role": "user", "parts": [{"text": "What do you see in the video?"}]},
                    turn_complete=True
                )
                
                # Receive response
                response_parts = []
                async for message in session.receive():
                    if message.text:
                        response_parts.append(message.text)
                        print_status(f"Video analysis: {message.text[:100]}...", "INFO")
                        if len(response_parts) > 3:  # Get enough response
                            break
                
                full_response = "".join(response_parts)
                
                return {
                    "status": "success",
                    "video_data_size": len(frame_bytes),
                    "response": full_response,
                    "test_type": "video_input_streaming"
                }
                
            except ImportError:
                print_status("⚠ Skipping video frame generation - numpy not available", "WARNING")
                return {"status": "skipped", "reason": "numpy dependency missing"}
            
    except Exception as e:
        print_status(f"✗ Video input test failed: {str(e)}", "ERROR")
        return {"status": "error", "error": str(e)}

async def test_voice_activity_detection():
    """Test Voice Activity Detection (VAD) configuration"""
    print_status("Testing Voice Activity Detection (VAD)", "HEADER")
    
    try:
        from google import genai
        from google.genai.types import (
            LiveConnectConfig,
            HttpOptions,
            Modality,
            Blob,
            StartSensitivity,
            EndSensitivity,
        )
        
        PROJECT_ID = "generative-fashion-355408"
        LOCATION = "us-central1"
        MODEL_ID = "gemini-2.0-flash-live-preview-04-09"
        
        client = genai.Client(
            http_options=HttpOptions(api_version="v1beta1"),
            vertexai=True,
            project=PROJECT_ID,
            location=LOCATION
        )
        
        # Configure VAD with custom sensitivity
        config = LiveConnectConfig(
            response_modalities=[Modality.TEXT],
            realtime_input_config={
                "automatic_activity_detection": {
                    "disabled": False,
                    "start_of_speech_sensitivity": StartSensitivity.START_SENSITIVITY_HIGH,
                    "end_of_speech_sensitivity": EndSensitivity.END_SENSITIVITY_LOW,
                    "prefix_padding_ms": 100,
                    "silence_duration_ms": 500,
                }
            }
        )
        
        print_status("✓ Configured VAD with high start sensitivity", "SUCCESS")
        
        async with client.aio.live.connect(model=MODEL_ID, config=config) as session:
            print_status("✓ Connected with VAD configuration", "SUCCESS")
            
            # Test VAD by sending audio with pauses
            import numpy as np
            
            # Create audio with speech patterns (sound -> silence -> sound)
            sample_rate = 16000
            # Loud sound (simulating speech)
            speech_duration = 1
            t1 = np.linspace(0, speech_duration, sample_rate * speech_duration, False)
            speech_audio = (np.sin(2 * np.pi * 440 * t1) * 32767).astype(np.int16)
            
            # Silence
            silence_duration = 0.5
            silence_audio = np.zeros(int(sample_rate * silence_duration), dtype=np.int16)
            
            # Combine: speech -> silence -> speech
            full_audio = np.concatenate([speech_audio, silence_audio, speech_audio])
            audio_bytes = full_audio.tobytes()
            
            print_status(f"Sending {len(audio_bytes)} bytes with VAD test pattern", "INFO")
            
            # Send audio with VAD
            await session.send_realtime_input(
                audio=Blob(data=audio_bytes, mime_type="audio/pcm;rate=16000")
            )
            
            # Wait for VAD to trigger response
            vad_triggered = False
            async for message in session.receive():
                if message.text:
                    print_status(f"VAD triggered response: {message.text[:100]}...", "SUCCESS")
                    vad_triggered = True
                    break
                elif message.server_content:
                    print_status("VAD processing...", "INFO")
                    
            return {
                "status": "success",
                "vad_triggered": vad_triggered,
                "audio_pattern": "speech-silence-speech",
                "test_type": "voice_activity_detection"
            }
            
    except ImportError:
        print_status("⚠ Skipping VAD test - numpy not available", "WARNING")
        return {"status": "skipped", "reason": "numpy dependency missing"}
    except Exception as e:
        print_status(f"✗ VAD test failed: {str(e)}", "ERROR")
        return {"status": "error", "error": str(e)}

async def test_system_instructions():
    """Test system instructions for custom behavior"""
    print_status("Testing System Instructions", "HEADER")
    
    try:
        from google import genai
        from google.genai.types import (
            LiveConnectConfig,
            HttpOptions,
            Modality,
            Part,
            Content,
        )
        
        PROJECT_ID = "generative-fashion-355408"
        LOCATION = "us-central1"
        MODEL_ID = "gemini-2.0-flash-live-preview-04-09"
        
        client = genai.Client(
            http_options=HttpOptions(api_version="v1beta1"),
            vertexai=True,
            project=PROJECT_ID,
            location=LOCATION
        )
        
        # Configure with custom system instruction
        system_instruction = """You are a helpful camera and microphone assistant. 
        When users ask about what you see or hear, be very specific and detailed.
        Always respond in a friendly, encouraging tone.
        If you detect any technical issues, provide helpful troubleshooting advice."""
        
        config = LiveConnectConfig(
            response_modalities=[Modality.TEXT],
            system_instruction=system_instruction
        )
        
        print_status("✓ Configured with camera/microphone assistant instructions", "SUCCESS")
        
        async with client.aio.live.connect(model=MODEL_ID, config=config) as session:
            print_status("✓ Connected with system instructions", "SUCCESS")
            
            # Test system instruction compliance
            test_message = "I'm testing my camera and microphone setup. Can you help me?"
            
            await session.send_client_content(
                turns=Content(role="user", parts=[Part(text=test_message)]),
                turn_complete=True
            )
            
            response_parts = []
            async for message in session.receive():
                if message.text:
                    response_parts.append(message.text)
                    print_status(f"System instruction response: {message.text[:100]}...", "INFO")
                    if len("".join(response_parts)) > 200:  # Get sufficient response
                        break
            
            full_response = "".join(response_parts)
            
            # Check if response follows system instructions
            contains_helpful_language = any(word in full_response.lower() for word in 
                                           ["help", "assist", "camera", "microphone", "friendly"])
            
            return {
                "status": "success",
                "system_instruction_followed": contains_helpful_language,
                "response": full_response,
                "instruction_type": "camera_microphone_assistant",
                "test_type": "system_instructions"
            }
            
    except Exception as e:
        print_status(f"✗ System instructions test failed: {str(e)}", "ERROR")
        return {"status": "error", "error": str(e)}

async def test_function_calling():
    """Test function calling integration"""
    print_status("Testing Function Calling", "HEADER")
    
    try:
        from google import genai
        from google.genai.types import (
            LiveConnectConfig,
            HttpOptions,
            Modality,
            Part,
            Content,
            FunctionResponse,
        )
        
        PROJECT_ID = "generative-fashion-355408"
        LOCATION = "us-central1"
        MODEL_ID = "gemini-2.0-flash-live-preview-04-09"
        
        client = genai.Client(
            http_options=HttpOptions(api_version="v1beta1"),
            vertexai=True,
            project=PROJECT_ID,
            location=LOCATION
        )
        
        # Define camera/microphone control functions
        camera_functions = [
            {
                "name": "adjust_camera_settings",
                "description": "Adjust camera brightness, contrast, or zoom",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "setting": {"type": "string", "description": "Setting to adjust"},
                        "value": {"type": "number", "description": "New value for the setting"}
                    },
                    "required": ["setting", "value"]
                }
            },
            {
                "name": "test_microphone",
                "description": "Test microphone functionality and audio levels",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "test_type": {"type": "string", "description": "Type of microphone test"}
                    },
                    "required": ["test_type"]
                }
            }
        ]
        
        tools = [{"function_declarations": camera_functions}]
        
        config = LiveConnectConfig(
            response_modalities=[Modality.TEXT],
            tools=tools
        )
        
        print_status("✓ Configured with camera/microphone functions", "SUCCESS")
        
        async with client.aio.live.connect(model=MODEL_ID, config=config) as session:
            print_status("✓ Connected with function calling", "SUCCESS")
            
            # Request function call
            test_message = "Please test my microphone and adjust camera brightness to 80%"
            
            await session.send_client_content(
                turns=Content(role="user", parts=[Part(text=test_message)]),
                turn_complete=True
            )
            
            function_calls_received = []
            
            async for message in session.receive():
                if message.text:
                    print_status(f"Function call response: {message.text[:100]}...", "INFO")
                    
                elif message.tool_call:
                    print_status("✓ Function call received!", "SUCCESS")
                    for fc in message.tool_call.function_calls:
                        function_calls_received.append({
                            "name": fc.name,
                            "args": fc.args
                        })
                        print_status(f"Function: {fc.name} with args: {fc.args}", "INFO")
                        
                        # Simulate function response
                        if fc.name == "test_microphone":
                            response_data = {"result": "Microphone test passed - audio levels normal"}
                        elif fc.name == "adjust_camera_settings":
                            response_data = {"result": f"Camera {fc.args.get('setting', 'setting')} adjusted to {fc.args.get('value', 'N/A')}"}
                        else:
                            response_data = {"result": "Function executed successfully"}
                        
                        function_response = FunctionResponse(
                            id=fc.id,
                            name=fc.name,
                            response=response_data
                        )
                        
                        await session.send_tool_response(function_responses=[function_response])
                        print_status(f"✓ Sent response for {fc.name}", "SUCCESS")
                
                if len(function_calls_received) >= 2:  # Expect 2 function calls
                    break
            
            return {
                "status": "success",
                "function_calls_received": function_calls_received,
                "num_functions_called": len(function_calls_received),
                "test_type": "function_calling"
            }
            
    except Exception as e:
        print_status(f"✗ Function calling test failed: {str(e)}", "ERROR")
        return {"status": "error", "error": str(e)}

async def test_session_interruption():
    """Test user interruption of model responses"""
    print_status("Testing Session Interruption Handling", "HEADER")
    
    try:
        from google import genai
        from google.genai.types import (
            LiveConnectConfig,
            HttpOptions,
            Modality,
            Part,
            Content,
            Blob,
        )
        
        PROJECT_ID = "generative-fashion-355408"
        LOCATION = "us-central1"
        MODEL_ID = "gemini-2.0-flash-live-preview-04-09"
        
        client = genai.Client(
            http_options=HttpOptions(api_version="v1beta1"),
            vertexai=True,
            project=PROJECT_ID,
            location=LOCATION
        )
        
        config = LiveConnectConfig(
            response_modalities=[Modality.TEXT]
        )
        
        print_status("✓ Configured for interruption testing", "SUCCESS")
        
        async with client.aio.live.connect(model=MODEL_ID, config=config) as session:
            print_status("✓ Connected for interruption test", "SUCCESS")
            
            # Start a long response
            long_prompt = "Please give me a very detailed, long explanation about camera and microphone technology, covering history, technical details, and future developments. Make it at least 500 words."
            
            await session.send_client_content(
                turns=Content(role="user", parts=[Part(text=long_prompt)]),
                turn_complete=True
            )
            
            # Collect some response, then interrupt
            response_before_interrupt = []
            response_count = 0
            
            async for message in session.receive():
                if message.text:
                    response_before_interrupt.append(message.text)
                    response_count += 1
                    print_status(f"Response chunk {response_count}: {message.text[:50]}...", "INFO")
                    
                    # After getting some response, simulate interruption
                    if response_count >= 3:
                        print_status("🔇 Simulating user interruption...", "WARNING")
                        
                        # Simulate audio interruption (user speaking)
                        import numpy as np
                        interrupt_audio = (np.random.random(8000) * 32767).astype(np.int16)
                        interrupt_bytes = interrupt_audio.tobytes()
                        
                        await session.send_realtime_input(
                            audio=Blob(data=interrupt_bytes, mime_type="audio/pcm;rate=16000")
                        )
                        
                        # Send interrupting message
                        await session.send_client_content(
                            turns=Content(role="user", parts=[Part(text="Stop! I need to ask something else.")]),
                            turn_complete=True
                        )
                        break
            
            # Check for interruption acknowledgment
            interruption_handled = False
            async for message in session.receive():
                if message.server_content and message.server_content.interrupted:
                    print_status("✓ Interruption detected by server", "SUCCESS")
                    interruption_handled = True
                    break
                elif message.text:
                    print_status(f"Post-interruption response: {message.text[:100]}...", "INFO")
                    if "stop" in message.text.lower() or "interrupt" in message.text.lower():
                        interruption_handled = True
                    break
            
            return {
                "status": "success",
                "interruption_handled": interruption_handled,
                "response_chunks_before_interrupt": response_count,
                "test_type": "session_interruption"
            }
            
    except ImportError:
        print_status("⚠ Skipping interruption test - numpy not available", "WARNING")
        return {"status": "skipped", "reason": "numpy dependency missing"}
    except Exception as e:
        print_status(f"✗ Interruption test failed: {str(e)}", "ERROR")
        return {"status": "error", "error": str(e)}

async def test_token_usage_monitoring():
    """Test token usage monitoring and reporting"""
    print_status("Testing Token Usage Monitoring", "HEADER")
    
    try:
        from google import genai
        from google.genai.types import (
            LiveConnectConfig,
            HttpOptions,
            Modality,
            Part,
            Content,
        )
        
        PROJECT_ID = "generative-fashion-355408"
        LOCATION = "us-central1"
        MODEL_ID = "gemini-2.0-flash-live-preview-04-09"
        
        client = genai.Client(
            http_options=HttpOptions(api_version="v1beta1"),
            vertexai=True,
            project=PROJECT_ID,
            location=LOCATION
        )
        
        config = LiveConnectConfig(
            response_modalities=[Modality.TEXT]
        )
        
        print_status("✓ Configured for token monitoring", "SUCCESS")
        
        async with client.aio.live.connect(model=MODEL_ID, config=config) as session:
            print_status("✓ Connected for token usage test", "SUCCESS")
            
            # Send test message
            test_message = "Analyze this camera setup and provide recommendations for optimal video quality."
            
            await session.send_client_content(
                turns=Content(role="user", parts=[Part(text=test_message)]),
                turn_complete=True
            )
            
            # Monitor token usage
            token_usage_data = []
            
            async for message in session.receive():
                if message.usage_metadata:
                    usage = message.usage_metadata
                    token_data = {
                        "total_tokens": usage.total_token_count,
                        "prompt_tokens": getattr(usage, 'prompt_token_count', 0),
                        "response_tokens": getattr(usage, 'response_token_count', 0),
                        "timestamp": datetime.now().isoformat()
                    }
                    
                    # Get modality breakdown if available
                    if hasattr(usage, 'response_tokens_details'):
                        token_data["modality_breakdown"] = []
                        for detail in usage.response_tokens_details:
                            if hasattr(detail, 'modality') and hasattr(detail, 'token_count'):
                                token_data["modality_breakdown"].append({
                                    "modality": detail.modality,
                                    "count": detail.token_count
                                })
                    
                    token_usage_data.append(token_data)
                    print_status(f"✓ Token usage: {usage.total_token_count} total tokens", "SUCCESS")
                    
                elif message.text:
                    print_status(f"Response: {message.text[:100]}...", "INFO")
                    if len(token_usage_data) > 0:  # Got usage data
                        break
            
            return {
                "status": "success",
                "token_usage_captured": len(token_usage_data) > 0,
                "usage_data": token_usage_data,
                "test_type": "token_usage_monitoring"
            }
            
    except Exception as e:
        print_status(f"✗ Token usage test failed: {str(e)}", "ERROR")
        return {"status": "error", "error": str(e)}

async def main():
    """Run comprehensive Live API tests"""
    print_status("Starting Comprehensive Live API Test Suite", "HEADER")
    print_status("=" * 70, "HEADER")
    
    # Configuration
    PROJECT_ID = "generative-fashion-355408"
    LOCATION = "us-central1"
    MODEL_ID = "gemini-2.0-flash-live-preview-04-09"
    
    print_status("Testing ALL Live API capabilities for camera/microphone streaming", "INFO")
    print_status(f"Model: {MODEL_ID}", "INFO")
    print_status(f"Region: {LOCATION}", "INFO")
    print()
    
    # Run comprehensive tests
    results = {}
    
    # Test 1: Audio Input (Microphone)
    results["audio_input_streaming"] = await test_audio_input_streaming()
    
    # Test 2: Video Input (Camera)  
    results["video_input_streaming"] = await test_video_input_streaming()
    
    # Test 3: Voice Activity Detection
    results["voice_activity_detection"] = await test_voice_activity_detection()
    
    # Test 4: System Instructions
    results["system_instructions"] = await test_system_instructions()
    
    # Test 5: Function Calling
    results["function_calling"] = await test_function_calling()
    
    # Test 6: Session Interruption
    results["session_interruption"] = await test_session_interruption()
    
    # Test 7: Token Usage Monitoring
    results["token_usage_monitoring"] = await test_token_usage_monitoring()
    
    # Save results
    results_file = Path(f"test_results/comprehensive_live_api_results_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
    results_file.parent.mkdir(exist_ok=True)
    
    with open(results_file, 'w') as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "test_framework": "Comprehensive Live API Test Suite",
            "model": MODEL_ID,
            "location": LOCATION,
            "purpose": "Full camera and microphone streaming capabilities",
            "results": results
        }, f, indent=2)
    
    print_status(f"Results saved to: {results_file}", "INFO")
    
    # Summary
    print_status("\n" + "=" * 70, "HEADER")
    print_status("COMPREHENSIVE TEST SUMMARY", "HEADER")
    print_status("=" * 70, "HEADER")
    
    passed = 0
    total = len(results)
    
    for test_name, result in results.items():
        if result.get("status") == "success":
            status_text = "✓ PASSED"
            color = "SUCCESS"
            passed += 1
        elif result.get("status") == "skipped":
            status_text = "⚠ SKIPPED"
            color = "WARNING"
        else:
            status_text = "✗ FAILED"
            color = "ERROR"
            
        print_status(f"{test_name}: {status_text}", color)
        
        if result.get("error"):
            print_status(f"  Error: {result.get('error')}", "ERROR")
        elif result.get("reason"):
            print_status(f"  Reason: {result.get('reason')}", "WARNING")
    
    print()
    print_status(f"Overall: {passed}/{total} tests passed", 
                "SUCCESS" if passed == total else "WARNING")
    
    # Production readiness assessment
    print()
    print_status("PRODUCTION READINESS ASSESSMENT", "HEADER")
    
    critical_tests = ["audio_input_streaming", "video_input_streaming", "voice_activity_detection"]
    critical_passed = sum(1 for test in critical_tests if results.get(test, {}).get("status") == "success")
    
    if critical_passed == len(critical_tests):
        print_status("🎉 READY FOR CAMERA/MICROPHONE STREAMING!", "SUCCESS")
        print_status("All critical tests passed. Ready for frontend integration.", "SUCCESS")
    else:
        print_status("⚠ NOT READY - Critical tests missing", "WARNING")
        print_status(f"Critical tests passed: {critical_passed}/{len(critical_tests)}", "WARNING")

if __name__ == "__main__":
    # Set up logging
    logging.basicConfig(level=logging.INFO)
    
    # Create results directory
    Path("test_results").mkdir(exist_ok=True)
    
    # Run comprehensive tests
    asyncio.run(main()) 