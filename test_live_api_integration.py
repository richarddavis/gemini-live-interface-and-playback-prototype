#!/usr/bin/env python3
"""
Test Script for Live API Integration
===================================

This script tests the basic functionality of the Live API service
to ensure everything is working correctly.
"""

import asyncio
import os
import sys
import logging
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Add backend to path
sys.path.append('backend/app')

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_live_api_integration():
    """Test the Live API integration end-to-end."""
    
    try:
        # Import our service
        from backend.app.services.live_api_service import LiveAPIService, LiveSessionConfig
        
        # Check API key
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            print("❌ GEMINI_API_KEY not found in environment")
            print("   Get your API key from: https://aistudio.google.com/app/apikey")
            print("   Add it to your .env file: GEMINI_API_KEY=your_key_here")
            return False
        
        print("✅ API key found")
        
        # Initialize service
        print("🔧 Initializing Live API service...")
        live_service = LiveAPIService(api_key)
        
        # Test 1: Create a text-only session
        print("\n📝 Test 1: Creating text-only session...")
        text_config = LiveSessionConfig(
            session_type="text",
            voice_name="Aoede",
            language_code="en-US",
            system_instruction="You are a helpful assistant. Keep responses brief.",
            enable_camera=False,
            enable_microphone=False,
            model="gemini-2.0-flash-live-001"
        )
        
        session_id = await live_service.create_session(text_config)
        print(f"✅ Session created: {session_id}")
        
        # Test 2: Start the session
        print("\n🚀 Test 2: Starting session...")
        success = await live_service.start_session(session_id)
        if success:
            print("✅ Session started successfully")
        else:
            print("❌ Failed to start session")
            return False
        
        # Test 3: Send a text message
        print("\n💬 Test 3: Sending text message...")
        test_message = "Hello! Can you tell me what 2+2 equals?"
        response_chunks = []
        
        async for chunk in live_service.send_text_message(session_id, test_message):
            response_chunks.append(chunk)
            print(f"📨 Received: {chunk}")
        
        full_response = "".join(response_chunks)
        if full_response:
            print(f"✅ Full response: {full_response}")
        else:
            print("❌ No response received")
            return False
        
        # Test 4: Check session status
        print("\n📊 Test 4: Checking session status...")
        status = live_service.get_session_status(session_id)
        if status:
            print(f"✅ Session status: {status['status']}")
            print(f"   Config: {status['config']}")
        else:
            print("❌ Could not get session status")
        
        # Test 5: End session
        print("\n🛑 Test 5: Ending session...")
        ended = await live_service.end_session(session_id)
        if ended:
            print("✅ Session ended successfully")
        else:
            print("⚠️  Session may not have ended cleanly")
        
        print("\n🎉 All tests passed! Live API integration is working.")
        return True
        
    except ImportError as e:
        print(f"❌ Import error: {e}")
        print("   Make sure all dependencies are installed:")
        print("   pip install -r backend/requirements.txt")
        return False
        
    except Exception as e:
        print(f"❌ Test failed with error: {e}")
        logger.exception("Full error details:")
        return False

async def test_multimodal_session():
    """Test creating a multimodal session (without actually sending media)."""
    
    try:
        from backend.app.services.live_api_service import LiveAPIService, LiveSessionConfig
        
        api_key = os.getenv("GEMINI_API_KEY")
        live_service = LiveAPIService(api_key)
        
        print("\n🎥 Test: Creating multimodal session...")
        multimodal_config = LiveSessionConfig(
            session_type="multimodal",
            voice_name="Aoede",
            language_code="en-US",
            system_instruction="You can see and hear the user. Respond naturally.",
            enable_camera=True,
            enable_microphone=True,
            model="gemini-2.0-flash-live-001"
        )
        
        session_id = await live_service.create_session(multimodal_config)
        print(f"✅ Multimodal session created: {session_id}")
        
        # Start session
        success = await live_service.start_session(session_id)
        if success:
            print("✅ Multimodal session started successfully")
            
            # Clean up
            await live_service.end_session(session_id)
            print("✅ Multimodal session ended")
            return True
        else:
            print("❌ Failed to start multimodal session")
            return False
            
    except Exception as e:
        print(f"❌ Multimodal test failed: {e}")
        return False

def main():
    """Run all tests."""
    print("🧪 Testing Live API Integration")
    print("=" * 50)
    
    # Run basic test
    success1 = asyncio.run(test_live_api_integration())
    
    # Run multimodal test
    success2 = asyncio.run(test_multimodal_session())
    
    if success1 and success2:
        print("\n🎉 All integration tests passed!")
        print("\nNext steps:")
        print("1. Start your backend server: python start_live_backend.py")
        print("2. Test the API endpoints:")
        print("   curl http://localhost:5000/api/live/health")
        print("3. Open your frontend to test the full integration")
        return 0
    else:
        print("\n❌ Some tests failed. Please check the errors above.")
        return 1

if __name__ == "__main__":
    exit(main()) 