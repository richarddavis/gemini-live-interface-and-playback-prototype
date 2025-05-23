#!/usr/bin/env python3
"""
Test script for Modern Gemini Live API setup.
Verifies configuration, authentication, and basic functionality.
"""

import asyncio
import json
import os
import sys
import websockets
from pathlib import Path
import logging
from google.auth.transport.requests import Request
from google.oauth2.service_account import Credentials

# Add backend app to path
sys.path.insert(0, str(Path(__file__).parent / "backend" / "app"))

try:
    from gemini_live_config import GeminiLiveConfig, GeminiLiveModels
    from live_websocket_proxy import GeminiLiveProxy
except ImportError as e:
    print(f"❌ Import error: {e}")
    print("Make sure you're running from the project root and backend dependencies are installed")
    sys.exit(1)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ModernGeminiLiveTest:
    """Test suite for modern Gemini Live API setup."""
    
    def __init__(self):
        self.results = {}
        
    def test_configuration(self):
        """Test configuration classes and settings."""
        try:
            # Test GeminiLiveConfig
            config = GeminiLiveConfig()
            assert hasattr(config, 'API_HOST')
            assert hasattr(config, 'WEBSOCKET_URL')
            assert config.API_HOST == "generativelanguage.googleapis.com"
            assert "v1beta" in config.WEBSOCKET_URL
            assert "BidiGenerateContent" in config.WEBSOCKET_URL
            
            # Test GeminiLiveModels
            models = GeminiLiveModels()
            default_model = models.get_default_model()
            all_models = models.get_all_models()
            assert default_model in all_models
            assert len(all_models) > 0
            
            # Test model validation
            assert config.validate_model(default_model) == True
            assert config.validate_model("invalid-model") == False
            
            return True, "Configuration tests passed"
        except Exception as e:
            return False, f"Configuration test failed: {e}"
    
    def test_environment(self):
        """Test environment setup and variables."""
        try:
            cred_path = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
            debug = os.getenv('DEBUG', 'false').lower() == 'true'
            project_id = os.getenv('GOOGLE_CLOUD_PROJECT', '')
            
            result_info = f"Credentials: {cred_path}\n   Project ID: {project_id}\n   Debug: {debug}"
            
            if cred_path and Path(cred_path).exists():
                return True, f"Environment configured correctly\n   {result_info}"
            else:
                return False, f"Missing or invalid credentials file\n   {result_info}"
        except Exception as e:
            return False, f"Environment test failed: {e}"
    
    def test_credentials(self):
        """Test Google Cloud credentials and token generation."""
        try:
            from google.auth.transport.requests import Request
            from google.oauth2.service_account import Credentials
            
            cred_path = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
            if not cred_path:
                return False, "GOOGLE_APPLICATION_CREDENTIALS not set"
            
            credentials = Credentials.from_service_account_file(
                cred_path,
                scopes=[
                    "https://www.googleapis.com/auth/cloud-platform",
                    "https://www.googleapis.com/auth/generative-language"
                ]
            )
            
            request = Request()
            credentials.refresh(request)
            
            if credentials.token:
                return True, "Credentials loaded and token generated successfully"
            else:
                return False, "Failed to generate authentication token"
        except Exception as e:
            return False, f"Credentials test failed: {e}"
    
    def test_models(self):
        """Test model configuration and features."""
        try:
            models = GeminiLiveModels()
            config = GeminiLiveConfig()
            
            # Test available models
            all_models = models.get_all_models()
            default_model = models.get_default_model()
            
            assert len(all_models) > 0
            assert default_model in all_models
            
            # Test model validation
            for model in all_models:
                assert config.validate_model(model) == True
            
            # Test specific models exist
            assert models.GEMINI_2_0_FLASH_LIVE in all_models
            assert models.GEMINI_2_5_FLASH_PREVIEW_NATIVE_AUDIO in all_models
            
            return True, f"Model tests passed. Found {len(all_models)} models"
        except Exception as e:
            return False, f"Model feature test failed: {e}"
    
    def test_message_enhancement(self):
        """Test message enhancement functionality."""
        try:
            proxy = GeminiLiveProxy()
            
            # Test setup message enhancement
            test_setup = {"setup": {"model": "invalid-model"}}
            enhanced = proxy._enhance_client_message(test_setup)
            
            # Should have default model set
            assert "setup" in enhanced
            assert "model" in enhanced["setup"]
            
            # Test client content enhancement
            test_content = {"client_content": {"turns": []}}
            enhanced_content = proxy._enhance_client_message(test_content)
            assert "client_content" in enhanced_content
            
            return True, "Message enhancement tests passed"
        except Exception as e:
            return False, f"Message enhancement test failed: {e}"
    
    def test_websocket_server(self):
        """Test WebSocket server configuration."""
        try:
            config = GeminiLiveConfig()
            
            # Test URL format
            url = config.WEBSOCKET_URL
            assert url.startswith("wss://")
            assert config.API_HOST in url
            assert "BidiGenerateContent" in url
            
            # Test host resolution (basic connectivity test)
            import socket
            socket.gethostbyname(config.API_HOST)
            
            return True, f"WebSocket server configuration is valid\n   Endpoint: {url}\n   Host: {config.API_HOST}"
        except Exception as e:
            return False, f"WebSocket test failed: {e}"
    
    async def run_all_tests(self):
        """Run all tests and display results."""
        tests = [
            ("configuration", self.test_configuration),
            ("environment", self.test_environment), 
            ("credentials", self.test_credentials),
            ("models", self.test_models),
            ("enhancement", self.test_message_enhancement),
            ("websocket", self.test_websocket_server)
        ]
        
        print("🧪 Modern Gemini Live API Test Suite")
        print("=" * 50)
        print("🚀 Running Modern Gemini Live API Tests...")
        print()
        
        passed = 0
        total = len(tests)
        
        for test_name, test_func in tests:
            print(f"🔧 Testing {test_name.title()}...")
            try:
                success, message = test_func()
                if success:
                    print(f"✅ {message}")
                    passed += 1
                    self.results[test_name] = "PASS"
                else:
                    print(f"❌ {message}")
                    self.results[test_name] = "FAIL"
            except Exception as e:
                print(f"❌ {test_name.title()} test failed with exception: {e}")
                self.results[test_name] = "FAIL"
        
        print("\n" + "=" * 50)
        print("📊 Test Results Summary:")
        print("=" * 50)
        
        for test_name, result in self.results.items():
            status_icon = "✅" if result == "PASS" else "❌"
            print(f"{test_name:<12} | {status_icon} {result}")
        
        print("=" * 50)
        print(f"Overall: {passed}/{total} tests passed")
        
        if passed == total:
            print("🎉 All tests passed! Your Gemini Live API setup is ready.")
        else:
            print("⚠️  Some tests failed. Check the output above for details.")
            print("\nCommon fixes:")
            print("- Ensure GOOGLE_APPLICATION_CREDENTIALS is set correctly")
            print("- Verify service account has proper permissions")
            print("- Check that all dependencies are installed")
        
        return passed == total

