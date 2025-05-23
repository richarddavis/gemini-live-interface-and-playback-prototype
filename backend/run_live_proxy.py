#!/usr/bin/env python3
"""
Script to run the Gemini Live API WebSocket proxy server.
"""

import sys
import os

# Add the app directory to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'app'))

from app.live_websocket_proxy import main
import asyncio

if __name__ == "__main__":
    print("Starting WebSocket proxy...")
    asyncio.run(main()) 