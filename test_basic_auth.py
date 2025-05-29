#!/usr/bin/env python3
"""
Basic Authentication Test for Vertex AI
=======================================

Test if our service account can authenticate and make basic API calls
to Vertex AI before testing the Live API.
"""

import os
import asyncio
from pathlib import Path

# Colors for output
class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    ENDC = '\033[0m'

def print_status(message, status="INFO"):
    colors = {"INFO": Colors.BLUE, "SUCCESS": Colors.GREEN, "ERROR": Colors.RED, "WARNING": Colors.YELLOW}
    color = colors.get(status, Colors.BLUE)
    print(f"{color}{status}: {message}{Colors.ENDC}")

async def test_basic_auth():
    """Test basic Vertex AI authentication"""
    print_status("Testing Basic Vertex AI Authentication", "INFO")
    
    try:
        # Set up environment
        project_id = "generative-fashion-355408"
        location = "us-central1"  # Try a more standard location first
        
        os.environ["GOOGLE_CLOUD_PROJECT"] = project_id
        os.environ["GOOGLE_CLOUD_LOCATION"] = location
        os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "True"
        
        print_status(f"Project: {project_id}, Location: {location}", "INFO")
        
        # Import and test the SDK
        from google import genai
        from google.genai.types import HttpOptions, Content, Part
        
        print_status("✓ Successfully imported google-genai SDK", "SUCCESS")
        
        # Create client
        client = genai.Client(
            http_options=HttpOptions(api_version="v1"),  # Try v1 instead of v1beta1
            vertexai=True,
            project=project_id,
            location=location
        )
        print_status("✓ Created genai.Client", "SUCCESS")
        
        # Test with standard Gemini model (not Live API)
        model_id = "gemini-2.0-flash-001"  # Standard model, not Live API
        print_status(f"Testing with standard model: {model_id}", "INFO")
        
        # Simple text generation test
        response = await client.aio.models.generate_content(
            model=model_id,
            contents=[Content(role="user", parts=[Part(text="Say hello in one word.")])]
        )
        
        if response.text:
            print_status(f"✓ Basic API test PASSED. Response: {response.text.strip()}", "SUCCESS")
            return {"status": "success", "response": response.text.strip(), "model": model_id}
        else:
            print_status("✗ No response received", "ERROR")
            return {"status": "failed", "error": "No response"}
            
    except Exception as e:
        print_status(f"✗ Basic auth test failed: {str(e)}", "ERROR")
        return {"status": "error", "error": str(e)}

async def test_live_api_auth():
    """Test Live API authentication specifically"""
    print_status("Testing Live API Authentication", "INFO")
    
    try:
        from google import genai
        from google.genai.types import (
            Content,
            LiveConnectConfig,
            HttpOptions,
            Modality,
            Part,
        )
        
        # Set up environment - TRY US-CENTRAL1 FOR LIVE API
        project_id = "generative-fashion-355408"
        location = "us-central1"  # Changed from global to us-central1
        
        os.environ["GOOGLE_CLOUD_PROJECT"] = project_id
        os.environ["GOOGLE_CLOUD_LOCATION"] = location
        os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "True"
        
        client = genai.Client(
            http_options=HttpOptions(api_version="v1beta1"),
            vertexai=True,
            project=project_id,
            location=location
        )
        
        model_id = "gemini-2.0-flash-live-preview-04-09"
        config = LiveConnectConfig(response_modalities=[Modality.TEXT])
        
        print_status(f"Attempting Live API connection with {model_id} in {location}", "INFO")
        
        # Just try to connect (don't send messages yet)
        async with client.aio.live.connect(model=model_id, config=config) as session:
            print_status("✓ Live API connection established successfully!", "SUCCESS")
            return {"status": "success", "model": model_id, "location": location}
            
    except Exception as e:
        print_status(f"✗ Live API auth test failed: {str(e)}", "ERROR")
        return {"status": "error", "error": str(e)}

async def main():
    """Run authentication tests"""
    print_status("Starting Authentication Tests", "INFO")
    print("=" * 60)
    
    # Test 1: Basic API
    basic_result = await test_basic_auth()
    print()
    
    # Test 2: Live API (only if basic works)
    if basic_result.get("status") == "success":
        live_result = await test_live_api_auth()
    else:
        print_status("Skipping Live API test due to basic auth failure", "WARNING")
        live_result = {"status": "skipped", "reason": "basic auth failed"}
    
    print()
    print("=" * 60)
    print_status("AUTHENTICATION TEST SUMMARY", "INFO")
    print("=" * 60)
    
    basic_status = "✓ PASSED" if basic_result.get("status") == "success" else "✗ FAILED"
    live_status = "✓ PASSED" if live_result.get("status") == "success" else "✗ FAILED" if live_result.get("status") != "skipped" else "⚠ SKIPPED"
    
    print_status(f"Basic API Auth: {basic_status}", "SUCCESS" if basic_result.get("status") == "success" else "ERROR")
    if basic_result.get("error"):
        print_status(f"  Error: {basic_result.get('error')}", "ERROR")
    
    print_status(f"Live API Auth:  {live_status}", "SUCCESS" if live_result.get("status") == "success" else "ERROR")
    if live_result.get("error"):
        print_status(f"  Error: {live_result.get('error')}", "ERROR")
    
    # Save results
    results_file = Path(f"test_results/auth_test_results.json")
    results_file.parent.mkdir(exist_ok=True)
    
    import json
    with open(results_file, 'w') as f:
        json.dump({
            "basic_api": basic_result,
            "live_api": live_result
        }, f, indent=2)
    
    print_status(f"Results saved to: {results_file}", "INFO")

if __name__ == "__main__":
    asyncio.run(main()) 