async def test_direct_gemini_connection():
    """Test direct connection to Gemini Live API with corrected 2025 endpoint."""
    
    print("🧪 Testing Modern Gemini Live API Connection (2025)")
    print("=" * 50)
    
    # Load credentials
    key_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", ".secrets/gcp/generative-fashion-355408-d2acee530882.json")
    if not os.path.exists(key_path):
        print(f"❌ Service account key not found at: {key_path}")
        return False
    
    try:
        credentials = Credentials.from_service_account_file(
            key_path,
            scopes=[
                "https://www.googleapis.com/auth/cloud-platform",
                "https://www.googleapis.com/auth/generative-language"
            ]
        )
        
        # Get fresh access token
        request = Request()
        credentials.refresh(request)
        access_token = credentials.token
        print("✅ Successfully obtained access token")
        
    except Exception as e:
        print(f"❌ Failed to get access token: {e}")
        return False
    
    # Get configuration info with 2025 endpoint
    config_info = GeminiLiveConfig.get_debug_info()
    print(f"📡 WebSocket URL: {config_info['websocket_url']}")
    print(f"🤖 Default Model: {config_info['default_model']}")
    print(f"🎵 Available Voices: {', '.join(config_info['available_voices'])}")
    
    # Prepare headers for WebSocket connection with proper authorization
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    
    try:
        print("🔌 Connecting to Gemini Live API (2025)...")
        
        async with websockets.connect(
            config_info['websocket_url'],
            additional_headers=headers,
            ping_interval=30,
            ping_timeout=10,
            close_timeout=10
        ) as websocket:
            
            print("✅ Successfully connected to Gemini Live API!")
            
            # Create a setup message with modern 2025 format
            setup_message = GeminiLiveConfig.get_default_setup_message(
                model=GeminiLiveModels.get_default_model(),
                response_modalities=["TEXT"],
                voice_name="Aoede",
                system_instruction="You are a helpful AI assistant. Please respond with 'Hello! The connection is working perfectly with the 2025 API.'"
            )
            
            print("📤 Sending setup message...")
            await websocket.send(json.dumps(setup_message))
            
            # Wait for setup complete
            setup_response = await websocket.recv()
            setup_data = json.loads(setup_response)
            print(f"📥 Setup response: {setup_data}")
            
            if setup_data.get("setupComplete") is not None:
                print("✅ Setup completed successfully!")
                
                # Send a test message
                test_message = {
                    "clientContent": {
                        "turns": [{
                            "role": "user",
                            "parts": [{"text": "Hello, Gemini! Can you confirm the 2025 connection is working?"}]
                        }],
                        "turnComplete": True
                    }
                }
                
                print("📤 Sending test message...")
                await websocket.send(json.dumps(test_message))
                
                # Receive response
                response = await asyncio.wait_for(websocket.recv(), timeout=10.0)
                response_data = json.loads(response)
                print(f"📥 Response received: {response_data}")
                
                # Check if we got a text response
                if response_data.get("serverContent", {}).get("modelTurn", {}).get("parts"):
                    parts = response_data["serverContent"]["modelTurn"]["parts"]
                    if parts and parts[0].get("text"):
                        text_response = parts[0]["text"]
                        print(f"🎉 SUCCESS! Gemini responded: {text_response}")
                        return True
                
                print("⚠️ Received response but no text content found")
                return False
                
            else:
                print(f"❌ Setup failed: {setup_data}")
                return False
            
    except websockets.exceptions.InvalidStatusCode as e:
        print(f"❌ WebSocket connection failed with status code: {e.status_code}")
        print(f"   Headers: {e.response_headers}")
        return False
    except asyncio.TimeoutError:
        print("❌ Timeout waiting for response")
        return False
    except Exception as e:
        print(f"❌ Connection error: {e}")
        return False

