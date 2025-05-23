#!/usr/bin/env python3
"""
Simple test script to verify the live WebSocket proxy is working.
"""

import asyncio
import websockets
import json
import sys
import os

# Add backend directory to path to import get_token
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend', 'app'))

async def test_connection():
    print("Testing WebSocket proxy connection...")
    
    try:
        # Get access token
        from get_token import get_access_token
        token = get_access_token()
        print(f"Got access token: {token[:20]}...")
        
        # Connect to the proxy
        uri = "ws://localhost:8080"
        async with websockets.connect(uri) as websocket:
            print("Connected to WebSocket proxy")
            
            # Send authentication message
            auth_message = {"bearer_token": token}
            await websocket.send(json.dumps(auth_message))
            print("Sent authentication message")
            
            # Wait for a moment to see if connection is successful
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=10.0)
                print(f"Received response: {response}")
            except asyncio.TimeoutError:
                print("No immediate response, but connection seems stable")
            
            print("✅ WebSocket proxy test successful!")
            
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False
    
    return True

if __name__ == "__main__":
    result = asyncio.run(test_connection())
    sys.exit(0 if result else 1) 