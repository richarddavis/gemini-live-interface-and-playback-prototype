#!/usr/bin/env python3
"""
Vertex AI Live API Alternative Methods Test
==========================================

Before concluding that Vertex AI doesn't support audio/video input,
let's test different approaches to be absolutely sure.

Tests:
1. Different API versions (v1alpha vs v1beta1)
2. Different model names
3. Different parameter formats
4. Different regions
5. Different configuration approaches
"""

import asyncio
import json
import os
import logging
from datetime import datetime
from pathlib import Path

# Color output
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'

def print_status(message, status="INFO"):
    colors = {
        "INFO": Colors.OKBLUE,
        "SUCCESS": Colors.OKGREEN,
        "WARNING": Colors.WARNING,
        "ERROR": Colors.FAIL,
        "HEADER": Colors.HEADER
    }
    color = colors.get(status, Colors.OKBLUE)
    print(f"{color}{status}: {message}{Colors.ENDC}")

async def test_v1alpha_api():
    """Test with v1alpha API version"""
    print_status("Testing Vertex AI with v1alpha API", "HEADER")
    
    try:
        from google import genai
        from google.genai.types import (
            LiveConnectConfig,
            HttpOptions,
            Modality,
            Blob,
        )
        
        # Try v1alpha specifically
        client = genai.Client(
            http_options=HttpOptions(api_version="v1alpha"),  # Different API version
            vertexai=True,
            project="generative-fashion-355408",
            location="us-central1"
        )
        
        config = LiveConnectConfig(response_modalities=[Modality.TEXT])
        
        async with client.aio.live.connect(
            model="gemini-2.0-flash-live-preview-04-09",
            config=config
        ) as session:
            print_status("✓ Connected with v1alpha", "SUCCESS")
            
            # Try audio with v1alpha
            import numpy as np
            audio_data = (np.random.random(16000) * 32767).astype(np.int16)
            audio_bytes = audio_data.tobytes()
            
            await session.send_realtime_input(
                audio=Blob(data=audio_bytes, mime_type="audio/pcm;rate=16000")
            )
            
            print_status("✓ Audio sent successfully with v1alpha!", "SUCCESS")
            return {"status": "success", "api_version": "v1alpha"}
            
    except Exception as e:
        print_status(f"v1alpha failed: {str(e)}", "ERROR")
        return {"status": "error", "error": str(e), "api_version": "v1alpha"}

async def test_different_models():
    """Test different model names that might support audio/video"""
    print_status("Testing Different Model Names", "HEADER")
    
    # Possible model names from documentation
    models_to_test = [
        "gemini-2.0-flash-live-001",  # Standard version
        "gemini-2.0-flash-live-preview-04-09",  # Preview version
        "gemini-2.5-flash-preview-native-audio-dialog",  # Native audio
        "models/gemini-2.0-flash-live-001",  # With models/ prefix
    ]
    
    results = {}
    
    for model_name in models_to_test:
        try:
            from google import genai
            from google.genai.types import LiveConnectConfig, Modality, Blob
            
            client = genai.Client(
                http_options=HttpOptions(api_version="v1beta1"),
                vertexai=True,
                project="generative-fashion-355408",
                location="us-central1"
            )
            
            config = LiveConnectConfig(response_modalities=[Modality.TEXT])
            
            print_status(f"Testing model: {model_name}", "INFO")
            
            async with client.aio.live.connect(model=model_name, config=config) as session:
                # Quick audio test
                import numpy as np
                audio_data = np.zeros(8000, dtype=np.int16)
                audio_bytes = audio_data.tobytes()
                
                await session.send_realtime_input(
                    audio=Blob(data=audio_bytes, mime_type="audio/pcm;rate=16000")
                )
                
                print_status(f"✓ {model_name} accepts audio!", "SUCCESS")
                results[model_name] = "success"
                
        except Exception as e:
            error_msg = str(e)
            print_status(f"✗ {model_name}: {error_msg[:100]}...", "ERROR")
            results[model_name] = error_msg
    
    return results