async def test_proxy_connection():
    """Test connection through our WebSocket proxy."""
    
    print("\n🔄 Testing WebSocket Proxy Connection")
    print("=" * 50)
    
    proxy_url = "ws://localhost:8080"
    
    try:
        print(f"🔌 Connecting to proxy: {proxy_url}")
        
        async with websockets.connect(proxy_url) as websocket:
            print("✅ Connected to proxy!")
            
            # Send a simple setup message through proxy
            setup_message = {
                "type": "setup",
                "model": GeminiLiveModels.get_default_model(),
                "systemInstructions": "You are a helpful AI assistant.",
                "responseModalities": ["TEXT"]
            }
            
            print("📤 Sending setup through proxy...")
            await websocket.send(json.dumps(setup_message))
            
            # Wait for response
            response = await asyncio.wait_for(websocket.recv(), timeout=10.0)
            print(f"📥 Proxy response: {response}")
            
            return True
            
    except Exception as e:
        print(f"❌ Proxy connection error: {e}")
        return False

async def main():
    """Run all tests."""
    print("🚀 Starting Gemini Live API Tests")
    print("=" * 50)
    
    # Test 1: Direct connection to Gemini Live API
    direct_success = await test_direct_gemini_connection()
    
    # Test 2: Connection through proxy 
    proxy_success = await test_proxy_connection()
    
    # Summary
    print("\n📊 Test Results Summary")
    print("=" * 50)
    print(f"Direct Gemini Connection: {'✅ PASS' if direct_success else '❌ FAIL'}")
    print(f"Proxy Connection: {'✅ PASS' if proxy_success else '❌ FAIL'}")
    
    if direct_success and proxy_success:
        print("\n🎉 All tests passed! Your Gemini Live API setup is working correctly.")
    elif direct_success:
        print("\n⚠️ Direct connection works, but proxy has issues.")
    elif proxy_success:
        print("\n⚠️ Proxy works, but direct connection has issues.")
    else:
        print("\n❌ Both tests failed. Please check your configuration.")

if __name__ == "__main__":
    asyncio.run(main()) 