async def test_different_regions():
    """Test different regions to see if audio/video support varies"""
    print_status("Testing Different Regions", "HEADER")
    
    regions_to_test = [
        "us-central1",
        "us-east1", 
        "us-west1",
        "europe-west1",
        "global"
    ]
    
    results = {}
    
    for region in regions_to_test:
        try:
            from google import genai
            from google.genai.types import LiveConnectConfig, Modality, Blob, HttpOptions
            
            client = genai.Client(
                http_options=HttpOptions(api_version="v1beta1"),
                vertexai=True,
                project="generative-fashion-355408",
                location=region
            )
            
            config = LiveConnectConfig(response_modalities=[Modality.TEXT])
            
            print_status(f"Testing region: {region}", "INFO")
            
            async with client.aio.live.connect(
                model="gemini-2.0-flash-live-preview-04-09",
                config=config
            ) as session:
                # Quick audio test
                import numpy as np
                audio_data = np.zeros(4000, dtype=np.int16)
                audio_bytes = audio_data.tobytes()
                
                await session.send_realtime_input(
                    audio=Blob(data=audio_bytes, mime_type="audio/pcm;rate=16000")
                )
                
                print_status(f"✓ {region} supports audio!", "SUCCESS")
                results[region] = "success"
                
        except Exception as e:
            error_msg = str(e)
            print_status(f"✗ {region}: {error_msg[:100]}...", "ERROR") 
            results[region] = error_msg
    
    return results

async def test_different_audio_methods():
    """Test different ways to send audio in Vertex AI"""
    print_status("Testing Different Audio Input Methods", "HEADER")
    
    try:
        from google import genai
        from google.genai.types import (
            LiveConnectConfig,
            HttpOptions,
            Modality,
            Blob,
            Content,
            Part,
        )
        
        client = genai.Client(
            http_options=HttpOptions(api_version="v1beta1"),
            vertexai=True,
            project="generative-fashion-355408",
            location="us-central1"
        )
        
        config = LiveConnectConfig(response_modalities=[Modality.TEXT])
        
        async with client.aio.live.connect(
            model="gemini-2.0-flash-live-preview-04-09",
            config=config
        ) as session:
            
            import numpy as np
            audio_data = np.zeros(8000, dtype=np.int16)
            audio_bytes = audio_data.tobytes()
            
            methods_to_test = [
                # Method 1: send_realtime_input with 'audio' parameter
                ("send_realtime_input(audio=...)", lambda: session.send_realtime_input(
                    audio=Blob(data=audio_bytes, mime_type="audio/pcm;rate=16000")
                )),
                
                # Method 2: send_realtime_input with 'media_chunks'
                ("send_realtime_input(media_chunks=...)", lambda: session.send_realtime_input(
                    media_chunks=[Blob(data=audio_bytes, mime_type="audio/pcm;rate=16000")]
                )),
                
                # Method 3: send_client_content with audio part
                ("send_client_content with audio part", lambda: session.send_client_content(
                    turns=Content(role="user", parts=[
                        Part(inline_data=Blob(data=audio_bytes, mime_type="audio/pcm;rate=16000"))
                    ])
                )),
            ]
            
            results = {}
            
            for method_name, method_func in methods_to_test:
                try:
                    print_status(f"Trying: {method_name}", "INFO")
                    await method_func()
                    print_status(f"✓ {method_name} worked!", "SUCCESS")
                    results[method_name] = "success"
                except Exception as e:
                    print_status(f"✗ {method_name}: {str(e)[:100]}...", "ERROR")
                    results[method_name] = str(e)
            
            return results
            
    except Exception as e:
        return {"error": str(e)}

async def test_native_audio_models():
    """Test native audio models that might have different capabilities"""
    print_status("Testing Native Audio Models", "HEADER")
    
    native_models = [
        "gemini-2.5-flash-preview-native-audio-dialog",
        "gemini-2.5-flash-exp-native-audio-thinking-dialog"
    ]
    
    results = {}
    
    for model in native_models:
        try:
            from google import genai
            from google.genai.types import LiveConnectConfig, Modality, Blob, HttpOptions
            
            client = genai.Client(
                http_options=HttpOptions(api_version="v1alpha"),  # Native models might need v1alpha
                vertexai=True,
                project="generative-fashion-355408",
                location="us-central1"
            )
            
            config = LiveConnectConfig(response_modalities=[Modality.AUDIO])
            
            print_status(f"Testing native model: {model}", "INFO")
            
            async with client.aio.live.connect(model=model, config=config) as session:
                # Test audio input
                import numpy as np
                audio_data = np.zeros(8000, dtype=np.int16)
                audio_bytes = audio_data.tobytes()
                
                await session.send_realtime_input(
                    audio=Blob(data=audio_bytes, mime_type="audio/pcm;rate=16000")
                )
                
                print_status(f"✓ {model} accepts audio input!", "SUCCESS")
                results[model] = "success"
                
        except Exception as e:
            error_msg = str(e)
            print_status(f"✗ {model}: {error_msg[:100]}...", "ERROR")
            results[model] = error_msg
    
    return results

async def main():
    """Run thorough Vertex AI Live API tests"""
    print_status("Comprehensive Vertex AI Live API Investigation", "HEADER")
    print_status("=" * 70, "HEADER")
    
    print_status("Before concluding Vertex AI can't do audio/video input,", "INFO")
    print_status("let's test every possible approach...", "INFO")
    print()
    
    all_results = {}
    
    # Test 1: Different API versions
    print_status("TEST 1: Different API Versions", "HEADER")
    all_results["api_versions"] = await test_v1alpha_api()
    
    # Test 2: Different models
    print_status("\nTEST 2: Different Model Names", "HEADER") 
    all_results["models"] = await test_different_models()
    
    # Test 3: Different regions
    print_status("\nTEST 3: Different Regions", "HEADER")
    all_results["regions"] = await test_different_regions()
    
    # Test 4: Different audio methods
    print_status("\nTEST 4: Different Audio Input Methods", "HEADER")
    all_results["audio_methods"] = await test_different_audio_methods()
    
    # Test 5: Native audio models
    print_status("\nTEST 5: Native Audio Models", "HEADER")
    all_results["native_models"] = await test_native_audio_models()
    
    # Save results
    results_file = Path(f"test_results/vertex_ai_alternatives_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
    results_file.parent.mkdir(exist_ok=True)
    
    with open(results_file, 'w') as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "purpose": "Thorough investigation of Vertex AI Live API audio/video capabilities",
            "results": all_results
        }, f, indent=2)
    
    # Analysis
    print_status("\n" + "=" * 70, "HEADER")
    print_status("INVESTIGATION RESULTS", "HEADER")
    print_status("=" * 70, "HEADER")
    
    success_found = False
    for category, results in all_results.items():
        if isinstance(results, dict):
            for item, result in results.items():
                if result == "success" or "success" in str(result):
                    print_status(f"✓ SUCCESS FOUND: {category} - {item}", "SUCCESS")
                    success_found = True
    
    if success_found:
        print_status("\n🎉 ALTERNATIVE METHOD FOUND!", "SUCCESS")
        print_status("Vertex AI CAN support audio/video input with the right configuration!", "SUCCESS")
    else:
        print_status("\n❌ NO ALTERNATIVES FOUND", "ERROR")
        print_status("Confirms that Vertex AI Live API doesn't support audio/video input", "ERROR")
        print_status("Google AI Studio API is indeed the only way forward", "ERROR")
    
    print_status(f"\nDetailed results saved to: {results_file}", "INFO")

if __name__ == "__main__":
    # Set up environment
    os.environ["GOOGLE_CLOUD_PROJECT"] = "generative-fashion-355408"
    os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "True"
    
    asyncio.run(main()) 